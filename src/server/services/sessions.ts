/**
 * Server side session registry. The session cookie (JWT) carries a `sid`; this table decides whether
 * the session is still alive (revoked, expired, account locked by the panic button).
 */
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError } from "../../lib/errors";
import { assertCan } from "../../lib/permissions";
import { db } from "../../db/client";
import { users } from "../../db/schema/core";
import { authSessions } from "../../db/schema/audit-log";
import { getSettings } from "./account-settings";
import { recordAudit } from "./audit";

export type SessionRow = typeof authSessions.$inferSelect;
const TOUCH_EVERY_MS = 60_000;

export function createSession(userId: string, opts: { ip?: string | null; userAgent?: string | null; recovery?: boolean; accountId: string }): SessionRow {
  const days = getSettings(opts.accountId).security.sessionTimeoutDays;
  return db.insert(authSessions).values({
    userId, ip: opts.ip ?? null, userAgent: opts.userAgent?.slice(0, 300) ?? null, recovery: !!opts.recovery,
    expiresAt: new Date(Date.now() + days * 86400_000).toISOString(),
  }).returning().get();
}

/**
 * Is the session identified by `sid` valid for `userId` right now? Sessions without a `sid` (cookies from
 * before sessions existed) are accepted unless the account is locked.
 * Touches lastSeenAt at most once a minute.
 */
export function isSessionAlive(userId: string, sid: string | null | undefined, accountId: string): boolean {
  const panic = getSettings(accountId).security.panic;
  if (!sid) return !panic;
  const s = db.select().from(authSessions).where(eq(authSessions.id, sid)).get();
  if (!s || s.userId !== userId || s.revokedAt || s.expiresAt < new Date().toISOString()) return false;
  if (panic && !s.recovery) return false;
  if (Date.now() - Date.parse(s.lastSeenAt) > TOUCH_EVERY_MS) {
    db.update(authSessions).set({ lastSeenAt: new Date().toISOString() }).where(eq(authSessions.id, sid)).run();
  }
  return true;
}

export function revokeAllForUser(userId: string, reason: string, exceptSid?: string): number {
  return db.update(authSessions).set({ revokedAt: new Date().toISOString(), revokedReason: reason })
    .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt), exceptSid ? ne(authSessions.id, exceptSid) : undefined)).run().changes;
}

export function revokeAllForAccount(accountId: string, reason: string, exceptUserId?: string): number {
  const ids = db.select({ id: users.id }).from(users).where(eq(users.accountId, accountId)).all().map((u) => u.id);
  let n = 0;
  for (const id of ids) if (id !== exceptUserId) n += revokeAllForUser(id, reason);
  return n;
}

export function revokeOne(sid: string, reason: string): void {
  db.update(authSessions).set({ revokedAt: new Date().toISOString(), revokedReason: reason }).where(and(eq(authSessions.id, sid), isNull(authSessions.revokedAt))).run();
}

export interface SessionInfo { id: string; ip: string | null; userAgent: string | null; createdAt: string; lastSeenAt: string; current: boolean; recovery: boolean }

/** Active sessions of a user (self, or any user for account:security). */
export function list(actor: Actor, userId: string = actor.id, currentSid?: string | null): SessionInfo[] {
  if (userId !== actor.id) assertCan(actor, "account:security");
  const now = new Date().toISOString();
  return db.select().from(authSessions)
    .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now)))
    .orderBy(desc(authSessions.lastSeenAt)).all()
    .map((s) => ({ id: s.id, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.id === currentSid, recovery: s.recovery }));
}

export function revoke(actor: Actor, sid: string): void {
  const s = db.select().from(authSessions).where(eq(authSessions.id, sid)).get();
  if (!s) throw new NotFoundError("Session");
  if (s.userId !== actor.id) {
    assertCan(actor, "account:security");
    const owner = db.select({ accountId: users.accountId }).from(users).where(eq(users.id, s.userId)).get();
    if (owner?.accountId !== actor.accountId) throw new ForbiddenError();
  }
  revokeOne(sid, "revoked");
  recordAudit(actor, "session.revoked", { targetType: "user", targetId: s.userId, sessionId: sid });
}

export function revokeOthers(actor: Actor, currentSid: string | null): number {
  const n = revokeAllForUser(actor.id, "revoked_others", currentSid ?? undefined);
  recordAudit(actor, "session.revoked_all", { count: n });
  return n;
}
