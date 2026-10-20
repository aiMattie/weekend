/**
 * Inbox / notifications. Also exported as `notifications` from the services barrel.
 * Core table `notifications` is written by other services through `notify()` (_shared);
 * this service reads it with per-user preferences applied, plus bookmarks, settings and digests.
 */
import { translate } from "../../lib/i18n";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError } from "../../lib/errors";
import { subscribe } from "../../lib/events";
import { assertCan } from "../../lib/permissions";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { boards, columns, items, notifications, updates, users } from "../../db/schema/core";
import { emailOutbox, notificationBookmarks, notificationSettings } from "../../db/schema/docs";
import { DEFAULT_SETTINGS, EVENT_TYPES, type EventType, type InboxFilter, type NotificationDto, type NotificationPage, type NotificationSetting } from "../../modules/boards-extra/inbox/types";
import { buildDigestMail } from "../../modules/boards-extra/inbox/digest";
import type { PeopleValue } from "../columns/people";
import { nowIso } from "../../lib/time";
import { parse } from "./_shared";

export type { InboxFilter, NotificationDto, NotificationPage, NotificationSetting } from "../../modules/boards-extra/inbox/types";

/* ------------------------------------------------------------ settings */

function settingsMap(userId: string): Map<EventType, { inApp: boolean; email: boolean }> {
  const m = new Map<EventType, { inApp: boolean; email: boolean }>(EVENT_TYPES.map((t) => [t, { ...DEFAULT_SETTINGS[t] }]));
  for (const r of db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId)).all()) {
    if ((EVENT_TYPES as readonly string[]).includes(r.eventType)) m.set(r.eventType as EventType, { inApp: r.inApp, email: r.email });
  }
  return m;
}

export function getSettings(actor: Actor): NotificationSetting[] {
  return [...settingsMap(actor.id)].map(([eventType, s]) => ({ eventType, ...s }));
}

const settingsInput = z.array(z.object({ eventType: z.enum(EVENT_TYPES), inApp: z.boolean().optional(), email: z.boolean().optional() })).min(1).max(20);

export function updateSettings(actor: Actor, input: unknown): NotificationSetting[] {
  const list = parse(settingsInput, input);
  const cur = settingsMap(actor.id);
  for (const s of list) {
    const next = { ...cur.get(s.eventType)!, ...(s.inApp !== undefined ? { inApp: s.inApp } : {}), ...(s.email !== undefined ? { email: s.email } : {}) };
    db.insert(notificationSettings).values({ userId: actor.id, eventType: s.eventType, ...next })
      .onConflictDoUpdate({ target: [notificationSettings.userId, notificationSettings.eventType], set: next }).run();
  }
  return getSettings(actor);
}

/** Types the user does NOT want in the app (unknown types are always shown). */
function hiddenTypes(userId: string): string[] {
  return [...settingsMap(userId)].filter(([, s]) => !s.inApp).map(([t]) => t);
}

/* ------------------------------------------------------------ reading */

function visibleWhere(userId: string) {
  const hidden = hiddenTypes(userId);
  return and(eq(notifications.userId, userId), hidden.length ? sql`${notifications.type} NOT IN (${sql.join(hidden.map((h) => sql`${h}`), sql`, `)})` : undefined);
}

export function unreadCount(actor: Actor): number {
  const r = db.select({ n: sql<number>`count(*)` }).from(notifications).where(and(visibleWhere(actor.id), eq(notifications.read, false))).get();
  return r?.n ?? 0;
}

const listInput = z.object({
  filter: z.enum(["all", "unread", "mentioned", "assigned", "bookmarked"]).default("all"),
  limit: z.number().int().min(1).max(200).default(50),
  cursor: z.string().max(100).optional(),
});

function toDtos(rows: (typeof notifications.$inferSelect)[], userId: string): NotificationDto[] {
  if (!rows.length) return [];
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x && /^\d+$/.test(x)))];
  const actors = actorIds.length ? db.select({ id: users.id, name: users.name, photoUrl: users.photoUrl }).from(users).where(inArray(users.id, actorIds)).all() : [];
  const itemIds = [...new Set(rows.map((r) => r.itemId).filter((x): x is string => !!x))];
  const boardIds = [...new Set(rows.map((r) => r.boardId).filter((x): x is string => !!x))];
  const itemNames = new Map((itemIds.length ? db.select({ id: items.id, name: items.name }).from(items).where(inArray(items.id, itemIds)).all() : []).map((i) => [i.id, i.name]));
  const boardNames = new Map((boardIds.length ? db.select({ id: boards.id, name: boards.name }).from(boards).where(inArray(boards.id, boardIds)).all() : []).map((b) => [b.id, b.name]));
  const marks = new Set(db.select({ id: notificationBookmarks.notificationId }).from(notificationBookmarks)
    .where(and(eq(notificationBookmarks.userId, userId), inArray(notificationBookmarks.notificationId, rows.map((r) => r.id)))).all().map((m) => m.id));
  return rows.map((r) => ({
    id: r.id, type: r.type, title: r.title, body: r.body, boardId: r.boardId, itemId: r.itemId, updateId: r.updateId, link: r.link,
    read: r.read, bookmarked: marks.has(r.id), createdAt: r.createdAt,
    actor: actors.find((a) => a.id === r.actorId) ?? null,
    itemName: r.itemId ? itemNames.get(r.itemId) ?? null : null,
    boardName: r.boardId ? boardNames.get(r.boardId) ?? null : null,
  }));
}

/** Newest first. `cursor` = nextCursor of the previous page ("createdAt|id"). */
export function list(actor: Actor, input: unknown = {}): NotificationPage {
  const q = parse(listInput, input);
  const conds = [visibleWhere(actor.id)];
  switch (q.filter as InboxFilter) {
    case "unread": conds.push(eq(notifications.read, false)); break;
    case "mentioned": conds.push(inArray(notifications.type, ["mention", "reply"])); break;
    case "assigned": conds.push(eq(notifications.type, "assigned")); break;
    case "bookmarked": conds.push(sql`${notifications.id} IN (SELECT notification_id FROM notification_bookmarks WHERE user_id = ${actor.id})`); break;
  }
  if (q.cursor) {
    const [at, id] = q.cursor.split("|");
    conds.push(or(lt(notifications.createdAt, at), and(eq(notifications.createdAt, at), lt(notifications.id, id ?? "")))!);
  }
  const rows = db.select().from(notifications).where(and(...conds)).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(q.limit + 1).all();
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return { notifications: toDtos(page, actor.id), nextCursor: rows.length > q.limit && last ? `${last.createdAt}|${last.id}` : null, unread: unreadCount(actor) };
}

/* ------------------------------------------------------------ mutations (own notifications only) */

function own(actor: Actor, id: string) {
  const n = db.select().from(notifications).where(eq(notifications.id, id)).get();
  if (!n || (n.userId !== actor.id && !actor.isSystem)) throw new NotFoundError("Notification");
  return n;
}

export function markRead(actor: Actor, id: string, read = true): NotificationDto {
  own(actor, id);
  const row = db.update(notifications).set({ read }).where(eq(notifications.id, id)).returning().get();
  return toDtos([row], row.userId)[0];
}

/** Mark everything (or only the given filter) as read; returns how many changed. */
export function markAllRead(actor: Actor): number {
  return db.update(notifications).set({ read: true }).where(and(eq(notifications.userId, actor.id), eq(notifications.read, false))).returning({ id: notifications.id }).all().length;
}

export function bookmark(actor: Actor, id: string, on = true): NotificationDto {
  const n = own(actor, id);
  if (on) db.insert(notificationBookmarks).values({ notificationId: id, userId: n.userId }).onConflictDoNothing().run();
  else db.delete(notificationBookmarks).where(and(eq(notificationBookmarks.notificationId, id), eq(notificationBookmarks.userId, n.userId))).run();
  return toDtos([n], n.userId)[0];
}

export function remove(actor: Actor, id: string): void {
  own(actor, id);
  db.delete(notifications).where(eq(notifications.id, id)).run();
}
export const archive = remove;

const createInput = z.object({
  userId: idSchema,
  title: z.string().trim().min(1).max(500),
  body: z.string().max(5000).nullish(),
  type: z.string().trim().min(1).max(40).default("system"),
  boardId: idSchema.nullish(),
  itemId: idSchema.nullish(),
  updateId: idSchema.nullish(),
  link: z.string().max(1000).nullish(),
});

/**
 * Create a notification for a user (MCP create_notification, automations). Respects the recipient's
 * in-app preference for the type: returns null when they switched it off.
 */
export function create(actor: Actor, input: unknown): NotificationDto | null {
  const d = parse(createInput, input);
  if (actor.role === "guest" || actor.role === "viewer") throw new ForbiddenError("Not allowed to send notifications");
  const target = db.select({ id: users.id, accountId: users.accountId }).from(users).where(eq(users.id, d.userId)).get();
  if (!target || target.accountId !== actor.accountId) throw new NotFoundError("User");
  if (d.boardId) assertCan(actor, "board:view", { boardId: d.boardId });
  const pref = settingsMap(d.userId).get(d.type as EventType);
  if (pref && !pref.inApp) return null;
  const link = d.link ?? (d.boardId ? `/boards/${d.boardId}${d.itemId ? `?item=${d.itemId}` : ""}` : null);
  const row = db.insert(notifications).values({
    userId: d.userId, actorId: actor.isSystem ? null : actor.id, type: d.type, title: d.title, body: d.body ?? null,
    boardId: d.boardId ?? null, itemId: d.itemId ?? null, updateId: d.updateId ?? null, link,
  }).returning().get();
  return toDtos([row], d.userId)[0];
}

/* ------------------------------------------------------------ digest */

export interface Digest { subject: string; text: string; html: string; count: number; ids: string[] }

/** Daily digest for one user: unread notifications since `sinceIso` of types with e-mail enabled. Null when empty. */
export function buildDigest(userId: string, sinceIso: string): Digest | null {
  const u = db.select({ name: users.name }).from(users).where(eq(users.id, userId)).get();
  if (!u) return null;
  const emailTypes = [...settingsMap(userId)].filter(([, s]) => s.email).map(([t]) => t);
  if (!emailTypes.length) return null;
  const rows = db.select().from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false), inArray(notifications.type, emailTypes), sql`${notifications.createdAt} > ${sinceIso}`))
    .orderBy(desc(notifications.createdAt)).all();
  if (!rows.length) return null;
  return { ...buildDigestMail(u.name, toDtos(rows, userId)), count: rows.length, ids: rows.map((r) => r.id) };
}

/** Insert one `email_outbox` row per user that has new e-mail-enabled notifications since their last digest. */
export function sendDailyDigests(now: Date = new Date()): number {
  const people = db.select({ id: users.id, email: users.email }).from(users).where(and(eq(users.isActive, true), eq(users.isAiAgent, false))).all();
  let sent = 0;
  for (const p of people) {
    const last = db.select({ at: emailOutbox.createdAt }).from(emailOutbox)
      .where(and(eq(emailOutbox.toUserId, p.id), eq(emailOutbox.kind, "digest"))).orderBy(desc(emailOutbox.createdAt)).limit(1).get();
    const since = last?.at ?? new Date(now.getTime() - 24 * 3600_000).toISOString();
    const digest = buildDigest(p.id, since);
    if (!digest) continue;
    // TODO: when SMTP_URL is configured, hand the row to a real mailer; the outbox row is the sent mail meanwhile.
    db.insert(emailOutbox).values({ toUserId: p.id, toEmail: p.email, subject: digest.subject, body: digest.html, kind: "digest", sentAt: nowIso(), createdAt: now.toISOString() }).run();
    sent++;
  }
  return sent;
}

/* ------------------------------------------------------------ board updates subscriber */

/** Update on an item -> notify its assignees (people columns, persons) except author and already-notified. */
export function notifyAssigneesOfUpdate(e: { itemId: string; updateId: string; actorId: string | null }): number {
  const it = db.select().from(items).where(eq(items.id, e.itemId)).get();
  if (!it || it.state !== "active") return 0;
  const peopleCols = db.select().from(columns).where(and(eq(columns.boardId, it.boardId), eq(columns.type, "people"))).all();
  const assignees = new Set<string>();
  for (const c of peopleCols) for (const p of (it.values[c.id] as PeopleValue | undefined)?.personsAndTeams ?? []) if (p.kind === "person") assignees.add(p.id);
  if (e.actorId) assignees.delete(e.actorId);
  if (!assignees.size) return 0;
  const already = new Set(db.select({ userId: notifications.userId }).from(notifications).where(eq(notifications.updateId, e.updateId)).all().map((r) => r.userId));
  const author = e.actorId ? db.select({ name: users.name }).from(users).where(eq(users.id, e.actorId)).get() : undefined;
  const up = db.select({ bodyText: updates.bodyText }).from(updates).where(eq(updates.id, e.updateId)).get();
  let n = 0;
  for (const uid of assignees) {
    if (already.has(uid)) continue;
    if (settingsMap(uid).get("update")?.inApp === false) continue;
    db.insert(notifications).values({
      userId: uid, actorId: e.actorId, type: "update", title: translate(db.select({ l: users.locale }).from(users).where(eq(users.id, uid)).get()?.l === "en" ? "en" : "nl", "notif.update", { actor: author?.name ?? translate("nl", "notif.someone"), item: it.name }),
      body: up?.bodyText?.slice(0, 200) ?? null, boardId: it.boardId, itemId: it.id, updateId: e.updateId, link: `/boards/${it.boardId}?item=${it.id}`,
    }).run();
    n++;
  }
  return n;
}

const g = globalThis as unknown as { __extraInboxSub?: () => void };
if (!g.__extraInboxSub) {
  g.__extraInboxSub = subscribe((ev) => {
    if (ev.type !== "update.created") return;
    try { notifyAssigneesOfUpdate({ itemId: ev.itemId, updateId: ev.updateId, actorId: ev.actorId }); } catch (err) { console.error("[inbox] update subscriber failed", err); }
  });
}
