/** Item structure operations: convert an item into a subitem and back. */
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ValidationError } from "../../lib/errors";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { items } from "../../db/schema/core";
import { statusLabels } from "../columns/labels";
import { activeGroups } from "./groups";
import { ensureSubitemColumns } from "./items";
import { boardColumns, computePosition, getGroupRow, getItemRow, parse, record, requireBoard, type ColumnRow, type ItemRow } from "./_shared";

/** Map stored values from one column scope to the other: same key + type, status labels by text. */
export function mapValuesAcrossScopes(values: Record<string, unknown>, from: ColumnRow[], to: ColumnRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const sc of from) {
    const v = values[sc.id];
    if (v === undefined || sc.type === "name") continue;
    const dc = to.find((c) => c.type === sc.type && c.key === sc.key) ?? to.find((c) => c.type === sc.type && c.title.toLowerCase() === sc.title.toLowerCase());
    if (!dc) continue;
    if (sc.type === "status") {
      const text = statusLabels(sc.settings).find((l) => l.id === (v as { index: number }).index)?.text;
      const hit = statusLabels(dc.settings).find((l) => l.text === text);
      if (hit) out[dc.id] = { index: hit.id };
    } else out[dc.id] = v;
  }
  return out;
}

const lastPos = (rows: { position: number }[]) => (rows.length ? rows[rows.length - 1].position + 1000 : 1000);

/** Turn a top-level item (without subitems) into a subitem of `parentItemId`. */
export function convertToSubitem(actor: Actor, itemId: string, parentItemId: string): ItemRow {
  const d = parse(z.object({ itemId: idSchema, parentItemId: idSchema }), { itemId, parentItemId });
  const cur = getItemRow(d.itemId);
  requireBoard(actor, cur.boardId, "board:edit_items", { itemId: cur.id });
  if (cur.parentItemId) throw new ValidationError("Item is already a subitem");
  const parent = getItemRow(d.parentItemId);
  if (parent.boardId !== cur.boardId) throw new ValidationError("Parent item is on another board");
  if (parent.parentItemId || parent.id === cur.id) throw new ValidationError("Invalid parent item");
  const hasSubs = db.select({ id: items.id }).from(items).where(and(eq(items.parentItemId, cur.id), eq(items.state, "active"))).get();
  if (hasSubs) throw new ValidationError("An item with subitems cannot become a subitem");
  const subCols = ensureSubitemColumns(cur.boardId);
  const values = mapValuesAcrossScopes(cur.values, boardColumns(cur.boardId, "item"), subCols);
  const siblings = db.select({ position: items.position }).from(items).where(and(eq(items.parentItemId, parent.id), eq(items.state, "active"))).orderBy(asc(items.position)).all();
  const row = db.update(items).set({ parentItemId: parent.id, groupId: parent.groupId, values, position: lastPos(siblings) }).where(eq(items.id, cur.id)).returning().get();
  record(actor, { type: "item.moved", boardId: cur.boardId, itemId: cur.id, parentItemId: parent.id }, { event: "convert_to_subitem", data: { name: cur.name, parentItemId: parent.id, fromGroupId: cur.groupId } });
  return row;
}

/** Turn a subitem into a top-level item (default: in the group of its parent, right after it). */
export function convertToItem(actor: Actor, itemId: string, opts: { groupId?: string } = {}): ItemRow {
  const d = parse(z.object({ itemId: idSchema, groupId: idSchema.optional() }), { itemId, groupId: opts.groupId });
  const cur = getItemRow(d.itemId);
  requireBoard(actor, cur.boardId, "board:edit_items", { itemId: cur.id });
  if (!cur.parentItemId) throw new ValidationError("Item is not a subitem");
  const parent = getItemRow(cur.parentItemId);
  const groupId = d.groupId ?? parent.groupId ?? activeGroups(cur.boardId)[0]?.id ?? null;
  if (!groupId) throw new ValidationError("Board has no group");
  if (getGroupRow(groupId).boardId !== cur.boardId) throw new ValidationError("Group is on another board");
  const values = mapValuesAcrossScopes(cur.values, boardColumns(cur.boardId, "subitem"), boardColumns(cur.boardId, "item"));
  const sibs = db.select({ id: items.id, position: items.position }).from(items).where(and(eq(items.groupId, groupId), eq(items.state, "active"), isNull(items.parentItemId))).orderBy(asc(items.position)).all().filter((r) => r.id !== cur.id);
  const pos = computePosition(sibs, d.groupId ? {} : { afterId: parent.id });
  const row = db.update(items).set({ parentItemId: null, groupId, values, position: pos }).where(eq(items.id, cur.id)).returning().get();
  record(actor, { type: "item.moved", boardId: cur.boardId, itemId: cur.id }, { event: "convert_to_item", data: { name: cur.name, fromParentId: parent.id }, groupId });
  return row;
}
