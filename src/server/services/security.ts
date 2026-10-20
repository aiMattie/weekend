/**
 * Account security: settings (2FA policy, IP allow-list, password policy, session timeout, retention),
 * panic button, SAML/SSO stub settings and the SCIM token. All writes need `account:security` and are audited.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ValidationError } from "../../lib/errors";
import { assertCan } from "../../lib/permissions";
import { db } from "../../db/client";
import { accounts } from "../../db/schema/core";
import { authSessions } from "../../db/schema/audit-log";
import { isValidEntry, ipAllowed } from "../../modules/admin/lib/ip";
import { invalidateIpCache } from "../../modules/admin/ip-policy";
import { randomToken, sha256 } from "../../modules/admin/lib/seal";
import { getSettings, patchSettings, type AccountSettings, type PasswordPolicy } from "./account-settings";
import { recordAudit } from "./audit";
import { revokeAllForAccount } from "./sessions";
import { parse } from "./_shared";

/* ------------------------------------------------------------------ settings */

const policySchema = z.object({
  minLength: z.number().int().min(8).max(128),
  requireUpper: z.boolean(),
  requireNumber: z.boolean(),
  requireSymbol: z.boolean(),
  maxAgeDays: z.number().int().min(1).max(730).nullable(),
}).partial();

const securityInput = z.object({
  twoFactorRequired: z.boolean().optional(),
  ipAllowlist: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
  passwordPolicy: policySchema.optional(),
  sessionTimeoutDays: z.number().int().min(1).max(90).optional(),
  maxFailedLogins: z.number().int().min(3).max(50).optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
});

export type SecuritySettings = AccountSettings["security"] & { retentionDays: number; scimConfigured: boolean; scimPrefix: string | null };

export function get(actor: Actor): SecuritySettings {
  assertCan(actor, "account:security");
  const s = getSettings(actor.accountId);
  return { ...s.security, retentionDays: s.retentionDays, scimConfigured: !!s.scim, scimPrefix: s.scim?.prefix ?? null };
}

/** `ctx.ip` = the admin's own address: saving an allow-list that would lock the admin out is refused. */
export function update(actor: Actor, input: unknown, ctx: { ip?: string } = {}): SecuritySettings {
  assertCan(actor, "account:security");
  const d = parse(securityInput, input);
  if (d.ipAllowlist) {
    const bad = d.ipAllowlist.filter((e) => !isValidEntry(e));
    if (bad.length) throw new ValidationError(`Invalid IP address or range: ${bad.join(", ")}`);
    if (d.ipAllowlist.length && ctx.ip && !ipAllowed(ctx.ip, d.ipAllowlist)) {
      throw new ValidationError(`Your own IP address (${ctx.ip}) is not on the list; you would lock yourself out`);
    }
  }
  const before = getSettings(actor.accountId);
  patchSettings(actor.accountId, (s) => {
    if (d.twoFactorRequired !== undefined) s.security.twoFactorRequired = d.twoFactorRequired;
    if (d.ipAllowlist) s.security.ipAllowlist = d.ipAllowlist.map((e) => e.trim());
    if (d.passwordPolicy) s.security.passwordPolicy = { ...s.security.passwordPolicy, ...d.passwordPolicy } as PasswordPolicy;
    if (d.sessionTimeoutDays !== undefined) s.security.sessionTimeoutDays = d.sessionTimeoutDays;
    if (d.maxFailedLogins !== undefined) s.security.maxFailedLogins = d.maxFailedLogins;
    if (d.retentionDays !== undefined) s.retentionDays = d.retentionDays;
  });
  invalidateIpCache();
  const changed = Object.keys(d).filter((k) => JSON.stringify((d as Record<string, unknown>)[k]) !== JSON.stringify((before.security as Record<string, unknown>)[k] ?? (before as unknown as Record<string, unknown>)[k]));
  recordAudit(actor, "security.settings_changed", { changed, ipAllowlistCount: d.ipAllowlist?.length, twoFactorRequired: d.twoFactorRequired });
  return get(actor);
}

/* ------------------------------------------------------------------ password policy */

/** Human readable (nl) violations; empty = ok. */
export function passwordViolations(accountId: string, password: string): string[] {
  const p = getSettings(accountId).security.passwordPolicy;
  const out: string[] = [];
  if (password.length < p.minLength) out.push(`Minimaal ${p.minLength} tekens`);
  if (p.requireUpper && !/[A-Z]/.test(password)) out.push("Minimaal een hoofdletter");
  if (p.requireNumber && !/\d/.test(password)) out.push("Minimaal een cijfer");
  if (p.requireSymbol && !/[^A-Za-z0-9]/.test(password)) out.push("Minimaal een speciaal teken");
  return out;
}

export function assertPasswordPolicy(accountId: string, password: string): void {
  const v = passwordViolations(accountId, password);
  if (v.length) throw new ValidationError(v.join("; "), v);
}

/* ------------------------------------------------------------------ panic button */

export function newRecoveryCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

/**
 * Lock the account: every session is revoked except the caller's current one (marked as recovery session),
 * logins are refused (except admins with the recovery code) and API tokens stop working.
 * Returns the recovery code (shown once).
 */
export function panic(actor: Actor, currentSid?: string | null): { recoveryCode: string; revoked: number } {
  assertCan(actor, "account:security");
  const code = newRecoveryCode();
  patchSettings(actor.accountId, (s) => { s.security.panic = { lockedAt: new Date().toISOString(), lockedBy: actor.id, recoveryHash: sha256(code.replace(/-/g, "")) }; });
  const revoked = revokeAllForAccount(actor.accountId, "panic");
  // the admin who pressed the button keeps working in a recovery session
  if (currentSid) db.update(authSessions).set({ revokedAt: null, revokedReason: null, recovery: true }).where(eq(authSessions.id, currentSid)).run();
  recordAudit(actor, "security.panic_activated", { revoked });
  return { recoveryCode: code, revoked };
}

export function unlock(actor: Actor): void {
  assertCan(actor, "account:security");
  if (!getSettings(actor.accountId).security.panic) return;
  patchSettings(actor.accountId, (s) => { s.security.panic = null; });
  recordAudit(actor, "security.panic_released", {});
}

export function verifyPanicCode(accountId: string, code: string): boolean {
  const p = getSettings(accountId).security.panic;
  if (!p || !code) return false;
  const a = Buffer.from(sha256(code.replace(/[-\s]/g, "")));
  const b = Buffer.from(p.recoveryHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const panicStatus = (accountId: string): { locked: boolean; lockedAt: string | null } => {
  const p = getSettings(accountId).security.panic;
  return { locked: !!p, lockedAt: p?.lockedAt ?? null };
};

/* ------------------------------------------------------------------ SAML / SSO (stub) */

const ssoInput = z.object({
  enabled: z.boolean().optional(),
  entityId: z.string().trim().max(500).optional(),
  ssoUrl: z.string().trim().max(500).refine((v) => v === "" || /^https:\/\//.test(v), "SSO URL must start with https://").optional(),
  certificate: z.string().trim().max(10_000).optional(),
  domains: z.array(z.string().trim().toLowerCase().max(100)).max(20).optional(),
});

/** Settings screen data. `connected` is always false: there is no SAML exchange, only the fields. */
export function getSso(actor: Actor, origin = "http://localhost:3000") {
  assertCan(actor, "account:security");
  const s = getSettings(actor.accountId).sso;
  return {
    ...s, connected: false as const,
    sp: { entityId: `${origin}/api/auth/saml/metadata`, acsUrl: `${origin}/api/auth/saml/acs`, metadataUrl: `${origin}/api/auth/saml/metadata` },
  };
}

export function updateSso(actor: Actor, input: unknown, origin?: string) {
  assertCan(actor, "account:security");
  const d = parse(ssoInput, input);
  patchSettings(actor.accountId, (s) => { s.sso = { ...s.sso, ...d, connected: false }; });
  recordAudit(actor, "sso.settings_changed", { enabled: d.enabled, domains: d.domains });
  return getSso(actor, origin);
}

/* ------------------------------------------------------------------ SCIM token */

/** Creates (or rotates) the SCIM bearer token. The token is returned once and only its hash is stored. */
export function createScimToken(actor: Actor): { token: string; prefix: string } {
  assertCan(actor, "account:security");
  const token = `scim_${randomToken(24)}`;
  const prefix = token.slice(0, 10);
  patchSettings(actor.accountId, (s) => { s.scim = { tokenHash: sha256(token), prefix, createdAt: new Date().toISOString() }; });
  recordAudit(actor, "token.created", { kind: "scim", tokenPrefix: prefix });
  return { token, prefix };
}

export function revokeScimToken(actor: Actor): void {
  assertCan(actor, "account:security");
  patchSettings(actor.accountId, (s) => { s.scim = null; });
  recordAudit(actor, "token.revoked", { kind: "scim" });
}

/** Resolve a SCIM bearer token to its account id (constant time compare). */
export function authenticateScim(token: string): string | null {
  if (!token.startsWith("scim_")) return null;
  const h = Buffer.from(sha256(token));
  for (const a of db.select({ id: accounts.id }).from(accounts).all()) {
    const stored = getSettings(a.id).scim?.tokenHash;
    if (!stored) continue;
    const b = Buffer.from(stored);
    if (b.length === h.length && timingSafeEqual(b, h)) return a.id;
  }
  return null;
}
