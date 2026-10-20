/**
 * Audit log. `recordAudit(actor, event, details)` is the entry point every module may call
 * (platform: token.created, mcp.call, api.call; exports: export.board ...). It never throws and
 * never stores secrets (values of keys that look like secrets are redacted).
 *
 * Reading (list / CSV / JSON API for SIEM) needs `account:audit`. Retention is applied lazily.
 * The bus subscriber at the bottom records board / workspace deletes without touching those services.
 */
import { and, desc, eq, gte, like, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { subscribe } from "../../lib/events";
import { assertCan } from "../../lib/permissions";
import { db } from "../../db/client";
import { boards, users, workspaces } from "../../db/schema/core";
import { auditLog, type AuditCategory } from "../../db/schema/audit-log";
import { toCsv } from "../../modules/admin/lib/csv";
import { getSettings } from "./account-settings";
import { parse } from "./_shared";

export type AuditRow = typeof auditLog.$inferSelect;

/** Actor-like input: a full Actor, or just the account for anonymous events (failed login). */
export type AuditActor = (Pick<Actor, "accountId"> & Partial<Omit<Actor, "accountId" | "source">> & { source?: Actor["source"] | "scim" }) | null;

export interface AuditDetails {
  category?: AuditCategory;
  targetType?: string;
  targetId?: string | null;
  targetName?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  [key: string]: unknown;
}

const RESERVED = new Set(["category", "targetType", "targetId", "targetName", "ip", "userAgent"]);
const SECRET_KEY = /pass(word)?|secret|token|recovery|code|hash|authorization|api[_-]?key|certificate/i;
const SAFE_SUFFIX = /(Prefix|Id|Ids|Count|Name|Type|At)$/;

export const EVENT_CATEGORIES: Record<string, AuditCategory> = {
  user: "auth", session: "auth", auth: "auth", login: "auth",
  role: "permission", permission: "permission", guest: "permission", team: "permission", member: "permission", invitation: "permission",
  board: "content", workspace: "content", item: "content",
  security: "security", panic: "security", sso: "security", scim: "security", twofactor: "security", token: "security", ip: "security",
  api: "api", mcp: "api", graphql: "api", export: "export", account: "admin", audit: "admin", plan: "admin",
};

const EVENT_OVERRIDES: Record<string, AuditCategory> = {
  "user.role_changed": "permission", "user.deactivated": "permission", "user.reactivated": "permission",
  "user.locked": "security", "user.password_changed": "security", "user.login_blocked": "security",
  "user.2fa_enabled": "security", "user.2fa_disabled": "security", "user.2fa_recovery_used": "security", "user.2fa_recovery_regenerated": "security",
  "invitation.accepted": "auth", "board.deleted": "content", "workspace.deleted": "content", "token.created": "security", "token.revoked": "security",
};

export function categoryOf(event: string): AuditCategory {
  if (EVENT_OVERRIDES[event]) return EVENT_OVERRIDES[event];
  return EVENT_CATEGORIES[event.split(".")[0]] ?? "admin";
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) && !SAFE_SUFFIX.test(k) ? "[redacted]" : redact(v, depth + 1);
  return out;
}

const lastPurge = new Map<string, number>();

/** Write one audit entry. Returns the row id (or null when writing failed). */
export function recordAudit(actor: AuditActor, event: string, details: AuditDetails = {}): string | null {
  try {
    if (!actor) return null;
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(details)) if (!RESERVED.has(k) && v !== undefined) rest[k] = v;
    const actorId = actor.isSystem ? null : (actor.id ?? null);
    let name = actor.name ?? (actor.isSystem ? "System" : null);
    let email = actor.email ?? null;
    if (actorId && (!name || !email)) {
      const u = db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, actorId)).get();
      name = name ?? u?.name ?? null;
      email = email ?? u?.email ?? null;
    }
    const row = db.insert(auditLog).values({
      accountId: actor.accountId, actorId, actorName: name, actorEmail: email, event,
      category: details.category ?? categoryOf(event),
      targetType: details.targetType ?? null, targetId: details.targetId ?? null, targetName: details.targetName ?? null,
      details: redact(rest) as Record<string, unknown>, ip: details.ip ?? null, userAgent: details.userAgent ?? null,
      source: actor.source ?? "system",
    }).returning({ id: auditLog.id }).get();
    maybePurge(actor.accountId);
    return row.id;
  } catch (err) {
    console.error("[audit] could not write entry", event, err instanceof Error ? err.message : err);
    return null;
  }
}

function maybePurge(accountId: string): void {
  const now = Date.now();
  if (now - (lastPurge.get(accountId) ?? 0) < 3600_000) return;
  lastPurge.set(accountId, now);
  purgeExpired(accountId);
}

/** Delete entries older than the retention setting. Returns the number of deleted rows. */
export function purgeExpired(accountId: string): number {
  const days = getSettings(accountId).retentionDays;
  if (!days || days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  return db.delete(auditLog).where(and(eq(auditLog.accountId, accountId), lt(auditLog.createdAt, cutoff))).run().changes;
}

/* ------------------------------------------------------------------ reading */

export const auditQuery = z.object({
  q: z.string().trim().max(200).optional(),
  event: z.string().trim().max(100).optional(),
  category: z.enum(["auth", "permission", "content", "security", "api", "export", "admin"]).optional(),
  actorId: z.string().max(40).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  /** pass the previous page's `nextCursor` (createdAt|id) */
  cursor: z.string().max(100).optional(),
});
export type AuditQuery = z.input<typeof auditQuery>;

export interface AuditPage { rows: AuditRow[]; nextCursor: string | null; total: number }

function whereFor(accountId: string, d: z.output<typeof auditQuery>, withCursor: boolean) {
  const esc = (s: string) => `%${s.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const conds = [
    eq(auditLog.accountId, accountId),
    d.category ? eq(auditLog.category, d.category) : undefined,
    d.event ? (d.event.endsWith(".") || d.event.endsWith("*") ? like(auditLog.event, `${d.event.replace(/\*$/, "")}%`) : eq(auditLog.event, d.event)) : undefined,
    d.actorId ? eq(auditLog.actorId, d.actorId) : undefined,
    d.from ? gte(auditLog.createdAt, d.from) : undefined,
    d.to ? lte(auditLog.createdAt, d.to.length === 10 ? `${d.to}T23:59:59.999Z` : d.to) : undefined,
    d.q ? or(
      sql`${auditLog.event} like ${esc(d.q)} escape '\\'`, sql`${auditLog.actorName} like ${esc(d.q)} escape '\\'`,
      sql`${auditLog.actorEmail} like ${esc(d.q)} escape '\\'`, sql`${auditLog.targetName} like ${esc(d.q)} escape '\\'`,
      sql`${auditLog.targetId} like ${esc(d.q)} escape '\\'`, sql`${auditLog.details} like ${esc(d.q)} escape '\\'`,
    ) : undefined,
  ];
  if (withCursor && d.cursor) {
    const [at, id] = d.cursor.split("|");
    conds.push(or(lt(auditLog.createdAt, at), and(eq(auditLog.createdAt, at), lt(auditLog.id, id ?? ""))));
  }
  return and(...conds);
}

export function list(actor: Actor, query: unknown = {}): AuditPage {
  assertCan(actor, "account:audit");
  const d = parse(auditQuery, query);
  const rows = db.select().from(auditLog).where(whereFor(actor.accountId, d, true))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(d.limit + 1).all();
  const page = rows.slice(0, d.limit);
  const total = db.select({ n: sql<number>`count(*)` }).from(auditLog).where(whereFor(actor.accountId, d, false)).get()?.n ?? 0;
  const last = page[page.length - 1];
  return { rows: page, nextCursor: rows.length > d.limit && last ? `${last.createdAt}|${last.id}` : null, total };
}

/** CSV of the filtered log (max 10 000 rows). Records an `audit.exported` entry. */
export function exportCsv(actor: Actor, query: unknown = {}): string {
  assertCan(actor, "account:audit");
  const d = parse(auditQuery, { ...(query as object), limit: 1000 });
  const rows = db.select().from(auditLog).where(whereFor(actor.accountId, d, false)).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(10_000).all();
  recordAudit(actor, "audit.exported", { rows: rows.length, filters: { q: d.q, event: d.event, category: d.category, from: d.from, to: d.to } });
  return toCsv([
    ["time", "event", "category", "actor", "actor_email", "target_type", "target_id", "target_name", "ip", "source", "details"],
    ...rows.map((r) => [r.createdAt, r.event, r.category, r.actorName, r.actorEmail, r.targetType, r.targetId, r.targetName, r.ip, r.source, JSON.stringify(r.details)]),
  ]);
}

/** Distinct event names in the log (filter dropdown). */
export function eventNames(actor: Actor): string[] {
  assertCan(actor, "account:audit");
  return db.selectDistinct({ e: auditLog.event }).from(auditLog).where(eq(auditLog.accountId, actor.accountId)).orderBy(auditLog.event).all().map((r) => r.e);
}

/* ------------------------------------------------------------------ bus subscriber */

const g = globalThis as unknown as { __adminAuditSub?: () => void };
if (!g.__adminAuditSub) {
  g.__adminAuditSub = subscribe((e) => {
    try {
      if (e.type === "board.deleted" && e.boardId) {
        const b = db.select({ name: boards.name, workspaceId: boards.workspaceId }).from(boards).where(eq(boards.id, e.boardId)).get();
        const ws = b ? db.select({ accountId: workspaces.accountId }).from(workspaces).where(eq(workspaces.id, b.workspaceId)).get() : null;
        if (!b || !ws) return;
        const actor = auditActorFor(ws.accountId, e.actorId);
        recordAudit(actor, "board.deleted", { targetType: "board", targetId: e.boardId, targetName: b.name, workspaceId: b.workspaceId });
      } else if (e.type === "workspace.changed") {
        const deleted = db.select().from(workspaces).where(eq(workspaces.state, "deleted")).all();
        for (const w of deleted) {
          const seen = db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.event, "workspace.deleted"), eq(auditLog.targetId, w.id))).get();
          if (!seen) recordAudit(auditActorFor(w.accountId, e.actorId), "workspace.deleted", { targetType: "workspace", targetId: w.id, targetName: w.name });
        }
      }
    } catch (err) {
      console.error("[audit] subscriber failed", err instanceof Error ? err.message : err);
    }
  });
}

function auditActorFor(accountId: string, actorId: string | null): AuditActor {
  if (!actorId) return { accountId, isSystem: true, source: "system" };
  const u = db.select({ name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.id, actorId)).get();
  return { accountId, id: actorId, name: u?.name, email: u?.email, source: "ui" };
}
