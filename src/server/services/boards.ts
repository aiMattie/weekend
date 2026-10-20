import { and, asc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { NotFoundError } from "../../lib/errors";
import { assertCan, boardVisibilityFilter, can } from "../../lib/permissions";
import { idSchema, nameSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { boardMembers, boards, columns, favorites, groups, items, updates, users, views } from "../../db/schema/core";
import { insertColumnRow } from "./columns";
import { activeGroups, insertGroupRow } from "./groups";
import { insertViewRow } from "./views";
import { boardColumns, computePosition, getBoardRow, parse, record, requireBoard, type BoardRow } from "./_shared";
import * as workspaces from "./workspaces";

export type Board = BoardRow;

const createInput = z.object({
  workspaceId: idSchema,
  folderId: idSchema.nullish(),
  name: nameSchema,
  description: z.string().max(5000).nullish(),
  kind: z.enum(["board", "dev_sprints", "doc", "dashboard"]).default("board"),
  visibility: z.enum(["public", "private", "share"]).default("public"),
  /** add three sample items to the first group (UI "blank board" does this, API/MCP does not) */
  sampleItems: z.boolean().default(false),
  /** skip the default Owner/Status/Date columns (importers build their own) */
  emptyColumns: z.boolean().default(false),
});
const updateInput = z.object({
  name: nameSchema.optional(),
  description: z.string().max(5000).nullish(),
  visibility: z.enum(["public", "private", "share"]).optional(),
  folderId: idSchema.nullish(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

/** Default table: Name | Owner (people) | Status | Date, one group, one "Main table" view. */
export function bootstrapBoard(boardId: string, opts: { sampleItems?: boolean; emptyColumns?: boolean } = {}): void {
  insertColumnRow(boardId, { title: "Name", type: "name", scope: "item" }, { keyBase: "name" });
  if (!opts.emptyColumns) {
    insertColumnRow(boardId, { title: "Owner", type: "people", scope: "item", key: "people" });
    insertColumnRow(boardId, { title: "Status", type: "status", scope: "item", key: "status" });
    insertColumnRow(boardId, { title: "Date", type: "date", scope: "item", key: "date" });
  }
  const g = insertGroupRow(boardId, { title: "Group Title" });
  insertViewRow(boardId, { name: "Main table", type: "table" });
  if (opts.sampleItems) {
    ["Item 1", "Item 2", "Item 3"].forEach((name, i) =>
      db.insert(items).values({ boardId, groupId: g.id, name, position: (i + 1) * 1000 }).run());
  }
}

export function list(actor: Actor, opts: { workspaceId?: string; state?: "active" | "archived" } = {}): Board[] {
  const visible = boardVisibilityFilter(actor);
  const wsIds = workspaces.list(actor).map((w) => w.id);
  const guestBoards = actor.role === "guest" ? db.select({ id: boardMembers.boardId }).from(boardMembers).where(eq(boardMembers.userId, actor.id)).all().map((r) => r.id) : [];
  if (!wsIds.length && !guestBoards.length) return [];
  const rows = db.select().from(boards).where(and(
    eq(boards.state, opts.state ?? "active"),
    opts.workspaceId ? eq(boards.workspaceId, opts.workspaceId) : undefined,
    guestBoards.length ? or(inArray(boards.workspaceId, wsIds), inArray(boards.id, guestBoards)) : inArray(boards.workspaceId, wsIds),
  )).orderBy(asc(boards.position), asc(boards.name)).all();
  return rows.filter((b) => visible(b));
}

export function get(actor: Actor, boardId: string): Board {
  return requireBoard(actor, boardId, "board:view");
}

export function create(actor: Actor, input: unknown): Board {
  const d = parse(createInput, input);
  workspaces.get(actor, d.workspaceId);
  assertCan(actor, "workspace:create_board", { workspaceId: d.workspaceId });
  const siblings = db.select({ id: boards.id, position: boards.position }).from(boards).where(eq(boards.workspaceId, d.workspaceId)).orderBy(asc(boards.position)).all();
  const board = db.transaction(() => {
    const b = db.insert(boards).values({
      workspaceId: d.workspaceId, folderId: d.folderId ?? null, name: d.name, description: d.description ?? null, kind: d.kind,
      visibility: d.visibility, ownerId: actor.isSystem ? null : actor.id, position: computePosition(siblings),
    }).returning().get();
    if (!actor.isSystem) db.insert(boardMembers).values({ boardId: b.id, userId: actor.id, role: "owner" }).run();
    bootstrapBoard(b.id, d);
    return b;
  });
  record(actor, { type: "board.created", boardId: board.id }, { event: "create_board", data: { name: board.name } });
  return board;
}

export function update(actor: Actor, boardId: string, input: unknown): Board {
  const d = parse(updateInput, input);
  const cur = requireBoard(actor, boardId, "board:edit_structure");
  const patch: Partial<typeof boards.$inferInsert> = { ...d, settings: d.settings ? { ...cur.settings, ...d.settings } : undefined };
  const row = db.update(boards).set(patch).where(eq(boards.id, boardId)).returning().get();
  record(actor, { type: "board.updated", boardId }, { event: "update_board", data: { name: row.name, previousName: cur.name } });
  return row;
}

export function move(actor: Actor, boardId: string, input: unknown): Board {
  const d = parse(z.object({ workspaceId: idSchema.optional(), folderId: idSchema.nullish(), beforeId: idSchema.optional(), afterId: idSchema.optional(), top: z.boolean().optional() }), input);
  const cur = requireBoard(actor, boardId, "board:edit_structure");
  const targetWs = d.workspaceId ?? cur.workspaceId;
  if (targetWs !== cur.workspaceId) {
    workspaces.get(actor, targetWs);
    assertCan(actor, "workspace:create_board", { workspaceId: targetWs });
  }
  const siblings = db.select({ id: boards.id, position: boards.position }).from(boards).where(eq(boards.workspaceId, targetWs)).orderBy(asc(boards.position)).all().filter((s) => s.id !== boardId);
  const row = db.update(boards).set({ workspaceId: targetWs, folderId: d.folderId === undefined ? cur.folderId : d.folderId, position: computePosition(siblings, d) }).where(eq(boards.id, boardId)).returning().get();
  record(actor, { type: "board.updated", boardId }, { event: "move_board", data: { name: row.name } });
  return row;
}

export function archive(actor: Actor, boardId: string): Board {
  requireBoard(actor, boardId, "board:delete");
  const row = db.update(boards).set({ state: "archived" }).where(eq(boards.id, boardId)).returning().get();
  record(actor, { type: "board.archived", boardId }, { event: "archive_board", data: { name: row.name } });
  return row;
}

export function restore(actor: Actor, boardId: string): Board {
  const b = db.select().from(boards).where(eq(boards.id, boardId)).get();
  if (!b) throw new NotFoundError("Board");
  assertCan(actor, "board:delete", { boardId });
  return db.update(boards).set({ state: "active" }).where(eq(boards.id, boardId)).returning().get();
}

/** Soft delete (trash). */
export function remove(actor: Actor, boardId: string): void {
  const b = requireBoard(actor, boardId, "board:delete");
  db.update(boards).set({ state: "deleted" }).where(eq(boards.id, boardId)).run();
  record(actor, { type: "board.deleted", boardId }, { event: "delete_board", data: { name: b.name } });
}

/** Copy structure (groups, columns, views) and optionally items (+subitems, +updates). */
export function duplicate(actor: Actor, boardId: string, opts: { name?: string; withItems?: boolean; withUpdates?: boolean } = {}): Board {
  const src = requireBoard(actor, boardId, "board:view");
  assertCan(actor, "workspace:create_board", { workspaceId: src.workspaceId });
  const copy = db.transaction(() => {
    const b = db.insert(boards).values({
      workspaceId: src.workspaceId, folderId: src.folderId, name: opts.name ?? `Duplicate of ${src.name}`, description: src.description, kind: src.kind,
      visibility: src.visibility, ownerId: actor.isSystem ? src.ownerId : actor.id, settings: src.settings, position: src.position + 0.5,
    }).returning().get();
    if (!actor.isSystem) db.insert(boardMembers).values({ boardId: b.id, userId: actor.id, role: "owner" }).onConflictDoNothing().run();
    const colMap = new Map<string, string>();
    for (const c of boardColumns(boardId)) {
      const n = db.insert(columns).values({ boardId: b.id, key: c.key, title: c.title, type: c.type, scope: c.scope, description: c.description, settings: c.settings, position: c.position, width: c.width }).returning().get();
      colMap.set(c.id, n.id);
    }
    const grpMap = new Map<string, string>();
    for (const g of activeGroups(boardId)) grpMap.set(g.id, db.insert(groups).values({ boardId: b.id, title: g.title, color: g.color, position: g.position }).returning().get().id);
    for (const v of db.select().from(views).where(eq(views.boardId, boardId)).all()) {
      db.insert(views).values({ boardId: b.id, name: v.name, type: v.type, settings: v.settings, filters: v.filters, sort: v.sort, position: v.position, ownerId: v.ownerId }).run();
    }
    if (opts.withItems) {
      const rows = db.select().from(items).where(and(eq(items.boardId, boardId), eq(items.state, "active"))).orderBy(asc(items.position)).all();
      const itemMap = new Map<string, string>();
      const remap = (vals: Record<string, unknown>) => Object.fromEntries(Object.entries(vals).filter(([k]) => colMap.has(k)).map(([k, v]) => [colMap.get(k)!, v]));
      for (const r of rows.filter((x) => !x.parentItemId)) itemMap.set(r.id, db.insert(items).values({ boardId: b.id, groupId: r.groupId ? grpMap.get(r.groupId) ?? null : null, name: r.name, values: remap(r.values), position: r.position, creatorId: r.creatorId }).returning().get().id);
      for (const r of rows.filter((x) => x.parentItemId && itemMap.has(x.parentItemId))) itemMap.set(r.id, db.insert(items).values({ boardId: b.id, groupId: r.groupId ? grpMap.get(r.groupId) ?? null : null, parentItemId: itemMap.get(r.parentItemId!), name: r.name, values: remap(r.values), position: r.position, creatorId: r.creatorId }).returning().get().id);
      if (opts.withUpdates) {
        for (const u of db.select().from(updates).where(eq(updates.boardId, boardId)).orderBy(asc(updates.createdAt)).all()) {
          const ni = itemMap.get(u.itemId);
          if (ni) db.insert(updates).values({ itemId: ni, boardId: b.id, userId: u.userId, body: u.body, bodyText: u.bodyText }).run();
        }
      }
    }
    return b;
  });
  record(actor, { type: "board.created", boardId: copy.id }, { event: "duplicate_board", data: { name: copy.name, from: src.name } });
  return copy;
}

/* ---------------------------------------------------------------- members + favorites */

export type BoardMemberRow = { userId: string; role: "owner" | "editor" | "viewer"; name: string; email: string };

export function listMembers(actor: Actor, boardId: string): BoardMemberRow[] {
  requireBoard(actor, boardId, "board:view");
  return db.select({ userId: boardMembers.userId, role: boardMembers.role, name: users.name, email: users.email })
    .from(boardMembers).innerJoin(users, eq(users.id, boardMembers.userId)).where(eq(boardMembers.boardId, boardId)).all();
}

export function setMember(actor: Actor, boardId: string, userId: string, role: "owner" | "editor" | "viewer" = "editor"): void {
  requireBoard(actor, boardId, "board:manage_members");
  const u = db.select().from(users).where(and(eq(users.id, userId), eq(users.accountId, actor.accountId))).get();
  if (!u) throw new NotFoundError("User");
  db.insert(boardMembers).values({ boardId, userId, role }).onConflictDoUpdate({ target: [boardMembers.boardId, boardMembers.userId], set: { role } }).run();
  record(actor, { type: "member.changed", boardId }, { event: "set_board_member", data: { userId, role } });
}

export function removeMember(actor: Actor, boardId: string, userId: string): void {
  requireBoard(actor, boardId, userId === actor.id ? "board:view" : "board:manage_members");
  db.delete(boardMembers).where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId))).run();
  record(actor, { type: "member.changed", boardId }, { event: "remove_board_member", data: { userId } });
}

export function listFavorites(actor: Actor): Board[] {
  const ids = db.select({ boardId: favorites.boardId }).from(favorites).where(eq(favorites.userId, actor.id)).orderBy(asc(favorites.position)).all().map((r) => r.boardId);
  if (!ids.length) return [];
  const visible = boardVisibilityFilter(actor);
  const rows = db.select().from(boards).where(and(inArray(boards.id, ids), eq(boards.state, "active"))).all().filter((b) => visible(b));
  return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as Board[];
}

/** Returns the new favorite state. */
export function toggleFavorite(actor: Actor, boardId: string): boolean {
  requireBoard(actor, boardId, "board:view");
  const key = and(eq(favorites.userId, actor.id), eq(favorites.boardId, boardId));
  if (db.select().from(favorites).where(key).get()) {
    db.delete(favorites).where(key).run();
    return false;
  }
  const last = db.select({ position: favorites.position }).from(favorites).where(eq(favorites.userId, actor.id)).all();
  db.insert(favorites).values({ userId: actor.id, boardId, position: Math.max(0, ...last.map((l) => l.position)) + 1000 }).run();
  return true;
}

export function canEdit(actor: Actor, boardId: string) {
  return { items: can(actor, "board:edit_items", { boardId }), structure: can(actor, "board:edit_structure", { boardId }), comment: can(actor, "board:comment", { boardId }) };
}

export { getBoardRow };
