import { and, asc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { NotFoundError } from "../../lib/errors";
import { positionSpecSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { views } from "../../db/schema/core";
import { getViewType } from "../views/registry";
import { filterViewsForActor } from "./guests";
import { computePosition, parse, record, requireBoard } from "./_shared";

export type View = typeof views.$inferSelect;

const createInput = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.string().min(1).max(60).default("table"),
  settings: z.record(z.string(), z.unknown()).optional(),
  filters: z.array(z.unknown()).optional(),
  sort: z.array(z.unknown()).optional(),
  personal: z.boolean().default(false),
  ...positionSpecSchema.shape,
});
const updateInput = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  filters: z.array(z.unknown()).optional(),
  sort: z.array(z.unknown()).optional(),
  ...positionSpecSchema.shape,
});

/** Shared views + the actor's personal views. */
export function list(actor: Actor, boardId: string): View[] {
  requireBoard(actor, boardId, "board:view");
  const rows = db.select().from(views).where(and(eq(views.boardId, boardId), or(isNull(views.ownerId), eq(views.ownerId, actor.id)))).orderBy(asc(views.position)).all();
  return filterViewsForActor(actor, boardId, rows); // guests only get the views the owner released
}

export function insertViewRow(boardId: string, d: Partial<z.output<typeof createInput>> & { name: string }, ownerId: string | null = null): View {
  const type = d.type ?? "table";
  const def = getViewType(type);
  const siblings = db.select({ id: views.id, position: views.position }).from(views).where(eq(views.boardId, boardId)).orderBy(asc(views.position)).all();
  return db.insert(views).values({
    boardId, name: d.name, type, settings: { ...(def?.defaultSettings() ?? {}), ...(d.settings ?? {}) },
    filters: d.filters ?? [], sort: d.sort ?? [], ownerId, position: computePosition(siblings, d),
  }).returning().get();
}

export function create(actor: Actor, boardId: string, input: unknown): View {
  const d = parse(createInput, input);
  requireBoard(actor, boardId, d.personal ? "board:view" : "board:edit_structure");
  const v = insertViewRow(boardId, d, d.personal && !actor.isSystem ? actor.id : null);
  record(actor, { type: "view.created", boardId, viewId: v.id }, { event: "create_view", data: { name: v.name, viewType: v.type } });
  return v;
}

function getRow(viewId: string): View {
  const v = db.select().from(views).where(eq(views.id, viewId)).get();
  if (!v) throw new NotFoundError("View");
  return v;
}

export function update(actor: Actor, viewId: string, input: unknown): View {
  const { position, beforeId, afterId, top, ...fields } = parse(updateInput, input);
  const cur = getRow(viewId);
  requireBoard(actor, cur.boardId, cur.ownerId === actor.id ? "board:view" : "board:edit_structure");
  const set: Partial<typeof views.$inferInsert> = { ...fields };
  if (position !== undefined || beforeId || afterId || top) {
    const siblings = db.select({ id: views.id, position: views.position }).from(views).where(eq(views.boardId, cur.boardId)).orderBy(asc(views.position)).all().filter((x) => x.id !== viewId);
    set.position = computePosition(siblings, { position, beforeId, afterId, top });
  }
  const v = db.update(views).set(set).where(eq(views.id, viewId)).returning().get();
  record(actor, { type: "view.updated", boardId: cur.boardId, viewId }, null);
  return v;
}

export function remove(actor: Actor, viewId: string): void {
  const cur = getRow(viewId);
  requireBoard(actor, cur.boardId, cur.ownerId === actor.id ? "board:view" : "board:edit_structure");
  db.delete(views).where(eq(views.id, viewId)).run();
  record(actor, { type: "view.deleted", boardId: cur.boardId, viewId }, { event: "delete_view", data: { name: cur.name } });
}

/* ---------------------------------------------------------------- saved view state (table-ux) */

const filterRule = z.object({ columnId: z.string().min(1), op: z.string().min(1), operand: z.unknown().optional(), join: z.enum(["and", "or"]).optional() });
const sortRule = z.object({ columnId: z.string().min(1), dir: z.enum(["asc", "desc"]) });
/** The persistent part of the toolbar state (search and person filter are never saved). */
export const savedStateSchema = z.object({
  filters: z.array(filterRule).max(50).default([]),
  sort: z.array(sortRule).max(10).default([]),
  hiddenColumnIds: z.array(z.string()).max(500).default([]),
  groupByColumnId: z.string().nullable().default(null),
  pinnedColumnIds: z.array(z.string()).max(50).default([]),
});
export type SavedState = z.infer<typeof savedStateSchema>;

const stateToColumns = (st: SavedState) => ({
  filters: st.filters,
  sort: st.sort,
  settings: { hiddenColumnIds: st.hiddenColumnIds, groupByColumnId: st.groupByColumnId, pinnedColumnIds: st.pinnedColumnIds },
});

/** "Save as new view": a copy of the current toolbar state as a personal (default) or shared view. */
export function createFromState(actor: Actor, boardId: string, input: unknown): View {
  const d = parse(z.object({ name: z.string().trim().min(1).max(100), type: z.string().min(1).max(60).default("table"), personal: z.boolean().default(true), state: savedStateSchema, settings: z.record(z.string(), z.unknown()).optional() }), input);
  const c = stateToColumns(d.state);
  return create(actor, boardId, { name: d.name, type: d.type, personal: d.personal, filters: c.filters, sort: c.sort, settings: { ...(d.settings ?? {}), ...c.settings } });
}

/** "Save to this view": persist the toolbar state on an existing view (own personal view or shared view with structure rights). */
export function saveState(actor: Actor, viewId: string, input: unknown): View {
  const st = parse(savedStateSchema, input);
  const cur = getRow(viewId);
  const c = stateToColumns(st);
  return update(actor, viewId, { filters: c.filters, sort: c.sort, settings: { ...cur.settings, ...c.settings } });
}

/** Share a personal view with the board (needs structure rights) or make a shared view personal for yourself. */
export function setShared(actor: Actor, viewId: string, shared: boolean): View {
  const cur = getRow(viewId);
  if (shared) {
    requireBoard(actor, cur.boardId, "board:edit_structure");
    if (cur.ownerId !== actor.id && !actor.isSystem && actor.role !== "admin") throw new NotFoundError("View");
  } else requireBoard(actor, cur.boardId, "board:edit_structure");
  const v = db.update(views).set({ ownerId: shared ? null : actor.isSystem ? cur.ownerId : actor.id }).where(eq(views.id, viewId)).returning().get();
  record(actor, { type: "view.updated", boardId: cur.boardId, viewId }, { event: "update_view", data: { name: v.name, shared } });
  return v;
}

/** Copy a view (type, settings, filters, sort) right behind the original. */
export function duplicate(actor: Actor, viewId: string): View {
  const cur = getRow(viewId);
  requireBoard(actor, cur.boardId, "board:edit_structure");
  const v = insertViewRow(cur.boardId, { name: `${cur.name} (kopie)`.slice(0, 100), type: cur.type, settings: cur.settings, filters: cur.filters, sort: cur.sort, afterId: cur.id }, cur.ownerId);
  record(actor, { type: "view.created", boardId: cur.boardId, viewId: v.id }, { event: "create_view", data: { name: v.name, viewType: v.type } });
  return v;
}

/** The default view is the first tab: move it to the top. */
export function setDefault(actor: Actor, viewId: string): View {
  return update(actor, viewId, { top: true });
}
