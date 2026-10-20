/**
 * SSO settings (accounts.settings.googleSso = shared policy + Google on/off, accounts.settings.microsoftSso =
 * Microsoft on/off), the linked identities and the enforcement rule ("Alleen inloggen met SSO"). No sign-in
 * logic here (see google-sso.ts), so login-flow.ts can import the enforcement check without a cycle.
 * Enforcement only counts while at least one provider is configured AND enabled: removing the env vars can
 * never lock everybody out.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { assertCan } from "../../lib/permissions";
import { db } from "../../db/client";
import { accounts, users } from "../../db/schema/core";
import { userIdentities } from "../../db/schema/sso";
import { appUrl, envChecks, envDomains, isConfigured, parseDomains, redirectUri } from "../sso/config";
import { isMicrosoftConfigured, isSingleTenant, microsoftEnvChecks, microsoftRedirectUri, microsoftTenant } from "../sso/microsoft";
import type { SsoProvider } from "../sso/oauth";
import { getSettings, patchSettings } from "./account-settings";
import { recordAudit } from "./audit";
import { parse } from "./_shared";

export const PROVIDER: SsoProvider = "google";
export const PROVIDER_LABEL: Record<SsoProvider, string> = { google: "Google", microsoft: "Microsoft" };
export type IdentityRow = typeof userIdentities.$inferSelect;

export interface ProviderStatus { configured: boolean; enabled: boolean; /** configured && enabled */ active: boolean }
export interface EffectiveSso extends ProviderStatus {
  /** `configured` / `enabled` / `active` at the top level are Google's (kept for existing callers) */
  microsoft: ProviderStatus;
  allowedDomains: string[]; autoProvision: boolean; enforceSso: boolean; /** enforceSso && (Google or Microsoft active) */ enforced: boolean;
  breakGlassUserIds: string[];
}

export function effective(accountId: string): EffectiveSso {
  const all = getSettings(accountId);
  const s = all.googleSso;
  const configured = isConfigured();
  const active = configured && s.enabled;
  const msConfigured = isMicrosoftConfigured();
  const microsoft = { configured: msConfigured, enabled: all.microsoftSso.enabled, active: msConfigured && all.microsoftSso.enabled };
  return {
    configured, enabled: s.enabled, active, microsoft,
    allowedDomains: [...new Set([...envDomains(), ...s.allowedDomains])],
    autoProvision: s.autoProvision, enforceSso: s.enforceSso, enforced: (active || microsoft.active) && s.enforceSso, breakGlassUserIds: s.breakGlassUserIds,
  };
}

/** Is this provider configured and switched on for the account? */
export const providerActive = (e: EffectiveSso, provider: SsoProvider): boolean => (provider === "microsoft" ? e.microsoft.active : e.active);
export const providerConfigured = (e: EffectiveSso, provider: SsoProvider): boolean => (provider === "microsoft" ? e.microsoft.configured : e.configured);

export const primaryAccountId = (): string | null => db.select({ id: accounts.id }).from(accounts).orderBy(asc(accounts.createdAt), asc(accounts.id)).get()?.id ?? null;

/** What the login page needs (no secrets): which SSO buttons are shown, is the password form hidden. */
export function loginOptions(): { google: boolean; microsoft: boolean; enforced: boolean } {
  const id = primaryAccountId();
  if (!id) return { google: false, microsoft: false, enforced: false };
  const e = effective(id);
  return { google: e.active, microsoft: e.microsoft.active, enforced: e.enforced };
}

/** true = this user (or unknown e-mail) may not sign in with a password. Break-glass admins always may. */
export function isPasswordLoginBlocked(accountId: string, userId: string | null): boolean {
  const e = effective(accountId);
  return e.enforced && !(userId && e.breakGlassUserIds.includes(userId));
}

/* ------------------------------------------------------------------ identities */

export const identityOf = (userId: string, provider: SsoProvider = PROVIDER): IdentityRow | null =>
  db.select().from(userIdentities).where(and(eq(userIdentities.userId, userId), eq(userIdentities.provider, provider))).get() ?? null;

export const identityBySubject = (subject: string, provider: SsoProvider = PROVIDER): IdentityRow | null =>
  db.select().from(userIdentities).where(and(eq(userIdentities.provider, provider), eq(userIdentities.subject, subject))).get() ?? null;

/** Any linked SSO identity (Google or Microsoft) of this user. */
export const hasAnyIdentity = (userId: string): boolean => !!db.select({ id: userIdentities.id }).from(userIdentities).where(eq(userIdentities.userId, userId)).get();

/** A user can fall back to a password only when one exists and password login is not blocked for them. */
function hasWorkingPassword(userId: string, accountId: string): boolean {
  const u = db.select({ pw: users.passwordHash }).from(users).where(eq(users.id, userId)).get();
  return !!u?.pw && !isPasswordLoginBlocked(accountId, userId);
}

/** Another way in besides this identity: a working password or a second linked provider that is active. */
function hasOtherWayIn(userId: string, accountId: string, provider: SsoProvider): boolean {
  if (hasWorkingPassword(userId, accountId)) return true;
  const e = effective(accountId);
  return db.select().from(userIdentities).where(eq(userIdentities.userId, userId)).all()
    .some((i) => i.provider !== provider && (i.provider === "google" || i.provider === "microsoft") && providerActive(e, i.provider));
}

export function unlinkIdentity(actor: Actor, identityId: string): void {
  const idn = db.select().from(userIdentities).where(eq(userIdentities.id, identityId)).get();
  const owner = idn ? db.select().from(users).where(eq(users.id, idn.userId)).get() : null;
  if (!idn || !owner || owner.accountId !== actor.accountId) throw new NotFoundError("Identity");
  if (owner.id !== actor.id) assertCan(actor, "account:security");
  else if (!hasOtherWayIn(owner.id, owner.accountId, idn.provider as SsoProvider)) {
    throw new ForbiddenError(`Je kunt je ${PROVIDER_LABEL[idn.provider as SsoProvider] ?? "SSO"}-account niet ontkoppelen: het is je enige manier om in te loggen. Stel eerst een wachtwoord in of vraag een beheerder om hulp.`);
  }
  db.delete(userIdentities).where(eq(userIdentities.id, identityId)).run();
  recordAudit(actor, "sso.identity_unlinked", { provider: idn.provider, targetType: "user", targetId: owner.id, targetName: owner.name, selfService: owner.id === actor.id });
}

export interface ProfileGoogle { available: boolean; identity: { id: string; email: string; createdAt: string; lastLoginAt: string | null } | null; canUnlink: boolean; unlinkBlocked: string | null }

export function profileView(actor: Actor, provider: SsoProvider = PROVIDER): ProfileGoogle {
  const e = effective(actor.accountId);
  const idn = identityOf(actor.id, provider);
  const canUnlink = !!idn && hasOtherWayIn(actor.id, actor.accountId, provider);
  return {
    available: providerActive(e, provider) || !!idn,
    identity: idn ? { id: idn.id, email: idn.email, createdAt: idn.createdAt, lastLoginAt: idn.lastLoginAt } : null,
    canUnlink,
    unlinkBlocked: idn && !canUnlink ? "Dit is je enige manier om in te loggen; stel eerst een wachtwoord in." : null,
  };
}

/* ------------------------------------------------------------------ admin view + settings */

export interface AdminSsoView {
  configured: boolean; active: boolean; status: "configured" | "not_configured";
  microsoft: {
    configured: boolean; active: boolean; enabled: boolean; tenant: string; singleTenant: boolean;
    redirectUris: { label: "current"; uri: string }[]; env: { name: string; present: boolean; required: boolean }[];
  };
  appUrl: string; redirectUris: { label: "current"; uri: string }[];
  env: { name: string; present: boolean; required: boolean }[];
  settings: { enabled: boolean; allowedDomains: string[]; autoProvision: boolean; enforceSso: boolean; breakGlassUserIds: string[] };
  envDomains: string[]; effectiveDomains: string[]; enforced: boolean;
  currentAdminLinked: boolean;
  identities: { id: string; provider: SsoProvider; userId: string; userName: string; userEmail: string; email: string; createdAt: string; lastLoginAt: string | null }[];
  admins: { id: string; name: string; email: string; linked: boolean; breakGlass: boolean }[];
}

export function adminView(actor: Actor): AdminSsoView {
  assertCan(actor, "account:security");
  const e = effective(actor.accountId);
  const s = getSettings(actor.accountId).googleSso;
  const current = redirectUri();
  const rows = db.select({ i: userIdentities, name: users.name, userEmail: users.email }).from(userIdentities)
    .innerJoin(users, eq(users.id, userIdentities.userId)).where(eq(users.accountId, actor.accountId))
    .orderBy(asc(users.name), asc(userIdentities.provider)).all();
  const linkedIds = new Set(rows.map((r) => r.i.userId));
  const admins = db.select().from(users).where(and(eq(users.accountId, actor.accountId), eq(users.role, "admin"), eq(users.isActive, true), eq(users.isAiAgent, false))).orderBy(asc(users.name)).all();
  return {
    configured: e.configured, active: e.active, status: e.configured ? "configured" : "not_configured",
    microsoft: {
      ...e.microsoft, tenant: microsoftTenant(), singleTenant: isSingleTenant(),
      redirectUris: [{ label: "current", uri: microsoftRedirectUri() }],
      env: microsoftEnvChecks(),
    },
    appUrl: appUrl(),
    redirectUris: [{ label: "current", uri: current }],
    env: envChecks(),
    settings: { enabled: s.enabled, allowedDomains: s.allowedDomains, autoProvision: s.autoProvision, enforceSso: s.enforceSso, breakGlassUserIds: s.breakGlassUserIds },
    envDomains: envDomains(), effectiveDomains: e.allowedDomains, enforced: e.enforced,
    currentAdminLinked: linkedIds.has(actor.id),
    identities: rows.map((r) => ({ id: r.i.id, provider: r.i.provider as SsoProvider, userId: r.i.userId, userName: r.name, userEmail: r.userEmail, email: r.i.email, createdAt: r.i.createdAt, lastLoginAt: r.i.lastLoginAt })),
    admins: admins.map((a) => ({ id: a.id, name: a.name, email: a.email, linked: linkedIds.has(a.id), breakGlass: s.breakGlassUserIds.includes(a.id) })),
  };
}

const updateInput = z.object({
  enabled: z.boolean().optional(),
  microsoftEnabled: z.boolean().optional(),
  allowedDomains: z.array(z.string().trim().max(100)).max(30).optional(),
  autoProvision: z.boolean().optional(),
  enforceSso: z.boolean().optional(),
  breakGlassUserIds: z.array(z.string().max(40)).max(50).optional(),
});

export function updateSettings(actor: Actor, input: unknown): AdminSsoView {
  assertCan(actor, "account:security");
  const d = parse(updateInput, input);
  const before = getSettings(actor.accountId).googleSso;
  let domains = before.allowedDomains;
  if (d.allowedDomains) {
    domains = parseDomains(d.allowedDomains);
    const bad = d.allowedDomains.filter((x) => x.trim() && !parseDomains([x]).length);
    if (bad.length) throw new ValidationError(`Ongeldig domein: ${bad.join(", ")}`);
  }
  const next = { ...before, ...(d.enabled !== undefined && { enabled: d.enabled }), allowedDomains: domains, ...(d.autoProvision !== undefined && { autoProvision: d.autoProvision }), ...(d.enforceSso !== undefined && { enforceSso: d.enforceSso }) };
  if (d.breakGlassUserIds) {
    const ok = new Set(db.select({ id: users.id }).from(users).where(and(eq(users.accountId, actor.accountId), eq(users.role, "admin"), eq(users.isActive, true))).all().map((u) => u.id));
    if (d.breakGlassUserIds.some((id) => !ok.has(id))) throw new ValidationError("Noodtoegang kan alleen aan actieve beheerders worden gegeven");
    next.breakGlassUserIds = [...new Set(d.breakGlassUserIds)];
  }
  const merged = [...new Set([...envDomains(), ...next.allowedDomains])];
  if (next.autoProvision && merged.length === 0) throw new ValidationError("Stel eerst minimaal één toegestaan domein in voordat je nieuwe gebruikers automatisch aanmaakt");
  const msBefore = getSettings(actor.accountId).microsoftSso.enabled;
  const msEnabled = d.microsoftEnabled ?? msBefore;
  if (next.enforceSso && !before.enforceSso) {
    const googleOn = isConfigured() && next.enabled;
    const msOn = isMicrosoftConfigured() && msEnabled;
    if (!googleOn && !msOn) throw new ValidationError("Google- en Microsoft-login zijn niet geconfigureerd of staan uit; 'Alleen inloggen met SSO' kan nu niet aan");
    const own = (googleOn && identityOf(actor.id, "google")) || (msOn && identityOf(actor.id, "microsoft"));
    if (!own) throw new ValidationError("Koppel eerst je eigen Google- of Microsoft-account (Profiel) voordat je 'Alleen inloggen met SSO' aanzet, anders kun je jezelf buitensluiten");
  }
  patchSettings(actor.accountId, (s) => { s.googleSso = next; s.microsoftSso = { enabled: msEnabled }; });
  const changed: string[] = (Object.keys(next) as (keyof typeof next)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(before[k]));
  if (msEnabled !== msBefore) changed.push("microsoftEnabled");
  recordAudit(actor, "sso.settings_changed", { provider: PROVIDER, changed, enabled: next.enabled, microsoftEnabled: msEnabled, autoProvision: next.autoProvision, enforceSso: next.enforceSso, domainCount: next.allowedDomains.length });
  return adminView(actor);
}

/**
 * Recovery path (scripts/break-glass.ts, `npm run auth:break-glass -- <email>`): turn enforcement off for the
 * account of this user and flag them as break-glass admin when they are an admin. Returns false for unknown e-mails.
 */
export function disableEnforcementFor(email: string): { found: boolean; wasEnforced: boolean; admin: boolean } {
  const u = db.select().from(users).where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`).get();
  if (!u) return { found: false, wasEnforced: false, admin: false };
  const was = getSettings(u.accountId).googleSso.enforceSso;
  patchSettings(u.accountId, (s) => {
    s.googleSso.enforceSso = false;
    if (u.role === "admin" && !s.googleSso.breakGlassUserIds.includes(u.id)) s.googleSso.breakGlassUserIds.push(u.id);
  });
  recordAudit({ accountId: u.accountId, source: "system" }, "sso.enforcement_disabled", { provider: PROVIDER, via: "break_glass_script", targetType: "user", targetId: u.id, targetName: u.name, wasEnforced: was });
  return { found: true, wasEnforced: was, admin: u.role === "admin" };
}
