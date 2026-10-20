import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { NotFoundError, ValidationError } from "../../lib/errors";
import { hexColor, positionSpecSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { groups, items } from "../../db/schema/core";
import { computePosition, getGroupRow, parse, record, requireBoard, type GroupRow } from "./_shared";

export type Group = GroupRow;

export const GROUP_COLORS = ["#579bfc", "#00c875", "#fdab3d", "#df2f4a", "#a25ddc", "#ff158a", "#66ccff", "#cab641", "#037f4c", "#7f5347"];

const createInput = z.object({ title: z.string().trim().min(1).max(255).default("New group"), color: hexColor.optional(), ...positionSpecSchema.shape });
const updateInput = z.object({ title: z.string().trim().min(1).max(255).optional(), color: hexColor.optional() });

export function activeGroups(boardId: string): GroupRow[] {
  return db.select().from(groups).where(and(eq(groups.boardId, boardId), eq(groups.state, "active"))).orderBy(asc(groups.position)).all();
}

export function insertGroupRow(boardId: string, d: z.output<typeof createInput>): GroupRow {
  const siblings = activeGroups(boardId).map((g) => ({ id: g.id, position: g.position }));
  const color = d.color ?? GROUP_COLORS[siblings.length % GROUP_COLORS.length];
  return db.insert(groups).values({ boardId, title: d.title, color, position: computePosition(siblings, d) }).returning().get();
}

export function list(actor: Actor, boardId: string): Group[] {
  requireBoard(actor, boardId, "board:view");
  return activeGroups(boardId);
}

export function get(actor: Actor, groupId: string): Group {
  const g = getGroupRow(groupId);
  requireBoard(actor, g.boardId, "board:view");
  return g;
}

export function create(actor: Actor, boardId: string, input: unknown): Group {
  const d = parse(createInput, input);
  requireBoard(actor, boardId, "board:edit_structure");
  const g = insertGroupRow(boardId, d);
  record(actor, { type: "group.created", boardId, groupId: g.id }, { event: "create_group", data: { title: g.title } });
  return g;
}

export function update(actor: Actor, groupId: string, input: unknown): Group {
  const d = parse(updateInput, input);
  const cur = getGroupRow(groupId);
  requireBoard(actor, cur.boardId, "board:edit_structure");
  const g = db.update(groups).set(d).where(eq(groups.id, groupId)).returning().get();
  record(actor, { type: "group.updated", boardId: cur.boardId, groupId }, { event: "update_group", data: { title: g.title, previousTitle: cur.title } });
  return g;
}

export function move(actor: Actor, groupId: string, spec: unknown): Group {
  const s = parse(positionSpecSchema, spec);
  const cur = getGroupRow(groupId);
  requireBoard(actor, cur.boardId, "board:edit_structure");
  const siblings = activeGroups(cur.boardId).filter((g) => g.id !== groupId).map((g) => ({ id: g.id, position: g.position }));
  const g = db.update(groups).set({ position: computePosition(siblings, s) }).where(eq(groups.id, groupId)).returning().get();
  record(actor, { type: "group.updated", boardId: cur.boardId, groupId }, null);
  return g;
}

/** Soft delete the group and every item in it (also subitems). */
export function remove(actor: Actor, groupId: string): void {
  const cur = getGroupRow(groupId);
  requireBoard(actor, cur.boardId, "board:edit_structure");
  if (activeGroups(cur.boardId).length <= 1) throw new ValidationError("A board needs at least one group");
  db.transaction((tx) => {
    tx.update(items).set({ state: "deleted" }).where(eq(items.groupId, groupId)).run();
    tx.update(groups).set({ state: "deleted" }).where(eq(groups.id, groupId)).run();
  });
  record(actor, { type: "group.deleted", boardId: cur.boardId, groupId }, { event: "delete_group", data: { title: cur.title } });
}

export function archive(actor: Actor, groupId: string): Group {
  const cur = getGroupRow(groupId);
  requireBoard(actor, cur.boardId, "board:edit_structure");
  db.transaction((tx) => {
    tx.update(items).set({ state: "archived" }).where(and(eq(items.groupId, groupId), eq(items.state, "active"))).run();
    tx.update(groups).set({ state: "archived" }).where(eq(groups.id, groupId)).run();
  });
  record(actor, { type: "group.deleted", boardId: cur.boardId, groupId }, { event: "archive_group", data: { title: cur.title } });
  return { ...cur, state: "archived" };
}

/** Duplicate a group; with `withItems` items (and subitems) are copied too. */
export function duplicate(actor: Actor, groupId: string, opts: { withItems?: boolean; title?: string } = {}): Group {
  const cur = getGroupRow(groupId);
  requireBoard(actor, cur.boardId, "board:edit_structure");
  const copy = insertGroupRow(cur.boardId, { title: opts.title ?? `Duplicate of ${cur.title}`, color: cur.color, afterId: cur.id });
  if (opts.withItems !== false) {
    const rows = db.select().from(items).where(and(eq(items.groupId, groupId), eq(items.state, "active"))).orderBy(asc(items.position)).all();
    const idMap = new Map<string, string>();
    db.transaction((tx) => {
      for (const r of rows.filter((x) => !x.parentItemId)) {
        const n = tx.insert(items).values({ boardId: r.boardId, groupId: copy.id, name: r.name, values: r.values, position: r.position, creatorId: actor.isSystem ? null : actor.id }).returning().get();
        idMap.set(r.id, n.id);
      }
      for (const r of rows.filter((x) => x.parentItemId && idMap.has(x.parentItemId))) {
        tx.insert(items).values({ boardId: r.boardId, groupId: copy.id, parentItemId: idMap.get(r.parentItemId!), name: r.name, values: r.values, position: r.position, creatorId: actor.isSystem ? null : actor.id }).run();
      }
    });
  }
  record(actor, { type: "group.created", boardId: cur.boardId, groupId: copy.id }, { event: "duplicate_group", data: { title: copy.title, from: cur.title } });
  return copy;
}

/** Restore (active) or archive/delete a group together with the items that were hidden with it. */
export function setState(actor: Actor, groupId: string, state: "active" | "archived" | "deleted"): Group {
  const cur = db.select().from(groups).where(eq(groups.id, groupId)).get();
  if (!cur) throw new NotFoundError("Group");
  requireBoard(actor, cur.boardId, "board:edit_structure");
  if (cur.state === state) return cur;
  if (state === "active") {
    db.transaction((tx) => {
      tx.update(items).set({ state: "active" }).where(and(eq(items.groupId, groupId), eq(items.state, cur.state))).run();
      tx.update(groups).set({ state: "active" }).where(eq(groups.id, groupId)).run();
    });
    record(actor, { type: "group.created", boardId: cur.boardId, groupId }, { event: "restore_group", data: { title: cur.title } });
    return { ...cur, state };
  }
  return state === "archived" ? archive(actor, groupId) : (remove(actor, groupId), { ...cur, state });
}
