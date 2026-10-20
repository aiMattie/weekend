import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ValidationError } from "../../lib/errors";
import { positionSpecSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { columns, items } from "../../db/schema/core";
import { getColumnLogic } from "../columns/registry";
import * as columnHooks from "./column-hooks";
import { boardColumns, computePosition, getColumnRow, parse, record, requireBoard, type ColumnRow } from "./_shared";

export type Column = ColumnRow;

const createInput = z.object({
  title: z.string().trim().min(1).max(255),
  type: z.string().min(1).max(60),
  scope: z.enum(["item", "subitem"]).default("item"),
  settings: z.record(z.string(), z.unknown()).optional(),
  description: z.string().max(1000).nullish(),
  width: z.number().int().min(40).max(1200).nullish(),
  key: z.string().regex(/^[a-z][a-z0-9_]*$/).max(60).optional(),
  ...positionSpecSchema.shape,
});

const updateInput = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  description: z.string().max(1000).nullish(),
  width: z.number().int().min(40).max(1200).nullish(),
  archived: z.boolean().optional(),
});

/** key: type name + numeric suffix when taken ("status", "status_2"...). */
export function uniqueKey(boardId: string, scope: "item" | "subitem", base: string): string {
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "column";
  const base2 = /^[a-z]/.test(slug) ? slug : `c_${slug}`;
  const taken = new Set(boardColumns(boardId, scope).map((c) => c.key));
  if (!taken.has(base2)) return base2;
  for (let i = 2; ; i++) if (!taken.has(`${base2}_${i}`)) return `${base2}_${i}`;
}

/** Insert without permission checks/events (used by boards.create, seed, duplication). */
export function insertColumnRow(boardId: string, d: z.output<typeof createInput>, opts: { keyBase?: string } = {}): ColumnRow {
  const logic = getColumnLogic(d.type);
  const settings = logic.normalizeSettings ? logic.normalizeSettings({ ...logic.defaultSettings(), ...(d.settings ?? {}) }) : { ...logic.defaultSettings(), ...(d.settings ?? {}) };
  const siblings = boardColumns(boardId, d.scope).map((c) => ({ id: c.id, position: c.position }));
  const key = d.key ?? uniqueKey(boardId, d.scope, opts.keyBase ?? (d.type === "name" ? "name" : d.type));
  return db.insert(columns).values({
    boardId, key, title: d.title, type: d.type, scope: d.scope, settings, description: d.description ?? null,
    width: d.width ?? null, position: computePosition(siblings, d),
  }).returning().get();
}

export function list(actor: Actor, boardId: string, scope?: "item" | "subitem"): Column[] {
  requireBoard(actor, boardId, "board:view");
  return boardColumns(boardId, scope);
}

export function get(actor: Actor, columnId: string): Column {
  const c = getColumnRow(columnId);
  requireBoard(actor, c.boardId, "board:view");
  return c;
}

export function create(actor: Actor, boardId: string, input: unknown): Column {
  const d = parse(createInput, input);
  requireBoard(actor, boardId, "board:edit_structure");
  if (d.type === "name") throw new ValidationError("A board has exactly one name column");
  const c = insertColumnRow(boardId, d);
  record(actor, { type: "column.created", boardId, columnId: c.id }, { event: "create_column", columnId: c.id, data: { title: c.title, columnType: c.type } });
  columnHooks.onColumnCreated(actor, c);
  return getColumnRow(c.id);
}

export function update(actor: Actor, columnId: string, input: unknown): Column {
  const d = parse(updateInput, input);
  const cur = getColumnRow(columnId);
  requireBoard(actor, cur.boardId, "board:edit_structure");
  const logic = getColumnLogic(cur.type);
  const patch: Partial<typeof columns.$inferInsert> = { ...d, settings: undefined };
  if (d.settings) patch.settings = logic.normalizeSettings ? logic.normalizeSettings({ ...cur.settings, ...d.settings }) : { ...cur.settings, ...d.settings };
  const row = db.update(columns).set(patch).where(eq(columns.id, columnId)).returning().get();
  record(actor, { type: "column.updated", boardId: cur.boardId, columnId }, { event: "update_column", columnId, data: { title: row.title, previousTitle: cur.title } });
  columnHooks.onColumnUpdated(actor, cur, row);
  return getColumnRow(columnId);
}

export function move(actor: Actor, columnId: string, spec: unknown): Column {
  const s = parse(positionSpecSchema, spec);
  const cur = getColumnRow(columnId);
  requireBoard(actor, cur.boardId, "board:edit_structure");
  const siblings = boardColumns(cur.boardId, cur.scope).filter((c) => c.id !== columnId).map((c) => ({ id: c.id, position: c.position }));
  const row = db.update(columns).set({ position: computePosition(siblings, s) }).where(eq(columns.id, columnId)).returning().get();
  record(actor, { type: "column.updated", boardId: cur.boardId, columnId }, null);
  return row;
}

/** Deletes the column and strips its values from every item. */
export function remove(actor: Actor, columnId: string): void {
  const cur = getColumnRow(columnId);
  requireBoard(actor, cur.boardId, "board:edit_structure");
  if (cur.type === "name") throw new ValidationError("The name column cannot be deleted");
  columnHooks.onColumnDeleted(actor, cur);
  db.transaction((tx) => {
    const rows = tx.select({ id: items.id, values: items.values }).from(items).where(eq(items.boardId, cur.boardId)).all();
    for (const r of rows) {
      if (columnId in r.values) {
        const { [columnId]: _removed, ...rest } = r.values; // eslint-disable-line @typescript-eslint/no-unused-vars
        tx.update(items).set({ values: rest }).where(eq(items.id, r.id)).run();
      }
    }
    tx.delete(columns).where(eq(columns.id, columnId)).run();
  });
  record(actor, { type: "column.deleted", boardId: cur.boardId, columnId }, { event: "delete_column", columnId, data: { title: cur.title } });
}

export function duplicate(actor: Actor, columnId: string): Column {
  const cur = getColumnRow(columnId);
  requireBoard(actor, cur.boardId, "board:edit_structure");
  if (cur.type === "name") throw new ValidationError("The name column cannot be duplicated");
  const copy = insertColumnRow(cur.boardId, { title: `${cur.title} copy`, type: cur.type, scope: cur.scope, settings: cur.settings, afterId: cur.id, width: cur.width }, { keyBase: cur.type });
  const rows = db.select({ id: items.id, values: items.values }).from(items).where(and(eq(items.boardId, cur.boardId))).all();
  db.transaction((tx) => {
    for (const r of rows) if (r.values[cur.id] !== undefined) tx.update(items).set({ values: { ...r.values, [copy.id]: r.values[cur.id] } }).where(eq(items.id, r.id)).run();
  });
  record(actor, { type: "column.created", boardId: cur.boardId, columnId: copy.id }, { event: "create_column", columnId: copy.id, data: { title: copy.title } });
  columnHooks.onColumnCreated(actor, copy);
  return getColumnRow(copy.id);
}

