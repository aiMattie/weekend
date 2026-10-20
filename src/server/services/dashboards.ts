/**
 * Dashboards + widgets CRUD. Data aggregation lives in ./widgets.ts, widget definitions in
 * src/modules/boards-extra/widgets/registry.ts.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { assertCan, can } from "../../lib/permissions";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { dashboards, widgets, type WidgetLayout } from "../../db/schema/dashboards";
import { boards, workspaces } from "../../db/schema/core";
import { allWidgetsSchema as registrySchema, defaultWidgetSettings, getWidgetDefinition } from "../../modules/boards-extra/widgets/registry";
import { getBoardRow, parse, requireBoard } from "./_shared";

export type DashboardRow = typeof dashboards.$inferSelect;
export type WidgetRow = typeof widgets.$inferSelect;

const filterRule = z.object({ columnId: z.string(), op: z.string(), operand: z.unknown().optional() });
const layoutSchema = z.object({ x: z.number().int().min(0).max(11), y: z.number().int().min(0), w: z.number().int().min(1).max(12), h: z.number().int().min(1).max(40) });

const createInput = z.object({
  workspaceId: idSchema.optional(),
  name: z.string().trim().min(1).max(255),
  description: z.string().max(2000).optional(),
  boardIds: z.array(idSchema).max(50).default([]),
  visibility: z.enum(["main", "private"]).default("main"),
});
const updateInput = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  boardIds: z.array(idSchema).max(50).optional(),
  filters: z.array(filterRule).max(20).optional(),
  locked: z.boolean().optional(),
  visibility: z.enum(["main", "private"]).optional(),
  memberIds: z.array(idSchema).max(200).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});
const widgetInput = z.object({
  type: z.string().min(1),
  title: z.string().max(255).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  layout: layoutSchema.partial().optional(),
});
const widgetPatch = z.object({
  title: z.string().max(255).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  layout: layoutSchema.optional(),
});

/* ------------------------------------------------------------ access */

export function getRow(id: string): DashboardRow {
  const d = db.select().from(dashboards).where(eq(dashboards.id, id)).get();
  if (!d || d.state === "deleted") throw new NotFoundError("Dashboard");
  return d;
}

export function canView(actor: Actor, d: DashboardRow): boolean {
  if (!can(actor, "workspace:view", { workspaceId: d.workspaceId })) return false;
  if (d.visibility === "main" || actor.isSystem || actor.role === "admin") return true;
  return d.ownerId === actor.id || d.memberIds.includes(actor.id);
}

export function canEdit(actor: Actor, d: DashboardRow): boolean {
  if (!canView(actor, d)) return false;
  if (actor.isSystem || actor.role === "admin" || d.ownerId === actor.id) return true;
  if (d.locked) return false;
  return can(actor, "workspace:create_board", { workspaceId: d.workspaceId });
}

export function requireView(actor: Actor, id: string): DashboardRow {
  const d = getRow(id);
  if (!canView(actor, d)) throw new ForbiddenError("Not allowed to view this dashboard");
  return d;
}
export function requireEdit(actor: Actor, id: string): DashboardRow {
  const d = requireView(actor, id);
  if (!canEdit(actor, d)) throw new ForbiddenError(d.locked ? "This dashboard is locked" : "Not allowed to edit this dashboard");
  return d;
}

function checkBoards(actor: Actor, ids: string[]): void {
  for (const id of ids) requireBoard(actor, id, "board:view");
}

/* ------------------------------------------------------------ dashboards */

export function list(actor: Actor, query: { workspaceId?: string } = {}): (DashboardRow & { widgetCount: number; canEdit: boolean })[] {
  const rows = db.select().from(dashboards).where(and(eq(dashboards.state, "active"), query.workspaceId ? eq(dashboards.workspaceId, query.workspaceId) : undefined)).orderBy(asc(dashboards.name)).all();
  const visible = rows.filter((d) => canView(actor, d));
  const counts = new Map<string, number>();
  if (visible.length) for (const w of db.select({ dashboardId: widgets.dashboardId }).from(widgets).where(inArray(widgets.dashboardId, visible.map((d) => d.id))).all()) counts.set(w.dashboardId, (counts.get(w.dashboardId) ?? 0) + 1);
  return visible.map((d) => ({ ...d, widgetCount: counts.get(d.id) ?? 0, canEdit: canEdit(actor, d) }));
}

export function get(actor: Actor, id: string) {
  const dashboard = requireView(actor, id);
  const ws = db.select().from(widgets).where(eq(widgets.dashboardId, id)).orderBy(asc(widgets.position), asc(widgets.id)).all();
  const bs = dashboard.boardIds.length ? db.select({ id: boards.id, name: boards.name, workspaceId: boards.workspaceId }).from(boards).where(inArray(boards.id, dashboard.boardIds)).all() : [];
  const workspaceName = db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, dashboard.workspaceId)).get()?.name ?? "";
  return { dashboard, widgets: ws, boards: bs.filter((b) => can(actor, "board:view", { boardId: b.id })), canEdit: canEdit(actor, dashboard), workspaceName };
}

export function create(actor: Actor, input: unknown): DashboardRow {
  const d = parse(createInput, input);
  checkBoards(actor, d.boardIds);
  const workspaceId = d.workspaceId ?? (d.boardIds[0] ? getBoardRow(d.boardIds[0]).workspaceId : undefined);
  if (!workspaceId) throw new ValidationError("workspaceId or at least one board is required");
  assertCan(actor, "workspace:create_board", { workspaceId });
  return db.insert(dashboards).values({
    workspaceId, name: d.name, description: d.description ?? null, boardIds: [...new Set(d.boardIds)], visibility: d.visibility,
    ownerId: actor.isSystem ? null : actor.id, memberIds: [],
  }).returning().get();
}

export function update(actor: Actor, id: string, input: unknown): DashboardRow {
  const p = parse(updateInput, input);
  const cur = getRow(id);
  if (!canView(actor, cur)) throw new ForbiddenError();
  // locking/sharing is the owner's call; everything else follows canEdit
  const ownerOnly = p.locked !== undefined || p.visibility !== undefined || p.memberIds !== undefined;
  if (ownerOnly && !(actor.isSystem || actor.role === "admin" || cur.ownerId === actor.id)) throw new ForbiddenError("Only the owner can lock or share this dashboard");
  if (!ownerOnly || Object.keys(p).some((k) => !["locked", "visibility", "memberIds"].includes(k))) requireEdit(actor, id);
  if (p.boardIds) checkBoards(actor, p.boardIds);
  const set: Partial<typeof dashboards.$inferInsert> = {};
  if (p.name !== undefined) set.name = p.name;
  if (p.description !== undefined) set.description = p.description;
  if (p.boardIds) set.boardIds = [...new Set(p.boardIds)];
  if (p.filters) set.filters = p.filters;
  if (p.locked !== undefined) set.locked = p.locked;
  if (p.visibility) set.visibility = p.visibility;
  if (p.memberIds) set.memberIds = [...new Set(p.memberIds)];
  if (p.settings) set.settings = { ...cur.settings, ...p.settings };
  if (!Object.keys(set).length) return cur;
  return db.update(dashboards).set(set).where(eq(dashboards.id, id)).returning().get();
}

export function remove(actor: Actor, id: string): void {
  const cur = requireEdit(actor, id);
  if (!(actor.isSystem || actor.role === "admin" || cur.ownerId === actor.id || can(actor, "workspace:update", { workspaceId: cur.workspaceId }))) throw new ForbiddenError();
  db.update(dashboards).set({ state: "deleted" }).where(eq(dashboards.id, id)).run();
}

export function duplicate(actor: Actor, id: string): DashboardRow {
  const cur = requireView(actor, id);
  assertCan(actor, "workspace:create_board", { workspaceId: cur.workspaceId });
  return db.transaction((tx) => {
    const copy = tx.insert(dashboards).values({
      workspaceId: cur.workspaceId, name: `${cur.name} (copy)`, description: cur.description, boardIds: cur.boardIds, filters: cur.filters,
      visibility: cur.visibility, memberIds: cur.memberIds, settings: cur.settings, ownerId: actor.isSystem ? null : actor.id,
    }).returning().get();
    for (const w of tx.select().from(widgets).where(eq(widgets.dashboardId, id)).orderBy(asc(widgets.position)).all()) {
      tx.insert(widgets).values({ dashboardId: copy.id, type: w.type, title: w.title, settings: w.settings, layout: w.layout, position: w.position }).run();
    }
    return copy;
  });
}

/* ------------------------------------------------------------ widgets */

/** First free spot in the 12-column grid (below everything else, simple and predictable). */
function nextLayout(dashboardId: string, size: { w: number; h: number }): WidgetLayout {
  const rows = db.select({ layout: widgets.layout }).from(widgets).where(eq(widgets.dashboardId, dashboardId)).all();
  const occupied = (x: number, y: number) => rows.some(({ layout: l }) => x < l.x + l.w && x + size.w > l.x && y < l.y + l.h && y + size.h > l.y);
  const maxY = rows.reduce((m, { layout: l }) => Math.max(m, l.y + l.h), 0);
  for (let y = 0; y <= maxY; y++) for (let x = 0; x + size.w <= 12; x++) if (!occupied(x, y)) return { x, y, ...size };
  return { x: 0, y: maxY, ...size };
}

function validateSettings(type: string, settings: Record<string, unknown>): Record<string, unknown> {
  const def = getWidgetDefinition(type);
  if (!def) throw new ValidationError(`Unknown widget type "${type}"`);
  const r = def.configSchema.safeParse(settings);
  if (!r.success) throw new ValidationError(`Invalid settings for ${type}: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, r.error.issues);
  return r.data as Record<string, unknown>;
}

export function createWidget(actor: Actor, dashboardId: string, input: unknown): WidgetRow {
  const d = parse(widgetInput, input);
  requireEdit(actor, dashboardId);
  const def = getWidgetDefinition(d.type);
  if (!def) throw new ValidationError(`Unknown widget type "${d.type}". Known: ${allWidgetsSchema().map((w) => w.type).join(", ")}`);
  const settings = validateSettings(d.type, { ...defaultWidgetSettings(d.type), ...(d.settings ?? {}) });
  const size = { w: d.layout?.w ?? def.defaultLayout.w, h: d.layout?.h ?? def.defaultLayout.h };
  const layout = d.layout?.x !== undefined && d.layout?.y !== undefined ? { x: d.layout.x, y: d.layout.y, ...size } : nextLayout(dashboardId, size);
  const last = db.select({ p: widgets.position }).from(widgets).where(eq(widgets.dashboardId, dashboardId)).orderBy(desc(widgets.position)).limit(1).get();
  return db.insert(widgets).values({ dashboardId, type: d.type, title: d.title ?? def.label, settings, layout, position: (last?.p ?? 0) + 1 }).returning().get();
}

function widgetRow(id: string): WidgetRow {
  const w = db.select().from(widgets).where(eq(widgets.id, id)).get();
  if (!w) throw new NotFoundError("Widget");
  return w;
}

export function getWidget(actor: Actor, widgetId: string): WidgetRow {
  const w = widgetRow(widgetId);
  requireView(actor, w.dashboardId);
  return w;
}

export function updateWidget(actor: Actor, widgetId: string, input: unknown): WidgetRow {
  const p = parse(widgetPatch, input);
  const w = widgetRow(widgetId);
  requireEdit(actor, w.dashboardId);
  const set: Partial<typeof widgets.$inferInsert> = {};
  if (p.title !== undefined) set.title = p.title;
  if (p.settings) set.settings = validateSettings(w.type, p.settings);
  if (p.layout) set.layout = p.layout;
  if (!Object.keys(set).length) return w;
  return db.update(widgets).set(set).where(eq(widgets.id, widgetId)).returning().get();
}

export function removeWidget(actor: Actor, widgetId: string): void {
  const w = widgetRow(widgetId);
  requireEdit(actor, w.dashboardId);
  db.delete(widgets).where(eq(widgets.id, widgetId)).run();
}

export function duplicateWidget(actor: Actor, widgetId: string): WidgetRow {
  const w = widgetRow(widgetId);
  requireEdit(actor, w.dashboardId);
  return db.insert(widgets).values({ dashboardId: w.dashboardId, type: w.type, title: `${w.title} (copy)`, settings: w.settings, layout: nextLayout(w.dashboardId, { w: w.layout.w, h: w.layout.h }), position: w.position + 0.5 }).returning().get();
}

const layoutsInput = z.array(z.object({ id: idSchema, ...layoutSchema.shape })).max(200);
/** Persist the whole grid after a drag/resize (one request). */
export function saveLayout(actor: Actor, dashboardId: string, input: unknown): void {
  const items = parse(layoutsInput, input);
  requireEdit(actor, dashboardId);
  db.transaction((tx) => {
    for (const it of items) tx.update(widgets).set({ layout: { x: it.x, y: it.y, w: it.w, h: it.h } }).where(and(eq(widgets.id, it.id), eq(widgets.dashboardId, dashboardId))).run();
  });
}

/** JSON-schema registry of all widget types (MCP `all_widgets_schema`). */
export const allWidgetsSchema = registrySchema;
