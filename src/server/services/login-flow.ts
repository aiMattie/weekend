/**
 * Login with policy: password check, failed login lockout, account lock (panic button), TOTP / recovery
 * code second step and server side sessions. Used by POST /api/auth/login.
 *
 *   step 1  { email, password }                 -> ok | 2fa_required { challenge }
 *   step 2  { challenge, code | recoveryCode }  -> ok
 *   locked  admins can pass the panic lock with { email, password, panicCode }
 */
import { eq, sql } from "drizzle-orm";
import { ServiceError } from "../../lib/errors";
import { verifyPassword } from "../../lib/auth/password";
import { signSession } from "../../lib/auth/session";
import { db } from "../../db/client";
import { accounts, users } from "../../db/schema/core";
import { userSecurity } from "../../db/schema/audit-log";
import { signChallenge, verifyChallenge } from "../../modules/admin/lib/challenge";
import { getSettings } from "./account-settings";
import { recordAudit } from "./audit";
import { createSession } from "./sessions";
import { verifyPanicCode } from "./security";
import { getSecurityRow, isEnabled, verifySecondFactor } from "./twofactor";
import { isPasswordLoginBlocked } from "./sso-settings";

type UserRow = typeof users.$inferSelect;
export interface LoginContext { ip?: string | null; userAgent?: string | null }
export interface LoginInput { email?: string; password?: string; challenge?: string; code?: string; recoveryCode?: string; panicCode?: string }

export type LoginResult =
  | { status: "ok"; user: UserRow; token: string; sid: string; setup2fa: boolean }
  | { status: "2fa_required"; challenge: string };

export class LoginError extends ServiceError {
  constructor(message: string, code: "unauthorized" | "forbidden" = "unauthorized", status = 401, details?: unknown) {
    super(message, code, status, details);
  }
}

const GENERIC = "Onjuiste e-mail of wachtwoord";

function fail(user: UserRow | null, accountId: string | null, ctx: LoginContext, reason: string, email?: string): never {
  if (user) {
    const sec = getSecurityRow(user.id);
    const max = getSettings(user.accountId).security.maxFailedLogins;
    const failed = sec.failedLogins + 1;
    const lock = failed >= max;
    db.update(userSecurity).set({ failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + 15 * 60_000).toISOString() : sec.lockedUntil }).where(eq(userSecurity.userId, user.id)).run();
    recordAudit({ accountId: user.accountId, id: user.id, name: user.name, email: user.email, source: "ui" }, "user.login_failed", { reason, ip: ctx.ip, userAgent: ctx.userAgent, targetType: "user", targetId: user.id });
    if (lock) recordAudit({ accountId: user.accountId, source: "system" }, "user.locked", { targetType: "user", targetId: user.id, targetName: user.name, minutes: 15 });
  } else if (accountId) {
    recordAudit({ accountId, source: "ui" }, "user.login_failed", { reason, attempted: email, ip: ctx.ip, userAgent: ctx.userAgent });
  }
  throw new LoginError(GENERIC);
}

async function finalize(user: UserRow, ctx: LoginContext, extra: { recovery?: boolean; via: string }): Promise<LoginResult> {
  const s = createSession(user.id, { accountId: user.accountId, ip: ctx.ip, userAgent: ctx.userAgent, recovery: extra.recovery });
  db.update(userSecurity).set({ failedLogins: 0, lockedUntil: null }).where(eq(userSecurity.userId, user.id)).run();
  db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, user.id)).run();
  recordAudit({ accountId: user.accountId, id: user.id, name: user.name, email: user.email, source: "ui" }, "user.login", { via: extra.via, ip: ctx.ip, userAgent: ctx.userAgent, targetType: "user", targetId: user.id, targetName: user.name });
  const setup2fa = getSettings(user.accountId).security.twoFactorRequired && !isEnabled(user.id);
  return { status: "ok", user, token: await signSession(user.id, s.id), sid: s.id, setup2fa };
}

/** Used by SSO sign-in (google-sso.ts, Google and Microsoft): same session, audit and bookkeeping as a password login. */
export const finalizeLogin = finalize;

export async function authenticate(input: LoginInput, ctx: LoginContext = {}): Promise<LoginResult> {
  // step 2: second factor
  if (input.challenge) {
    const userId = await verifyChallenge(input.challenge, "2fa");
    const user = userId ? db.select().from(users).where(eq(users.id, userId)).get() ?? null : null;
    if (!user || !user.isActive) throw new LoginError("De inlogsessie is verlopen, log opnieuw in");
    const r = verifySecondFactor(user.id, { code: input.code, recoveryCode: input.recoveryCode });
    if (!r.ok) fail(user, user.accountId, ctx, "bad_second_factor");
    if (r.usedRecovery) recordAudit({ accountId: user.accountId, id: user.id, name: user.name, email: user.email }, "user.2fa_recovery_used", { targetType: "user", targetId: user.id });
    return finalize(user, ctx, { via: r.usedRecovery ? "recovery_code" : "totp" });
  }

  const email = (input.email ?? "").trim().toLowerCase();
  const user = email ? db.select().from(users).where(sql`lower(${users.email}) = ${email}`).get() ?? null : null;
  const anyAccount = user?.accountId ?? db.select({ id: accounts.id }).from(accounts).get()?.id ?? null;
  // "Alleen inloggen met SSO": password login is closed for everybody except break-glass admins
  if (anyAccount && isPasswordLoginBlocked(anyAccount, user?.id ?? null)) {
    recordAudit({ accountId: anyAccount, ...(user ? { id: user.id, name: user.name, email: user.email } : {}), source: "ui" }, "user.login_blocked", { reason: "sso_enforced", ip: ctx.ip });
    throw new LoginError("Inloggen met een wachtwoord is uitgeschakeld; log in met Google of Microsoft", "forbidden", 403, { code: "sso_enforced" });
  }
  if (!user || !user.isActive || user.isAiAgent) {
    await verifyPassword(input.password ?? "", null); // keep timing similar
    return fail(null, anyAccount, ctx, user ? "inactive" : "unknown_user", email);
  }
  const sec = getSecurityRow(user.id);
  if (sec.lockedUntil && sec.lockedUntil > new Date().toISOString()) {
    recordAudit({ accountId: user.accountId, id: user.id, name: user.name, email: user.email }, "user.login_failed", { reason: "locked", ip: ctx.ip });
    throw new LoginError("Te veel mislukte pogingen, probeer het over 15 minuten opnieuw", "forbidden", 429);
  }
  if (!(await verifyPassword(input.password ?? "", user.passwordHash))) return fail(user, user.accountId, ctx, "bad_password");

  const panic = getSettings(user.accountId).security.panic;
  if (panic) {
    if (user.role === "admin" && input.panicCode && verifyPanicCode(user.accountId, input.panicCode)) {
      return finalize(user, ctx, { recovery: true, via: "panic_recovery" });
    }
    recordAudit({ accountId: user.accountId, id: user.id, name: user.name, email: user.email }, "user.login_blocked", { reason: "account_locked", ip: ctx.ip });
    throw new LoginError("Het account is vergrendeld door een beheerder", "forbidden", 423, { code: "account_locked", adminRecovery: user.role === "admin" });
  }
  if (isEnabled(user.id)) return { status: "2fa_required", challenge: await signChallenge(user.id, "2fa") };
  return finalize(user, ctx, { via: "password" });
}
