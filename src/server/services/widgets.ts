/**
 * Widget data: loads the boards a dashboard looks at (only those the viewer may see), applies
 * dashboard filters and runs each widget's pure `query` (src/modules/boards-extra/widgets).
 * One request returns the data of the whole dashboard so boards are loaded once.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ValidationError } from "../../lib/errors";
import { can } from "../../lib/permissions";
import { db } from "../../db/client";
import { activityLog, assets, boards, columns, groups, items, teams, users } from "../../db/schema/core";
import { widgets as widgetsTable } from "../../db/schema/dashboards";
import { getWidgetDefinition } from "../../modules/boards-extra/widgets/registry";
import type { FilterRuleLite, WBoard, WidgetContext } from "../../modules/boards-extra/widgets/types";
import { parse } from "./_shared";
import { getRow, requireView } from "./dashboards";

export interface LoadOptions { assets?: boolean; activity?: boolean; now?: Date }

/** Build the widget context for a set of boards (permission filtered, state=active only). */
export function loadContext(actor: Actor, boardIds: string[], filters: FilterRuleLite[] = [], opts: LoadOptions = {}): WidgetContext {
  const visible = boardIds.length ? db.select().from(boards).where(and(inArray(boards.id, boardIds), eq(boards.state, "active"))).all().filter((b) => can(actor, "board:view", { boardId: b.id })) : [];
  const order = new Map(boardIds.map((id, i) => [id, i]));
  visible.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const ids = visible.map((b) => b.id);
  const cols = ids.length ? db.select().from(columns).where(and(inArray(columns.boardId, ids), eq(columns.scope, "item"), eq(columns.archived, false))).orderBy(asc(columns.position)).all() : [];
  const grps = ids.length ? db.select().from(groups).where(and(inArray(groups.boardId, ids), eq(groups.state, "active"))).orderBy(asc(groups.position)).all() : [];
  const rows = ids.length ? db.select().from(items).where(and(inArray(items.boardId, ids), eq(items.state, "active"))).orderBy(asc(items.position)).all().filter((i) => !i.parentItemId) : [];
  const wboards: WBoard[] = visible.map((b) => ({
    id: b.id, name: b.name,
    columns: cols.filter((c) => c.boardId === b.id).map((c) => ({ id: c.id, boardId: b.id, key: c.key, title: c.title, type: c.type, settings: c.settings })),
    groups: grps.filter((g) => g.boardId === b.id).map((g) => ({ id: g.id, title: g.title, color: g.color })),
    items: rows.filter((i) => i.boardId === b.id).map((i) => ({ id: i.id, boardId: b.id, groupId: i.groupId, name: i.name, values: i.values, createdAt: i.createdAt, updatedAt: i.updatedAt, creatorId: i.creatorId })),
  }));
  const people = db.select({ id: users.id, name: users.name }).from(users).where(eq(users.accountId, actor.accountId)).all();
  const tms = db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.accountId, actor.accountId)).all();
  const ctx: WidgetContext = { boards: wboards, userNames: new Map(people.map((p) => [p.id, p.name])), teamNames: new Map(tms.map((t) => [t.id, t.name])), now: opts.now ?? new Date(), filters };
  if (opts.assets && ids.length) ctx.assets = db.select().from(assets).where(inArray(assets.boardId, ids)).orderBy(desc(assets.createdAt)).limit(2000).all().map((a) => ({ id: a.id, boardId: a.boardId, itemId: a.itemId, name: a.name, mimeType: a.mimeType, size: a.size, createdAt: a.createdAt }));
  if (opts.activity && ids.length) ctx.activity = db.select().from(activityLog).where(inArray(activityLog.boardId, ids)).orderBy(desc(activityLog.createdAt)).limit(300).all().map((a) => ({ id: a.id, boardId: a.boardId, itemId: a.itemId, userId: a.userId, event: a.event, data: a.data, createdAt: a.createdAt }));
  return ctx;
}

export type WidgetResult = { ok: true; data: unknown } | { ok: false; error: string };

/** Run one widget against a prepared context. Never throws: a broken widget must not break the dashboard. */
export function queryWidget(ctx: WidgetContext, type: string, settings: Record<string, unknown>): WidgetResult {
  const def = getWidgetDefinition(type);
  if (!def) return { ok: false, error: `Unknown widget type "${type}"` };
  const parsed = def.configSchema.safeParse(settings);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  try {
    return { ok: true, data: def.query(ctx, parsed.data) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Widget failed" };
  }
}

/** Data for every widget of a dashboard, in one go. */
export function dashboardData(actor: Actor, dashboardId: string, opts: { now?: Date } = {}): { generatedAt: string; data: Record<string, WidgetResult> } {
  const dash = requireView(actor, dashboardId);
  const ws = db.select().from(widgetsTable).where(eq(widgetsTable.dashboardId, dashboardId)).all();
  const needs = new Set(ws.flatMap((w) => getWidgetDefinition(w.type)?.needs ?? []));
  const ctx = loadContext(actor, dash.boardIds, dash.filters, { assets: needs.has("assets"), activity: needs.has("activity"), now: opts.now });
  return { generatedAt: new Date().toISOString(), data: Object.fromEntries(ws.map((w) => [w.id, queryWidget(ctx, w.type, w.settings)])) };
}

export function widgetData(actor: Actor, widgetId: string): WidgetResult {
  const w = db.select().from(widgetsTable).where(eq(widgetsTable.id, widgetId)).get();
  if (!w) throw new ValidationError("Widget not found");
  const dash = requireView(actor, w.dashboardId);
  const needs = getWidgetDefinition(w.type)?.needs ?? [];
  return queryWidget(loadContext(actor, dash.boardIds, dash.filters, { assets: needs.includes("assets"), activity: needs.includes("activity") }), w.type, w.settings);
}

const previewInput = z.object({
  dashboardId: z.string().optional(),
  boardIds: z.array(z.string()).default([]),
  type: z.string(),
  settings: z.record(z.string(), z.unknown()).default({}),
});
/** Live preview while configuring a widget (not saved) and `show_chart`-style ad-hoc queries. */
export function previewData(actor: Actor, input: unknown): WidgetResult {
  const d = parse(previewInput, input);
  const dash = d.dashboardId ? requireView(actor, d.dashboardId) : null;
  const needs = getWidgetDefinition(d.type)?.needs ?? [];
  const boardIds = dash ? dash.boardIds : d.boardIds;
  return queryWidget(loadContext(actor, boardIds, dash?.filters ?? [], { assets: needs.includes("assets"), activity: needs.includes("activity") }), d.type, d.settings);
}

/** Columns of the dashboard's boards, for the settings pickers (grouped across boards by type + title). */
export function dashboardColumns(actor: Actor, dashboardId: string) {
  const dash = getRow(dashboardId);
  requireView(actor, dashboardId);
  const ctx = loadContext(actor, dash.boardIds);
  const seen = new Map<string, { id: string; title: string; type: string; boardIds: string[]; labels?: { id: number; text: string; color?: string }[] }>();
  for (const b of ctx.boards) {
    for (const c of b.columns) {
      const key = `${c.type}:${c.title.trim().toLowerCase()}`;
      const hit = seen.get(key);
      if (hit) { hit.boardIds.push(b.id); continue; }
      seen.set(key, { id: c.id, title: c.title, type: c.type, boardIds: [b.id], labels: Array.isArray(c.settings.labels) ? (c.settings.labels as { id: number; text: string; color?: string }[]) : undefined });
    }
  }
  return { boards: ctx.boards.map((b) => ({ id: b.id, name: b.name })), columns: [...seen.values()], users: [...ctx.userNames.entries()].map(([id, name]) => ({ id, name })) };
}
