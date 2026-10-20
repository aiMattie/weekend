import { z } from "zod";
import { PALETTE, collectEntries, columnFor, findColumnAnywhere, groupKeys, readDateRange, type Entry } from "../columns-util";
import type { WidgetContext, WidgetDefinition } from "../types";
import { baseShape } from "./common";

const schema = z.object({
  ...baseShape,
  dateColumnId: z.string().optional(),
  /** colour bars by this column (default: first status column) */
  colorByColumnId: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});
export type TimeSettings = z.infer<typeof schema>;

export interface TimeEvent { id: string; boardId: string; boardName: string; name: string; start: string; end: string; color: string; group: string }
export interface TimeData { events: TimeEvent[]; min: string | null; max: string | null; total: number; dateColumnTitle: string }

/** The date-ish column to use for an entry: configured (matched across boards), else first timeline, else first date. */
function dateColumnOf(ctx: WidgetContext, e: Entry, configuredId?: string) {
  const ref = findColumnAnywhere(ctx, configuredId);
  const configured = columnFor(e.board, ref);
  if (configured) return configured;
  if (ref) return undefined;
  return e.board.columns.find((c) => c.type === "timeline") ?? e.board.columns.find((c) => c.type === "date");
}

export function timeQuery(ctx: WidgetContext, s: TimeSettings): TimeData {
  const entries = collectEntries(ctx, s);
  const colorRef = findColumnAnywhere(ctx, s.colorByColumnId);
  const events: TimeEvent[] = [];
  for (const e of entries) {
    const dc = dateColumnOf(ctx, e, s.dateColumnId);
    const range = dc ? readDateRange(e.item.values[dc.id]) : null;
    if (!range) continue;
    const colorKey = groupKeys(ctx, e, colorRef ?? e.board.columns.find((c) => c.type === "status"))[0];
    const group = e.board.groups.find((g) => g.id === e.item.groupId);
    events.push({
      id: e.item.id, boardId: e.board.id, boardName: e.board.name, name: e.item.name, start: range.start, end: range.end,
      color: colorKey && colorKey.key !== "__empty" ? colorKey.color : PALETTE[ctx.boards.indexOf(e.board) % PALETTE.length], group: group?.title ?? e.board.name,
    });
  }
  events.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const shown = events.slice(0, s.limit);
  return {
    events: shown, total: events.length, dateColumnTitle: findColumnAnywhere(ctx, s.dateColumnId)?.title ?? "",
    min: shown.length ? shown.reduce((m, x) => (x.start < m ? x.start : m), shown[0].start) : null,
    max: shown.length ? shown.reduce((m, x) => (x.end > m ? x.end : m), shown[0].end) : null,
  };
}

const fields: WidgetDefinition["fields"] = [
  { key: "boardIds", kind: "boards" }, { key: "dateColumnId", kind: "column", columnTypes: ["date", "timeline", "week"] },
  { key: "colorByColumnId", kind: "column", columnTypes: ["status", "dropdown", "people"] }, { key: "filters", kind: "filters" },
];

export const timelineWidget: WidgetDefinition<TimeSettings> = {
  type: "timeline", label: "Timeline", description: "Items as bars on a time axis, from a date or timeline column.", category: "planning", icon: "Timeline",
  defaultLayout: { w: 12, h: 6, minW: 4, minH: 3 }, configSchema: schema, fields, query: timeQuery,
};
export const ganttWidget: WidgetDefinition<TimeSettings> = {
  type: "gantt", label: "Gantt", description: "Gantt chart: one row per item with its start and end date.", category: "planning", icon: "Gantt",
  defaultLayout: { w: 12, h: 7, minW: 4, minH: 3 }, configSchema: schema, fields, query: timeQuery,
};
export const calendarWidget: WidgetDefinition<TimeSettings> = {
  type: "calendar", label: "Calendar", description: "Month calendar with items on their date.", category: "planning", icon: "Calendar",
  defaultLayout: { w: 8, h: 7, minW: 4, minH: 4 }, configSchema: schema.extend({ limit: z.number().int().min(1).max(1000).default(500) }), fields, query: timeQuery,
};

const counterSchema = z.object({
  label: z.string().default(""),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mode: z.enum(["until", "since"]).default("until"),
});
export const counterWidget: WidgetDefinition<z.infer<typeof counterSchema>> = {
  type: "counter", label: "Counter", description: "Counts the days until (or since) a date.", category: "numbers", icon: "Counter",
  defaultLayout: { w: 3, h: 3, minW: 2, minH: 2 }, configSchema: counterSchema, noData: true,
  fields: [{ key: "label", kind: "text" }, { key: "targetDate", kind: "date" }, { key: "mode", kind: "select", options: [{ value: "until", label: "until" }, { value: "since", label: "since" }] }],
  query(ctx, s) {
    if (!s.targetDate) return { days: null, label: s.label, mode: s.mode };
    const today = Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), ctx.now.getUTCDate());
    const t = Date.parse(`${s.targetDate}T00:00:00Z`);
    const diff = Math.round((s.mode === "until" ? t - today : today - t) / 86_400_000);
    return { days: diff, label: s.label, mode: s.mode, targetDate: s.targetDate };
  },
};
