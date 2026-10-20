import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { emit } from "../../lib/events";
import { extractMentions, htmlToText, sanitizeHtml } from "../../lib/sanitize";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { activityLog, teamMembers, teams, updateLikes, updates, users } from "../../db/schema/core";
import { updateReads } from "../../db/schema/table-ux";
import { getItemRow, notify, parse, record, requireBoard } from "./_shared";

export type UpdateRow = typeof updates.$inferSelect;
export type UpdateDto = UpdateRow & {
  author: { id: string; name: string; photoUrl: string | null } | null;
  likes: string[];
  /** users that have viewed this update (not the author) */
  seenBy: { id: string; name: string; seenAt: string }[];
  replies: UpdateDto[];
};

const createInput = z.object({
  itemId: idSchema,
  body: z.string().min(1).max(100_000),
  parentUpdateId: idSchema.nullish(),
  /** files will be attached right after creation, so an empty body is fine */
  withFiles: z.boolean().optional(),
});

function toDtos(rows: UpdateRow[]): UpdateDto[] {
  if (!rows.length) return [];
  const authorIds = [...new Set(rows.map((r) => r.userId).filter(Boolean) as string[])];
  const authors = authorIds.length ? db.select({ id: users.id, name: users.name, photoUrl: users.photoUrl }).from(users).where(inArray(users.id, authorIds)).all() : [];
  const likes = db.select().from(updateLikes).where(inArray(updateLikes.updateId, rows.map((r) => r.id))).all();
  const reads = db.select({ updateId: updateReads.updateId, userId: updateReads.userId, seenAt: updateReads.seenAt, name: users.name }).from(updateReads)
    .innerJoin(users, eq(users.id, updateReads.userId)).where(inArray(updateReads.updateId, rows.map((r) => r.id))).all();
  const dtos = rows.map<UpdateDto>((r) => ({
    ...r,
    author: authors.find((a) => a.id === r.userId) ?? null,
    likes: likes.filter((l) => l.updateId === r.id).map((l) => l.userId),
    seenBy: reads.filter((x) => x.updateId === r.id && x.userId !== r.userId).map((x) => ({ id: x.userId, name: x.name, seenAt: x.seenAt })),
    replies: [],
  }));
  const byId = new Map(dtos.map((d) => [d.id, d]));
  const roots: UpdateDto[] = [];
  for (const d of dtos) {
    const parent = d.parentUpdateId ? byId.get(d.parentUpdateId) : undefined;
    if (parent) parent.replies.push(d);
    else roots.push(d);
  }
  for (const d of dtos) d.replies.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return roots;
}

/** Newest first, replies nested oldest first. Pinned updates come first. */
export function list(actor: Actor, itemId: string): UpdateDto[] {
  const it = getItemRow(itemId);
  requireBoard(actor, it.boardId, "board:view");
  const rows = db.select().from(updates).where(eq(updates.itemId, itemId)).orderBy(desc(updates.createdAt), desc(updates.id)).all();
  const roots = toDtos(rows);
  return [...roots.filter((r) => r.pinned), ...roots.filter((r) => !r.pinned)];
}

export function create(actor: Actor, input: unknown): UpdateDto {
  const d = parse(createInput, input);
  const it = getItemRow(d.itemId);
  requireBoard(actor, it.boardId, "board:comment");
  if (d.parentUpdateId) {
    const parent = db.select().from(updates).where(eq(updates.id, d.parentUpdateId)).get();
    if (!parent || parent.itemId !== d.itemId) throw new NotFoundError("Parent update");
  }
  const body = sanitizeHtml(d.body);
  const bodyText = htmlToText(body);
  if (!bodyText && !d.withFiles && !/<img|<a /.test(body)) throw new ValidationError("Update is empty");
  const mentions = extractMentions(body);
  const row = db.insert(updates).values({
    itemId: d.itemId, boardId: it.boardId, userId: actor.isSystem ? null : actor.id, parentUpdateId: d.parentUpdateId ?? null, body, bodyText, mentions,
  }).returning().get();
  for (const uid of mentionTargets(actor.accountId, mentions)) notify(actor, uid, { type: "mention", title: { key: "notif.mention", vars: { actor: actor.name ?? "?", item: it.name } }, body: bodyText.slice(0, 200), boardId: it.boardId, itemId: it.id, updateId: row.id });
  if (d.parentUpdateId) {
    const parent = db.select().from(updates).where(eq(updates.id, d.parentUpdateId)).get();
    if (parent?.userId && !mentions.includes(parent.userId)) notify(actor, parent.userId, { type: "reply", title: { key: "notif.reply", vars: { actor: actor.name ?? "?", item: it.name } }, body: bodyText.slice(0, 200), boardId: it.boardId, itemId: it.id, updateId: row.id });
  }
  record(actor, { type: "update.created", boardId: it.boardId, itemId: it.id, updateId: row.id }, { event: "create_update", itemId: it.id, data: { name: it.name, text: bodyText.slice(0, 200) } });
  return toDtos([row])[0] ?? ({ ...row, author: null, likes: [], seenBy: [], replies: [] } as UpdateDto);
}

/** Mention ids are user ids or team ids (one shared id sequence); teams expand to their members. */
export function mentionTargets(accountId: string, ids: string[]): string[] {
  if (!ids.length) return [];
  const out = new Set<string>();
  for (const u of db.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), eq(users.accountId, accountId), eq(users.isActive, true))).all()) out.add(u.id);
  const tids = db.select({ id: teams.id }).from(teams).where(and(inArray(teams.id, ids), eq(teams.accountId, accountId))).all().map((t) => t.id);
  if (tids.length) for (const m of db.select({ userId: teamMembers.userId }).from(teamMembers).where(inArray(teamMembers.teamId, tids)).all()) out.add(m.userId);
  return [...out];
}

function ownUpdate(actor: Actor, updateId: string): UpdateRow {
  const u = db.select().from(updates).where(eq(updates.id, updateId)).get();
  if (!u) throw new NotFoundError("Update");
  requireBoard(actor, u.boardId, "board:comment");
  return u;
}

/** One update (or reply) by id, with author/likes/replies (GraphQL/MCP read path). */
export function getDto(actor: Actor, updateId: string): UpdateDto {
  const u = db.select().from(updates).where(eq(updates.id, updateId)).get();
  if (!u) throw new NotFoundError("Update");
  requireBoard(actor, u.boardId, "board:view");
  const siblings = db.select().from(updates).where(eq(updates.parentUpdateId, updateId)).all();
  return toDtos([u, ...siblings]).find((d) => d.id === updateId) ?? toDtos([u])[0];
}

export function edit(actor: Actor, updateId: string, input: unknown): UpdateRow {
  const d = parse(z.object({ body: z.string().min(1).max(100_000) }), input);
  const u = ownUpdate(actor, updateId);
  if (!actor.isSystem && actor.role !== "admin" && u.userId !== actor.id) throw new ForbiddenError("You can only edit your own updates");
  const body = sanitizeHtml(d.body);
  const mentions = extractMentions(body);
  const row = db.update(updates).set({ body, bodyText: htmlToText(body), mentions, editedAt: new Date().toISOString() }).where(eq(updates.id, updateId)).returning().get();
  const before = new Set(mentionTargets(actor.accountId, u.mentions));
  const it = getItemRow(u.itemId);
  for (const uid of mentionTargets(actor.accountId, mentions)) {
    if (!before.has(uid)) notify(actor, uid, { type: "mention", title: { key: "notif.mention", vars: { actor: actor.name ?? "?", item: it.name } }, body: row.bodyText.slice(0, 200), boardId: u.boardId, itemId: u.itemId, updateId });
  }
  record(actor, { type: "update.updated", boardId: u.boardId, itemId: u.itemId, updateId }, null);
  return row;
}

export function remove(actor: Actor, updateId: string): void {
  const u = ownUpdate(actor, updateId);
  if (!actor.isSystem && actor.role !== "admin" && u.userId !== actor.id) throw new ForbiddenError("You can only delete your own updates");
  db.delete(updates).where(eq(updates.id, updateId)).run();
  record(actor, { type: "update.deleted", boardId: u.boardId, itemId: u.itemId, updateId }, { event: "delete_update", itemId: u.itemId });
}

/** Toggle like; returns the new liked state. */
export function toggleLike(actor: Actor, updateId: string): boolean {
  const u = ownUpdate(actor, updateId);
  const key = and(eq(updateLikes.updateId, updateId), eq(updateLikes.userId, actor.id));
  const had = db.select().from(updateLikes).where(key).get();
  if (had) db.delete(updateLikes).where(key).run();
  else db.insert(updateLikes).values({ updateId, userId: actor.id }).run();
  record(actor, { type: "update.liked", boardId: u.boardId, itemId: u.itemId, updateId }, null);
  return !had;
}

export function setPinned(actor: Actor, updateId: string, pinned: boolean): UpdateRow {
  const u = ownUpdate(actor, updateId);
  const row = db.update(updates).set({ pinned }).where(eq(updates.id, updateId)).returning().get();
  record(actor, { type: "update.updated", boardId: u.boardId, itemId: u.itemId, updateId }, null);
  return row;
}

/** Count of top-level updates + replies per item, for the speech-bubble in the table. */
export function countsByItem(itemIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!itemIds.length) return out;
  for (const r of db.select({ itemId: updates.itemId }).from(updates).where(inArray(updates.itemId, itemIds)).all()) out[r.itemId] = (out[r.itemId] ?? 0) + 1;
  return out;
}

/** Activity log rows for an item (newest first). */
export function activityForItem(actor: Actor, itemId: string, limit = 100) {
  const it = getItemRow(itemId);
  requireBoard(actor, it.boardId, "board:view");
  return db.select().from(activityLog).where(eq(activityLog.itemId, itemId)).orderBy(desc(activityLog.createdAt), desc(activityLog.id)).limit(limit).all();
}


/* ---------------------------------------------------------------- read marks (table-ux) */

/** Mark every update on the item (that is not yours) as seen by the actor. Returns how many were new. */
export function markSeen(actor: Actor, itemId: string): number {
  const it = getItemRow(itemId);
  requireBoard(actor, it.boardId, "board:view");
  if (actor.isSystem) return 0;
  const rows = db.select({ id: updates.id }).from(updates).where(and(eq(updates.itemId, itemId))).all();
  const own = new Set(db.select({ updateId: updateReads.updateId }).from(updateReads).where(eq(updateReads.userId, actor.id)).all().map((r) => r.updateId));
  const fresh = rows.filter((r) => !own.has(r.id));
  for (const r of fresh) db.insert(updateReads).values({ updateId: r.id, userId: actor.id }).onConflictDoNothing().run();
  if (fresh.length) emit({ type: "update.updated", boardId: it.boardId, actorId: actor.id, itemId, updateId: fresh[0].id });
  return fresh.length;
}

/** Unread updates per item for the actor (updates by others without a read mark). Items without unread are left out. */
export function unreadCounts(actor: Actor, boardId: string): Record<string, number> {
  requireBoard(actor, boardId, "board:view");
  if (actor.isSystem) return {};
  const rows = db.select({ id: updates.id, itemId: updates.itemId, userId: updates.userId }).from(updates).where(eq(updates.boardId, boardId)).all();
  const mine = rows.filter((r) => r.userId !== actor.id);
  if (!mine.length) return {};
  const read = new Set(db.select({ updateId: updateReads.updateId }).from(updateReads).where(and(eq(updateReads.userId, actor.id), inArray(updateReads.updateId, mine.map((r) => r.id)))).all().map((r) => r.updateId));
  const out: Record<string, number> = {};
  for (const r of mine) if (!read.has(r.id)) out[r.itemId] = (out[r.itemId] ?? 0) + 1;
  return out;
}
