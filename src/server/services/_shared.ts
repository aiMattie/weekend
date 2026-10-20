/**
 * Helpers shared by all services. Not part of the public service API.
 */
import { and, asc, eq } from "drizzle-orm";
import type { z } from "zod";
import type { Actor } from "../../lib/actor";
import { NotFoundError, ValidationError } from "../../lib/errors";
import { emit, type NewAppEvent, type NewServiceEvent } from "../../lib/events";
import { translate } from "../../lib/i18n";
import { assertCan, type Action } from "../../lib/permissions";
import { db } from "../../db/client";
import type { FormatContext } from "../columns/types";
import { activityLog, boards, columns, groups, items, notifications, teams, users } from "../../db/schema/core";

/** zod parse that throws our ValidationError (-> HTTP 400) with readable issues. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    throw new ValidationError(msg, r.error.issues);
  }
  return r.data;
}

export type BoardRow = typeof boards.$inferSelect;
export type GroupRow = typeof groups.$inferSelect;
export type ColumnRow = typeof columns.$inferSelect;
export type ItemRow = typeof items.$inferSelect;

export function getBoardRow(boardId: string): BoardRow {
  const b = db.select().from(boards).where(eq(boards.id, boardId)).get();
  if (!b || b.state === "deleted") throw new NotFoundError("Board");
  return b;
}

/** Load a board and require a permission on it in one go. */
export function requireBoard(actor: Actor, boardId: string, action: Action, res: { itemId?: string } = {}): BoardRow {
  const b = getBoardRow(boardId);
  assertCan(actor, action, { boardId, ...res });
  return b;
}

export function getGroupRow(groupId: string): GroupRow {
  const g = db.select().from(groups).where(eq(groups.id, groupId)).get();
  if (!g || g.state === "deleted") throw new NotFoundError("Group");
  return g;
}

export function getItemRow(itemId: string): ItemRow {
  const it = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!it || it.state === "deleted") throw new NotFoundError("Item");
  return it;
}

export function getColumnRow(columnId: string): ColumnRow {
  const c = db.select().from(columns).where(eq(columns.id, columnId)).get();
  if (!c) throw new NotFoundError("Column");
  return c;
}

/** Resolve a column by global id OR key within a board. */
export function resolveColumn(boardId: string, idOrKey: string, scope: "item" | "subitem" = "item"): ColumnRow {
  const byId = db.select().from(columns).where(and(eq(columns.boardId, boardId), eq(columns.id, idOrKey))).get();
  if (byId) return byId;
  const byKey = db.select().from(columns).where(and(eq(columns.boardId, boardId), eq(columns.key, idOrKey), eq(columns.scope, scope))).get()
    ?? db.select().from(columns).where(and(eq(columns.boardId, boardId), eq(columns.key, idOrKey))).get();
  if (!byKey) throw new NotFoundError(`Column "${idOrKey}"`);
  return byKey;
}

export function boardColumns(boardId: string, scope?: "item" | "subitem"): ColumnRow[] {
  const rows = db.select().from(columns).where(eq(columns.boardId, boardId)).orderBy(asc(columns.position)).all();
  return scope ? rows.filter((c) => c.scope === scope) : rows;
}

/**
 * Persist an activity row AND emit the matching bus event. Every mutating service call goes
 * through this so the activity log, SSE, automations and webhooks stay in sync.
 */
export function record(
  actor: Actor,
  event: NewServiceEvent & { boardId: string },
  log?: { event: string; itemId?: string | null; groupId?: string | null; columnId?: string | null; data?: Record<string, unknown> } | null,
): void {
  const actorId = actor.isSystem ? null : actor.id;
  if (log !== null) {
    db.insert(activityLog).values({
      boardId: event.boardId,
      itemId: log?.itemId ?? ("itemId" in event ? (event.itemId as string) : null),
      groupId: log?.groupId ?? ("groupId" in event ? (event.groupId as string) : null),
      columnId: log?.columnId ?? ("columnId" in event ? (event.columnId as string) : null),
      userId: actorId,
      event: log?.event ?? event.type,
      data: { source: actor.source ?? "ui", ...(log?.data ?? {}) },
    }).run();
  }
  emit({ ...event, actorId } as NewAppEvent);
}

export type PositionSpec = { position?: number; beforeId?: string; afterId?: string; top?: boolean };

/** Compute a position for a new/moved row among `siblings` (already sorted ascending, excluding the row itself). */
export function computePosition(siblings: { id: string; position: number }[], spec: PositionSpec = {}): number {
  const POS = 1000;
  if (typeof spec.position === "number") return spec.position;
  if (spec.top) return siblings.length ? siblings[0].position - POS : POS;
  const idx = (id: string) => siblings.findIndex((s) => s.id === id);
  if (spec.beforeId && idx(spec.beforeId) >= 0) {
    const i = idx(spec.beforeId);
    return i === 0 ? siblings[0].position - POS : (siblings[i - 1].position + siblings[i].position) / 2;
  }
  if (spec.afterId && idx(spec.afterId) >= 0) {
    const i = idx(spec.afterId);
    return i === siblings.length - 1 ? siblings[i].position + POS : (siblings[i].position + siblings[i + 1].position) / 2;
  }
  return siblings.length ? siblings[siblings.length - 1].position + POS : POS;
}


export type NotifyTitle = string | { key: string; vars?: Record<string, string | number> };

/** Insert an in-app notification (skips self-notifications). `title` may be an i18n key: it is rendered in the recipient's language. */
export function notify(actor: Actor, userId: string, n: { type: string; title: NotifyTitle; body?: string; boardId?: string; itemId?: string; updateId?: string; link?: string }): void {
  if (!actor.isSystem && userId === actor.id) return;
  let title: string;
  if (typeof n.title === "string") title = n.title;
  else {
    const loc = db.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).get()?.locale;
    title = translate(loc === "en" ? "en" : "nl", n.title.key, n.title.vars);
  }
  db.insert(notifications).values({
    userId, actorId: actor.isSystem ? null : actor.id, type: n.type, title, body: n.body ?? null,
    boardId: n.boardId ?? null, itemId: n.itemId ?? null, updateId: n.updateId ?? null,
    link: n.link ?? (n.boardId ? `/boards/${n.boardId}${n.itemId ? `?item=${n.itemId}` : ""}` : null),
  }).run();
}

/** Name lookup for logic.format() (people columns) so the activity log stores readable text. */
export function formatContext(accountId: string): FormatContext {
  const userNames = new Map(db.select({ id: users.id, name: users.name }).from(users).where(eq(users.accountId, accountId)).all().map((u) => [u.id, u.name]));
  const teamNames = new Map(db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.accountId, accountId)).all().map((t) => [t.id, t.name]));
  return { userNames, teamNames };
}
