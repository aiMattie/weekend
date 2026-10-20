/**
 * API tokens (module platform): personal tokens, hashed in the DB, shown once on creation.
 * `authenticate()` turns a token into an Actor (with `actor.token` carrying scopes and the
 * optional workspace restriction). Also: daily usage counters and the call audit trail.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError } from "../../lib/errors";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { apiCalls, apiTokens, apiUsage } from "../../db/schema/api-tokens";
import { users, workspaces } from "../../db/schema/core";
import { parse } from "./_shared";
import { recordAudit } from "./audit";

export type ApiToken = typeof apiTokens.$inferSelect;
export type ApiTokenPublic = Omit<ApiToken, "tokenHash"> & { userName?: string };

const createInput = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(["read", "write"])).min(1).default(["read", "write"]),
  workspaceIds: z.array(idSchema).nullish(),
  dailyBudget: z.number().int().min(1000).max(1_000_000_000).nullish(),
  expiresInDays: z.number().int().min(1).max(3650).nullish(),
  /** admins only: create the token for another user */
  userId: idSchema.optional(),
});

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
export const TOKEN_PREFIX = "wkd_";

const publicRow = ({ tokenHash: _h, ...rest }: ApiToken): ApiTokenPublic => rest; // eslint-disable-line @typescript-eslint/no-unused-vars

/** Create a token. The plaintext token is returned once and cannot be recovered later. */
export function create(actor: Actor, input: unknown): { token: string; row: ApiTokenPublic } {
  const d = parse(createInput, input);
  if (actor.isSystem && !d.userId) throw new ForbiddenError("System actors must pass userId");
  if (actor.token) throw new ForbiddenError("API tokens cannot create other tokens");
  const ownerId = d.userId && d.userId !== actor.id ? d.userId : actor.id;
  if (ownerId !== actor.id && !actor.isSystem && actor.role !== "admin") throw new ForbiddenError("Only admins can create tokens for other users");
  const owner = db.select().from(users).where(eq(users.id, ownerId)).get();
  if (!owner || owner.accountId !== actor.accountId) throw new NotFoundError("User");
  if (d.workspaceIds?.length) {
    for (const id of d.workspaceIds) {
      const ws = db.select({ accountId: workspaces.accountId }).from(workspaces).where(eq(workspaces.id, id)).get();
      if (!ws || ws.accountId !== actor.accountId) throw new NotFoundError(`Workspace ${id}`);
    }
  }
  const token = TOKEN_PREFIX + randomBytes(24).toString("base64url");
  const row = db.insert(apiTokens).values({
    userId: ownerId, name: d.name, tokenHash: hashToken(token), tokenPrefix: token.slice(0, 8), scopes: [...new Set(d.scopes)],
    workspaceIds: d.workspaceIds?.length ? d.workspaceIds : null, dailyBudget: d.dailyBudget ?? null,
    expiresAt: d.expiresInDays ? new Date(Date.now() + d.expiresInDays * 86_400_000).toISOString() : null,
  }).returning().get();
  recordAudit(actor, "token.created", { targetType: "token", targetId: row.id, targetName: row.name, tokenPrefix: row.tokenPrefix, scopes: row.scopes, workspaceIds: row.workspaceIds, forUserId: ownerId });
  return { token, row: publicRow(row) };
}

/** Own tokens (admins: `all` lists every token of the account). Newest first. */
export function list(actor: Actor, opts: { all?: boolean } = {}): ApiTokenPublic[] {
  const all = opts.all && (actor.isSystem || actor.role === "admin");
  const rows = db.select({ t: apiTokens, userName: users.name }).from(apiTokens).innerJoin(users, eq(users.id, apiTokens.userId))
    .where(and(eq(users.accountId, actor.accountId), all ? undefined : eq(apiTokens.userId, actor.id)))
    .orderBy(desc(apiTokens.createdAt)).all();
  return rows.map((r) => ({ ...publicRow(r.t), userName: r.userName }));
}

export function revoke(actor: Actor, id: string): ApiTokenPublic {
  const t = db.select().from(apiTokens).where(eq(apiTokens.id, id)).get();
  if (!t) throw new NotFoundError("API token");
  if (t.userId !== actor.id && !actor.isSystem && actor.role !== "admin") throw new NotFoundError("API token");
  const row = db.update(apiTokens).set({ revokedAt: t.revokedAt ?? new Date().toISOString() }).where(eq(apiTokens.id, id)).returning().get();
  recordAudit(actor, "token.revoked", { targetType: "token", targetId: row.id, targetName: row.name, tokenPrefix: row.tokenPrefix });
  return publicRow(row);
}

export function isRevokedOrExpired(t: Pick<ApiToken, "revokedAt" | "expiresAt">, now = Date.now()): boolean {
  return !!t.revokedAt || (!!t.expiresAt && Date.parse(t.expiresAt) < now);
}

const lastTouched = new Map<string, number>();

/** Resolve a plaintext token into an Actor, or null when unknown/revoked/expired/inactive user. */
export function authenticate(token: string): Actor | null {
  if (!token || token.length < 12) return null;
  const row = db.select({ t: apiTokens, u: users }).from(apiTokens).innerJoin(users, eq(users.id, apiTokens.userId))
    .where(eq(apiTokens.tokenHash, hashToken(token))).get();
  if (!row || isRevokedOrExpired(row.t) || !row.u.isActive) return null;
  const now = Date.now();
  if (now - (lastTouched.get(row.t.id) ?? 0) > 30_000) {
    lastTouched.set(row.t.id, now);
    db.update(apiTokens).set({ lastUsedAt: new Date(now).toISOString() }).where(eq(apiTokens.id, row.t.id)).run();
  }
  return {
    id: row.u.id, accountId: row.u.accountId, role: row.u.role, name: row.u.name, email: row.u.email, source: "api",
    token: { id: row.t.id, scopes: row.t.scopes, workspaceIds: row.t.workspaceIds, dailyBudget: row.t.dailyBudget },
  };
}

/* ------------------------------------------------------------ usage (daily budget) */

export const utcDay = (d = new Date()): string => d.toISOString().slice(0, 10);

export function usageToday(tokenId: string): { used: number; calls: number } {
  const r = db.select().from(apiUsage).where(and(eq(apiUsage.tokenId, tokenId), eq(apiUsage.day, utcDay()))).get();
  return { used: r?.used ?? 0, calls: r?.calls ?? 0 };
}

export function usageForTokens(ids: string[]): Record<string, { used: number; calls: number }> {
  const out: Record<string, { used: number; calls: number }> = {};
  for (const id of ids) out[id] = usageToday(id);
  return out;
}

export function addUsage(tokenId: string, cost: number): void {
  db.insert(apiUsage).values({ tokenId, day: utcDay(), used: cost, calls: 1 })
    .onConflictDoUpdate({ target: [apiUsage.tokenId, apiUsage.day], set: { used: sql`${apiUsage.used} + ${cost}`, calls: sql`${apiUsage.calls} + 1` } }).run();
}

/* ------------------------------------------------------------ audit trail */

export function recordCall(actor: Actor | null, c: { channel: "mcp" | "graphql" | "rest"; name: string; ok: boolean; error?: string; durationMs: number; detail?: Record<string, unknown> }): void {
  try {
    db.insert(apiCalls).values({
      tokenId: actor?.token?.id ?? null, userId: actor && !actor.isSystem ? actor.id : null, channel: c.channel, name: c.name,
      ok: c.ok, error: c.error?.slice(0, 500) ?? null, durationMs: Math.round(c.durationMs), detail: c.detail ?? {},
    }).run();
  } catch (err) {
    console.error("[api-tokens] audit failed", err);
  }
}

export function listCalls(actor: Actor, opts: { limit?: number; channel?: string; all?: boolean } = {}) {
  const all = opts.all && (actor.isSystem || actor.role === "admin");
  return db.select().from(apiCalls)
    .where(and(opts.channel ? eq(apiCalls.channel, opts.channel) : undefined, all ? undefined : eq(apiCalls.userId, actor.id)))
    .orderBy(desc(apiCalls.createdAt), desc(apiCalls.id)).limit(Math.min(opts.limit ?? 50, 500)).all();
}
