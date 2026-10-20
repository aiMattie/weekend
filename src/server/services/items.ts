import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { NotFoundError, ValidationError } from "../../lib/errors";
import { idSchema, positionSpecSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { columns, items, updates } from "../../db/schema/core";
import { getColumnLogic } from "../columns/registry";
import type { PeopleValue } from "../columns/people";
import { activeGroups } from "./groups";
import * as columnHooks from "./column-hooks";
import { decorateItems } from "./computed";
import { insertColumnRow } from "./columns";
import { boardColumns, computePosition, formatContext, getColumnRow, getGroupRow, getItemRow, notify, parse, record, requireBoard, resolveColumn, type ColumnRow, type ItemRow } from "./_shared";

export type Item = ItemRow;
export type ItemWithMeta = Item & { subitemCount: number; updateCount: number };

const valuesSchema = z.record(z.string(), z.unknown());

const createInput = z.object({
  boardId: idSchema,
  groupId: idSchema.nullish(),
  parentItemId: idSchema.nullish(),
  name: z.string().trim().min(1, "Item name is required").max(1000),
  /** keyed by column id or key */
  values: valuesSchema.optional(),
  ...positionSpecSchema.shape,
});

export const itemQuerySchema = z.object({
  boardId: idSchema,
  groupId: idSchema.optional(),
  parentItemId: idSchema.optional(),
  includeSubitems: z.boolean().default(false),
  state: z.enum(["active", "archived", "deleted"]).default("active"),
  limit: z.number().int().min(1).max(5000).default(1000),
  offset: z.number().int().min(0).default(0),
});

/* ------------------------------------------------------------ helpers */

function siblingsOf(boardId: string, groupId: string | null, parentItemId: string | null, excludeId?: string) {
  const rows = db.select({ id: items.id, position: items.position }).from(items)
    .where(and(
      eq(items.boardId, boardId), eq(items.state, "active"),
      parentItemId ? eq(items.parentItemId, parentItemId) : groupId ? eq(items.groupId, groupId) : undefined,
    )).orderBy(asc(items.position)).all();
  return excludeId ? rows.filter((r) => r.id !== excludeId) : rows;
}

/** Validate raw input values (keyed by column id or key) into stored values keyed by column id. */
export function normalizeValues(boardId: string, scope: "item" | "subitem", raw: Record<string, unknown>): { values: Record<string, unknown>; name?: string } {
  const values: Record<string, unknown> = {};
  let name: string | undefined;
  for (const [ref, input] of Object.entries(raw)) {
    const col = resolveColumn(boardId, ref, scope);
    if (col.type === "name") {
      name = String(input ?? "").trim();
      if (!name) throw new ValidationError("Item name cannot be empty");
      continue;
    }
    const logic = getColumnLogic(col.type);
    if (logic.readOnly) throw new ValidationError(`Column "${col.title}" is read-only`);
    const stored = logic.validate(input, col);
    if (stored !== null) values[col.id] = stored;
  }
  return { values, name };
}

function peopleIds(v: unknown): string[] {
  return ((v as PeopleValue | null)?.personsAndTeams ?? []).filter((p) => p.kind === "person").map((p) => p.id);
}

/** Create the subitem-scope default columns on first use (Name, People, Status, Date). */
export function ensureSubitemColumns(boardId: string): ColumnRow[] {
  const existing = boardColumns(boardId, "subitem");
  if (existing.length) return existing;
  const defs = [
    { title: "Subitem", type: "name" }, { title: "Owner", type: "people", key: "people" },
    { title: "Status", type: "status", key: "status" }, { title: "Date", type: "date", key: "date" },
  ];
  for (const d of defs) insertColumnRow(boardId, { ...d, scope: "subitem" }, { keyBase: d.type });
  return boardColumns(boardId, "subitem");
}

function withMeta(rows: ItemRow[], actor?: Actor): ItemWithMeta[] {
  if (!rows.length) return [];
  if (actor) rows = decorateItems(actor, rows); // computed columns + column permissions (services/computed.ts)
  const ids = rows.map((r) => r.id);
  const subs = db.select({ parentItemId: items.parentItemId }).from(items).where(and(inArray(items.parentItemId, ids), eq(items.state, "active"))).all();
  const ups = db.select({ itemId: updates.itemId }).from(updates).where(inArray(updates.itemId, ids)).all();
  const sc = new Map<string, number>();
  const uc = new Map<string, number>();
  for (const s of subs) sc.set(s.parentItemId!, (sc.get(s.parentItemId!) ?? 0) + 1);
  for (const u of ups) uc.set(u.itemId, (uc.get(u.itemId) ?? 0) + 1);
  return rows.map((r) => ({ ...r, subitemCount: sc.get(r.id) ?? 0, updateCount: uc.get(r.id) ?? 0 }));
}

/* ------------------------------------------------------------ queries */

export function list(actor: Actor, query: unknown): ItemWithMeta[] {
  const q = parse(itemQuerySchema, query);
  requireBoard(actor, q.boardId, "board:view");
  const rows = db.select().from(items)
    .where(and(
      eq(items.boardId, q.boardId), eq(items.state, q.state),
      q.groupId ? eq(items.groupId, q.groupId) : undefined,
      q.parentItemId ? eq(items.parentItemId, q.parentItemId) : q.includeSubitems ? undefined : isNull(items.parentItemId),
    ))
    .orderBy(asc(items.position)).limit(q.limit).offset(q.offset).all();
  return withMeta(rows, actor);
}

export function get(actor: Actor, itemId: string): ItemWithMeta & { subitems: ItemWithMeta[] } {
  const it = getItemRow(itemId);
  requireBoard(actor, it.boardId, "board:view");
  const subs = db.select().from(items).where(and(eq(items.parentItemId, itemId), eq(items.state, "active"))).orderBy(asc(items.position)).all();
  const [meta] = withMeta([it], actor);
  return { ...meta, subitems: withMeta(subs, actor) };
}

export function listSubitems(actor: Actor, parentItemId: string): ItemWithMeta[] {
  const p = getItemRow(parentItemId);
  requireBoard(actor, p.boardId, "board:view");
  return withMeta(db.select().from(items).where(and(eq(items.parentItemId, parentItemId), eq(items.state, "active"))).orderBy(asc(items.position)).all(), actor);
}

/* ------------------------------------------------------------ mutations */

export function create(actor: Actor, input: unknown): Item {
  const d = parse(createInput, input);
  requireBoard(actor, d.boardId, "board:edit_items");
  let groupId = d.groupId ?? null;
  let scope: "item" | "subitem" = "item";
  if (d.parentItemId) {
    const parent = getItemRow(d.parentItemId);
    if (parent.boardId !== d.boardId) throw new ValidationError("Parent item is on another board");
    if (parent.parentItemId) throw new ValidationError("Subitems cannot have subitems");
    groupId = parent.groupId;
    scope = "subitem";
    ensureSubitemColumns(d.boardId);
  } else if (groupId) {
    if (getGroupRow(groupId).boardId !== d.boardId) throw new ValidationError("Group is on another board");
  } else {
    groupId = activeGroups(d.boardId)[0]?.id ?? null;
    if (!groupId) throw new ValidationError("Board has no group to put the item in");
  }
  const { values, name } = normalizeValues(d.boardId, scope, d.values ?? {});
  for (const [colId, v] of Object.entries(values)) {
    const col = getColumnRow(colId);
    const resolved = columnHooks.resolveValue(actor, col, null, v);
    columnHooks.beforeChange(actor, d.boardId, null, col, resolved);
    if (resolved === null) delete values[colId];
    else values[colId] = resolved;
  }
  const pos = computePosition(siblingsOf(d.boardId, groupId, d.parentItemId ?? null), d);
  const item = db.insert(items).values({
    boardId: d.boardId, groupId, parentItemId: d.parentItemId ?? null, name: name ?? d.name, values, position: pos,
    creatorId: actor.isSystem ? null : actor.id,
  }).returning().get();
  record(actor, { type: "item.created", boardId: d.boardId, itemId: item.id, parentItemId: item.parentItemId }, { event: item.parentItemId ? "create_subitem" : "create_item", groupId, data: { name: item.name, parentItemId: item.parentItemId } });
  for (const [colId, v] of Object.entries(values)) afterValueChange(actor, item, colId, null, v);
  return item;
}

export function update(actor: Actor, itemId: string, input: unknown): Item {
  const d = parse(z.object({ name: z.string().trim().min(1).max(1000) }), input);
  const cur = getItemRow(itemId);
  requireBoard(actor, cur.boardId, "board:edit_items", { itemId: cur.id });
  const row = db.update(items).set({ name: d.name }).where(eq(items.id, itemId)).returning().get();
  if (cur.name !== d.name) {
    record(actor, { type: "item.updated", boardId: cur.boardId, itemId }, { event: "rename_item", data: { name: d.name, from: cur.name, to: d.name } });
  }
  return row;
}

function afterValueChange(actor: Actor, item: Item, columnId: string, from: unknown, to: unknown): void {
  const col = db.select().from(columns).where(eq(columns.id, columnId)).get();
  if (col) columnHooks.afterChange(actor, item, col, from, to);
  if (col?.type === "people") {
    const before = new Set(peopleIds(from));
    for (const uid of peopleIds(to)) if (!before.has(uid)) notify(actor, uid, { type: "assigned", title: { key: "notif.assigned", vars: { item: item.name } }, boardId: item.boardId, itemId: item.id });
  }
}

/** change_column_value. `columnRef` = column id or key; `value` = API/UI input. */
export function changeColumnValue(actor: Actor, itemId: string, columnRef: string, value: unknown): Item {
  return changeMultipleColumnValues(actor, itemId, { [columnRef]: value });
}

/** change_multiple_column_values. Keys = column id or key. Atomic: all or nothing. */
export function changeMultipleColumnValues(actor: Actor, itemId: string, input: unknown): Item {
  const raw = parse(valuesSchema, input);
  const cur = getItemRow(itemId);
  requireBoard(actor, cur.boardId, "board:edit_items", { itemId: cur.id });
  const scope = cur.parentItemId ? "subitem" : "item";
  const { values: next, name } = normalizeValues(cur.boardId, scope, raw);
  // which columns were explicitly addressed (null clears)
  const touched = Object.keys(raw).map((r) => resolveColumn(cur.boardId, r, scope)).filter((c) => c.type !== "name");
  const merged: Record<string, unknown> = { ...cur.values };
  const changes: { col: ColumnRow; from: unknown; to: unknown }[] = [];
  for (const col of touched) {
    const from = cur.values[col.id] ?? null;
    const to = columnHooks.resolveValue(actor, col, from, next[col.id] ?? null) ?? null;
    columnHooks.beforeChange(actor, cur.boardId, itemId, col, to);
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    if (to === null) delete merged[col.id];
    else merged[col.id] = to;
    changes.push({ col, from, to });
  }
  const renamed = name !== undefined && name !== cur.name;
  if (!changes.length && !renamed) return cur;
  const row = db.update(items).set({ values: merged, ...(renamed ? { name } : {}) }).where(eq(items.id, itemId)).returning().get();
  if (renamed) record(actor, { type: "item.updated", boardId: cur.boardId, itemId }, { event: "rename_item", data: { from: cur.name, to: name, name } });
  const fmt = changes.some((c) => c.col.type === "people") ? formatContext(actor.accountId) : undefined;
  for (const { col, from, to } of changes) {
    const logic = getColumnLogic(col.type);
    record(
      actor,
      { type: "column_value.changed", boardId: cur.boardId, itemId, columnId: col.id, columnType: col.type, from, to },
      { event: "change_column_value", columnId: col.id, data: { name: cur.name, columnTitle: col.title, columnType: col.type, from: logic.format(from, col, fmt), to: logic.format(to, col, fmt), fromValue: from, toValue: to } },
    );
    afterValueChange(actor, row, col.id, from, to);
  }
  if (changes.length) record(actor, { type: "item.updated", boardId: cur.boardId, itemId }, null);
  return row;
}

const moveInput = z.object({ groupId: idSchema.optional(), boardId: idSchema.optional(), ...positionSpecSchema.shape });

/** Move an item (and its subitems) within a board (group/position) or to another board. */
export function move(actor: Actor, itemId: string, input: unknown): Item {
  const d = parse(moveInput, input);
  const cur = getItemRow(itemId);
  if (cur.parentItemId) {
    // reorder a subitem among its siblings
    requireBoard(actor, cur.boardId, "board:edit_items", { itemId: cur.id });
    const pos = computePosition(siblingsOf(cur.boardId, cur.groupId, cur.parentItemId, itemId), d);
    const row = db.update(items).set({ position: pos }).where(eq(items.id, itemId)).returning().get();
    record(actor, { type: "item.moved", boardId: cur.boardId, itemId, parentItemId: cur.parentItemId }, null);
    return row;
  }
  const targetBoardId = d.boardId ?? cur.boardId;
  requireBoard(actor, cur.boardId, "board:edit_items", { itemId: cur.id });
  if (targetBoardId !== cur.boardId) requireBoard(actor, targetBoardId, "board:edit_items");
  const targetGroupId = d.groupId ?? (targetBoardId === cur.boardId ? cur.groupId : activeGroups(targetBoardId)[0]?.id ?? null);
  if (!targetGroupId) throw new ValidationError("Target board has no group");
  if (getGroupRow(targetGroupId).boardId !== targetBoardId) throw new ValidationError("Group is not on the target board");
  const pos = computePosition(siblingsOf(targetBoardId, targetGroupId, null, itemId), d);

  let values = cur.values;
  if (targetBoardId !== cur.boardId) {
    // remap values to target columns with the same key+type, drop the rest
    const src = boardColumns(cur.boardId, "item");
    const dst = boardColumns(targetBoardId, "item");
    values = {};
    for (const sc of src) {
      const dc = dst.find((c) => c.key === sc.key && c.type === sc.type);
      if (dc && cur.values[sc.id] !== undefined) values[dc.id] = cur.values[sc.id];
    }
  }
  const row = db.transaction((tx) => {
    const r = tx.update(items).set({ boardId: targetBoardId, groupId: targetGroupId, position: pos, values }).where(eq(items.id, itemId)).returning().get();
    tx.update(items).set({ boardId: targetBoardId, groupId: targetGroupId }).where(eq(items.parentItemId, itemId)).run();
    if (targetBoardId !== cur.boardId) tx.update(updates).set({ boardId: targetBoardId }).where(eq(updates.itemId, itemId)).run();
    return r;
  });
  const data = { name: cur.name, fromGroupId: cur.groupId, toGroupId: targetGroupId, fromBoardId: cur.boardId, toBoardId: targetBoardId };
  record(actor, { type: "item.moved", boardId: targetBoardId, itemId }, { event: "move_item", data, groupId: targetGroupId });
  if (targetBoardId !== cur.boardId) record(actor, { type: "item.deleted", boardId: cur.boardId, itemId }, { event: "move_item_out", data });
  return row;
}

export function duplicate(actor: Actor, itemId: string, opts: { withUpdates?: boolean } = {}): Item {
  const cur = getItemRow(itemId);
  requireBoard(actor, cur.boardId, "board:edit_items", { itemId: cur.id });
  const siblings = siblingsOf(cur.boardId, cur.groupId, cur.parentItemId, undefined);
  const pos = computePosition(siblings, { afterId: itemId });
  const copy = db.transaction((tx) => {
    const c = tx.insert(items).values({ boardId: cur.boardId, groupId: cur.groupId, parentItemId: cur.parentItemId, name: `${cur.name} (copy)`, values: cur.values, position: pos, creatorId: actor.isSystem ? null : actor.id }).returning().get();
    const subs = tx.select().from(items).where(and(eq(items.parentItemId, itemId), eq(items.state, "active"))).orderBy(asc(items.position)).all();
    for (const s of subs) tx.insert(items).values({ boardId: s.boardId, groupId: s.groupId, parentItemId: c.id, name: s.name, values: s.values, position: s.position, creatorId: actor.isSystem ? null : actor.id }).run();
    if (opts.withUpdates) {
      const ups = tx.select().from(updates).where(eq(updates.itemId, itemId)).orderBy(asc(updates.createdAt)).all();
      const map = new Map<string, string>();
      for (const u of ups) {
        const n = tx.insert(updates).values({ itemId: c.id, boardId: u.boardId, userId: u.userId, body: u.body, bodyText: u.bodyText, mentions: [], parentUpdateId: u.parentUpdateId ? map.get(u.parentUpdateId) ?? null : null }).returning().get();
        map.set(u.id, n.id);
      }
    }
    return c;
  });
  record(actor, { type: "item.duplicated", boardId: cur.boardId, itemId: copy.id }, { event: "duplicate_item", data: { name: cur.name, copyId: copy.id } });
  return copy;
}

export function archive(actor: Actor, itemId: string): Item {
  const cur = getItemRow(itemId);
  requireBoard(actor, cur.boardId, "board:edit_items", { itemId: cur.id });
  const row = db.transaction((tx) => {
    tx.update(items).set({ state: "archived" }).where(eq(items.parentItemId, itemId)).run();
    return tx.update(items).set({ state: "archived" }).where(eq(items.id, itemId)).returning().get();
  });
  record(actor, { type: "item.archived", boardId: cur.boardId, itemId }, { event: "archive_item", data: { name: cur.name } });
  return row;
}

/** Soft delete (trash). Use `restore` to bring it back. */
export function remove(actor: Actor, itemId: string): void {
  const cur = getItemRow(itemId);
  requireBoard(actor, cur.boardId, "board:edit_items", { itemId: cur.id });
  db.transaction((tx) => {
    tx.update(items).set({ state: "deleted" }).where(eq(items.parentItemId, itemId)).run();
    tx.update(items).set({ state: "deleted" }).where(eq(items.id, itemId)).run();
  });
  record(actor, { type: "item.deleted", boardId: cur.boardId, itemId, parentItemId: cur.parentItemId }, { event: "delete_item", data: { name: cur.name } });
}

export function restore(actor: Actor, itemId: string): Item {
  const cur = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!cur) throw new NotFoundError("Item");
  requireBoard(actor, cur.boardId, "board:edit_items", { itemId: cur.id });
  const row = db.transaction((tx) => {
    tx.update(items).set({ state: "active" }).where(eq(items.parentItemId, itemId)).run();
    return tx.update(items).set({ state: "active" }).where(eq(items.id, itemId)).returning().get();
  });
  record(actor, { type: "item.created", boardId: cur.boardId, itemId }, { event: "restore_item", data: { name: cur.name } });
  return row;
}
