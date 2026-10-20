/** Two-factor authentication (TOTP + recovery codes). Secrets are sealed at rest and never logged. */
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { assertCan } from "../../lib/permissions";
import { verifyPassword } from "../../lib/auth/password";
import { db } from "../../db/client";
import { users } from "../../db/schema/core";
import { userSecurity } from "../../db/schema/audit-log";
import { generateRecoveryCodes, generateSecret, hashCode, otpauthUri, verifyTotp } from "../../modules/admin/lib/totp";
import { seal, unseal } from "../../modules/admin/lib/seal";
import { recordAudit } from "./audit";
import { revokeAllForUser } from "./sessions";

export type SecurityRow = typeof userSecurity.$inferSelect;

export function getSecurityRow(userId: string): SecurityRow {
  return db.select().from(userSecurity).where(eq(userSecurity.userId, userId)).get()
    ?? db.insert(userSecurity).values({ userId }).returning().get();
}

export const isEnabled = (userId: string): boolean => !!db.select({ e: userSecurity.totpEnabled }).from(userSecurity).where(eq(userSecurity.userId, userId)).get()?.e;

export function status(actor: Actor, userId: string = actor.id): { enabled: boolean; recoveryCodesLeft: number } {
  if (userId !== actor.id) assertCan(actor, "account:security");
  const r = getSecurityRow(userId);
  return { enabled: r.totpEnabled, recoveryCodesLeft: r.recoveryCodes.length };
}

/** Step 1: create a (not yet active) secret. Returns the secret for manual entry, the otpauth URI and a QR code (SVG). */
export async function beginSetup(actor: Actor): Promise<{ secret: string; uri: string; qrSvg: string }> {
  const row = getSecurityRow(actor.id);
  if (row.totpEnabled) throw new ValidationError("Two-factor authentication is already enabled");
  const user = db.select({ email: users.email }).from(users).where(eq(users.id, actor.id)).get();
  if (!user) throw new NotFoundError("User");
  const secret = generateSecret();
  db.update(userSecurity).set({ totpSecret: seal(secret), lastTotpStep: null }).where(eq(userSecurity.userId, actor.id)).run();
  const uri = otpauthUri(secret, user.email);
  return { secret, uri, qrSvg: await QRCode.toString(uri, { type: "svg", margin: 1, width: 192 }) };
}

/** Step 2: confirm with a code from the app. Enables 2FA and returns the recovery codes (shown once). */
export function confirmSetup(actor: Actor, code: string): { recoveryCodes: string[] } {
  const row = getSecurityRow(actor.id);
  if (row.totpEnabled) throw new ValidationError("Two-factor authentication is already enabled");
  if (!row.totpSecret) throw new ValidationError("Start the setup first");
  const step = verifyTotp(unseal(row.totpSecret), String(code ?? ""));
  if (step === null) throw new ValidationError("Invalid code");
  const codes = generateRecoveryCodes();
  db.update(userSecurity).set({ totpEnabled: true, recoveryCodes: codes.map(hashCode), lastTotpStep: step }).where(eq(userSecurity.userId, actor.id)).run();
  recordAudit(actor, "user.2fa_enabled", { targetType: "user", targetId: actor.id, targetName: actor.name ?? null });
  return { recoveryCodes: codes };
}

export function regenerateRecoveryCodes(actor: Actor): { recoveryCodes: string[] } {
  if (!isEnabled(actor.id)) throw new ValidationError("Two-factor authentication is not enabled");
  const codes = generateRecoveryCodes();
  db.update(userSecurity).set({ recoveryCodes: codes.map(hashCode) }).where(eq(userSecurity.userId, actor.id)).run();
  recordAudit(actor, "user.2fa_recovery_regenerated", { targetType: "user", targetId: actor.id });
  return { recoveryCodes: codes };
}

/** Turn 2FA off for yourself (password required). */
export async function disable(actor: Actor, password: string): Promise<void> {
  const u = db.select().from(users).where(eq(users.id, actor.id)).get();
  if (!u || !(await verifyPassword(password ?? "", u.passwordHash))) throw new ForbiddenError("Incorrect password");
  reset(actor, actor.id, true);
}

/** Admin reset (lost phone) or self disable. */
export function reset(actor: Actor, userId: string, self = false): void {
  if (userId !== actor.id) assertCan(actor, "account:security");
  else if (!self) assertCan(actor, "account:security");
  db.update(userSecurity).set({ totpEnabled: false, totpSecret: null, recoveryCodes: [], lastTotpStep: null }).where(eq(userSecurity.userId, userId)).run();
  if (userId !== actor.id) revokeAllForUser(userId, "2fa_reset");
  recordAudit(actor, "user.2fa_disabled", { targetType: "user", targetId: userId });
}

/**
 * Verify the second factor during login: a 6 digit TOTP code or a recovery code (consumed on use).
 * Replay protected: a code step can only be used once.
 */
export function verifySecondFactor(userId: string, input: { code?: string; recoveryCode?: string }): { ok: boolean; usedRecovery: boolean } {
  const row = getSecurityRow(userId);
  if (!row.totpEnabled || !row.totpSecret) return { ok: false, usedRecovery: false };
  if (input.recoveryCode) {
    const h = hashCode(input.recoveryCode);
    if (!row.recoveryCodes.includes(h)) return { ok: false, usedRecovery: false };
    db.update(userSecurity).set({ recoveryCodes: row.recoveryCodes.filter((c) => c !== h) }).where(eq(userSecurity.userId, userId)).run();
    return { ok: true, usedRecovery: true };
  }
  if (!input.code) return { ok: false, usedRecovery: false };
  const step = verifyTotp(unseal(row.totpSecret), input.code, { afterStep: row.lastTotpStep });
  if (step === null) return { ok: false, usedRecovery: false };
  db.update(userSecurity).set({ lastTotpStep: step }).where(eq(userSecurity.userId, userId)).run();
  return { ok: true, usedRecovery: false };
}
