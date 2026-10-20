/**
 * SSO sign-in (Google and Microsoft): from verified id_token claims to a session.
 *
 * Matching policy: (1) the stored provider subject (user_identities), (2) the verified e-mail of an existing
 * active user (the subject is then linked), (3) no user: refuse, or auto-provision a Member when the admin enabled
 * that AND the domain is allowed. A user who already has another account of the same provider linked is never
 * matched by e-mail. We do not ask for our own TOTP (the provider handles MFA) but the panic lock and the IP
 * allow-list apply. Failures are audited with a reason code (never tokens or codes).
 * The `*Google*` functions are the Google shorthands of the provider-neutral `*Sso*` ones.
 */
import { and, eq, sql } from "drizzle-orm";
import type { Actor } from "../../lib/actor";
import { emit } from "../../lib/events";
import { db } from "../../db/client";
import { users } from "../../db/schema/core";
import { userSecurity } from "../../db/schema/audit-log";
import { userIdentities } from "../../db/schema/sso";
import { ipAllowed } from "../../modules/admin/lib/ip";
import { SsoError, checkClaims, type GoogleClaims, type SsoClaims, type SsoProvider } from "../sso/oauth";
import { getSettings } from "./account-settings";
import { recordAudit } from "./audit";
import { finalizeLogin } from "./login-flow";
import { effective, identityBySubject, identityOf, primaryAccountId, providerActive, providerConfigured } from "./sso-settings";

type UserRow = typeof users.$inferSelect;
export interface SignInCtx { ip?: string | null; userAgent?: string | null }
export interface GoogleSignIn { user: UserRow; token: string; sid: string; via: "subject" | "email" | "provisioned" }

const now = () => new Date().toISOString();
const userByEmail = (email: string): UserRow | null => db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).get() ?? null;
const userById = (id: string): UserRow | null => db.select().from(users).where(eq(users.id, id)).get() ?? null;

function audience(accountId: string, user: UserRow | null) {
  return { accountId, ...(user ? { id: user.id, name: user.name, email: user.email } : {}), source: "ui" as const };
}

/** Where did the provider account match (without side effects)? */
export function resolveUser(claims: SsoClaims, provider: SsoProvider = "google"): { user: UserRow | null; via: "subject" | "email" | null } {
  const idn = identityBySubject(claims.sub, provider);
  const bySub = idn ? userById(idn.userId) : null;
  if (bySub) return { user: bySub, via: "subject" };
  const byEmail = userByEmail(claims.email);
  return { user: byEmail, via: byEmail ? "email" : null };
}

function linkIdentity(provider: SsoProvider, user: UserRow, claims: SsoClaims, ctx: SignInCtx, actor?: Actor): void {
  db.insert(userIdentities).values({ provider, subject: claims.sub, userId: user.id, email: claims.email, lastLoginAt: now() }).run();
  recordAudit(actor ?? audience(user.accountId, user), "sso.identity_linked", { provider, email: claims.email, ip: ctx.ip, targetType: "user", targetId: user.id, targetName: user.name });
}

/** Panic lock and IP allow-list of the account (the proxy checks the IP too; this keeps the service safe on its own). */
function assertAccountOpen(accountId: string, ip: string | null | undefined): void {
  const settings = getSettings(accountId);
  if (settings.security.panic) throw new SsoError("locked", "panic_lock");
  if (!ipAllowed(ip ?? "127.0.0.1", settings.security.ipAllowlist)) throw new SsoError("locked", "ip_blocked");
}

function assertMayEnter(user: UserRow, ip: string | null | undefined): void {
  if (!user.isActive || user.isAiAgent) throw new SsoError("account_disabled", user.isAiAgent ? "ai_agent" : "inactive");
  assertAccountOpen(user.accountId, ip);
}

function provision(provider: SsoProvider, accountId: string, claims: SsoClaims, ctx: SignInCtx): UserRow {
  const name = (claims.name ?? claims.email.split("@")[0]).slice(0, 200);
  const photo = claims.picture && /^https:\/\//.test(claims.picture) ? claims.picture.slice(0, 500) : null;
  const user = db.transaction((tx) => {
    const u = tx.insert(users).values({ accountId, name, email: claims.email, passwordHash: null, role: "member", photoUrl: photo }).returning().get();
    tx.insert(userSecurity).values({ userId: u.id }).run();
    tx.insert(userIdentities).values({ provider, subject: claims.sub, userId: u.id, email: claims.email, lastLoginAt: now() }).run();
    return u;
  });
  emit({ type: "member.changed", boardId: null, actorId: user.id });
  recordAudit(audience(accountId, user), "sso.user_provisioned", { provider, email: claims.email, ip: ctx.ip, targetType: "user", targetId: user.id, targetName: user.name, role: "member" });
  recordAudit(audience(accountId, user), "sso.identity_linked", { provider, email: claims.email, ip: ctx.ip, targetType: "user", targetId: user.id, targetName: user.name });
  return user;
}

/** Sign in with verified claims. Throws SsoError (already audited as sso.login_failed). */
export async function signInWithSso(provider: SsoProvider, claims: SsoClaims, ctx: SignInCtx = {}): Promise<GoogleSignIn> {
  const seen: { accountId: string | null; user: UserRow | null } = { accountId: null, user: null };
  try {
    const { user, via } = resolveUser(claims, provider);
    const accountId = user?.accountId ?? primaryAccountId();
    seen.accountId = accountId; seen.user = user;
    if (!accountId) throw new SsoError("not_configured", "no_account_row");
    const s = effective(accountId);
    if (!providerActive(s, provider)) throw new SsoError("not_configured", providerConfigured(s, provider) ? "disabled_by_admin" : "env_missing");
    checkClaims(claims, s.allowedDomains);

    let signedIn: UserRow;
    let how: GoogleSignIn["via"];
    if (user) {
      assertMayEnter(user, ctx.ip);
      if (via === "email") {
        const other = identityOf(user.id, provider);
        if (other) throw new SsoError("no_account", "identity_mismatch"); // another account of this provider is linked to this user
        linkIdentity(provider, user, claims, ctx);
      } else {
        db.update(userIdentities).set({ email: claims.email, lastLoginAt: now() }).where(and(eq(userIdentities.provider, provider), eq(userIdentities.subject, claims.sub))).run();
      }
      signedIn = user; how = via ?? "email";
    } else {
      if (!s.autoProvision || s.allowedDomains.length === 0) throw new SsoError("no_account", s.autoProvision ? "auto_provision_without_domains" : "unknown_user");
      assertAccountOpen(accountId, ctx.ip);
      signedIn = provision(provider, accountId, claims, ctx);
      how = "provisioned";
    }
    const r = await finalizeLogin(signedIn, ctx, { via: provider });
    if (r.status !== "ok") throw new SsoError("idp_error", "session_failed");
    recordAudit(audience(accountId, signedIn), "sso.login_success", { provider, email: claims.email, match: how, ip: ctx.ip, userAgent: ctx.userAgent, targetType: "user", targetId: signedIn.id });
    return { user: signedIn, token: r.token, sid: r.sid, via: how };
  } catch (e) {
    if (e instanceof SsoError && seen.accountId) {
      recordAudit(audience(seen.accountId, seen.user), "sso.login_failed", { provider, reason: e.reason, result: e.code, email: claims.email, ip: ctx.ip, userAgent: ctx.userAgent });
    }
    throw e;
  }
}

export const signInWithGoogle = (claims: GoogleClaims, ctx: SignInCtx = {}): Promise<GoogleSignIn> => signInWithSso("google", claims, ctx);

/** Failure before any claims exist (state mismatch, provider error page, bad token): audited without PII. */
export function auditEarlyFailure(e: SsoError, ctx: SignInCtx, mode: string, provider: SsoProvider = "google"): void {
  const accountId = primaryAccountId();
  if (accountId) recordAudit({ accountId, source: "ui" }, "sso.login_failed", { provider, reason: e.reason, result: e.code, mode, ip: ctx.ip, userAgent: ctx.userAgent });
}

/** Profile > "Google / Microsoft koppelen": attach the verified provider account to the signed-in user. */
export function linkSsoToUser(provider: SsoProvider, actor: Actor, claims: SsoClaims, ctx: SignInCtx = {}): void {
  const s = effective(actor.accountId);
  if (!providerActive(s, provider)) throw new SsoError("not_configured", "link_inactive");
  checkClaims(claims, s.allowedDomains);
  const user = userById(actor.id);
  if (!user || !user.isActive) throw new SsoError("account_disabled", "link_inactive_user");
  const bySub = identityBySubject(claims.sub, provider);
  const own = identityOf(user.id, provider);
  if (bySub && bySub.userId !== user.id) throw new SsoError("already_linked", "subject_linked_elsewhere");
  if (own && own.subject !== claims.sub) throw new SsoError("already_linked", "user_has_other_identity");
  if (own) { db.update(userIdentities).set({ email: claims.email, lastLoginAt: now() }).where(eq(userIdentities.id, own.id)).run(); return; }
  linkIdentity(provider, user, claims, ctx, actor);
}

export const linkGoogleToUser = (actor: Actor, claims: GoogleClaims, ctx: SignInCtx = {}): void => linkSsoToUser("google", actor, claims, ctx);

/** Admin "Test inloggen": what would happen with this provider account? No session, no changes. */
export function previewSsoLogin(provider: SsoProvider, accountId: string, claims: SsoClaims): { outcome: "ok" | SsoError["code"]; match: "subject" | "email" | "auto_provision" | "none" } {
  const s = effective(accountId);
  try {
    checkClaims(claims, s.allowedDomains);
  } catch (e) {
    return { outcome: e instanceof SsoError ? e.code : "idp_error", match: "none" };
  }
  const { user, via } = resolveUser(claims, provider);
  if (user) return { outcome: !user.isActive || user.isAiAgent ? "account_disabled" : "ok", match: via ?? "none" };
  return s.autoProvision && s.allowedDomains.length ? { outcome: "ok", match: "auto_provision" } : { outcome: "no_account", match: "none" };
}

export const previewGoogleLogin = (accountId: string, claims: GoogleClaims) => previewSsoLogin("google", accountId, claims);
