import { z } from "zod";
import { collectEntries, findColumnAnywhere, groupKeys, isDone, numberOf, round } from "../columns-util";
import type { WidgetDefinition } from "../types";
import { baseShape, pickColumn } from "./common";

const statusShape = { ...baseShape, columnId: z.string().optional() };

export interface StatusSegment { key: string; label: string; color: string; count: number }
export interface StatusData { total: number; done: number; percent: number; segments: StatusSegment[]; columnTitle: string }

function statusData(ctx: Parameters<WidgetDefinition["query"]>[0], s: { boardIds: string[]; filters: { columnId: string; op: string; operand?: unknown }[]; columnId?: string }): StatusData {
  const col = pickColumn(ctx, s.columnId, ["status"], s.boardIds);
  const entries = collectEntries(ctx, s);
  const segs = new Map<string, StatusSegment & { order: number }>();
  let done = 0;
  for (const e of entries) {
    if (isDone(e.board, e.item, col)) done++;
    for (const gk of groupKeys(ctx, e, col)) {
      const seg = segs.get(gk.key) ?? { key: gk.key, label: gk.label, color: gk.color, count: 0, order: gk.order ?? 0 };
      seg.count++;
      segs.set(gk.key, seg);
    }
  }
  const segments = [...segs.values()].sort((a, b) => a.order - b.order).map(({ order, ...r }) => { void order; return r; });
  return { total: entries.length, done, percent: entries.length ? round((done / entries.length) * 100, 1) : 0, segments, columnTitle: col?.title ?? "" };
}

const fields: WidgetDefinition["fields"] = [{ key: "boardIds", kind: "boards" }, { key: "columnId", kind: "column", columnTypes: ["status"] }, { key: "filters", kind: "filters" }];

const batterySchema = z.object(statusShape);
export const batteryWidget: WidgetDefinition<z.infer<typeof batterySchema>> = {
  type: "battery",
  label: "Battery",
  description: "Progress bar of how many items are done, split by status colour.",
  category: "numbers",
  icon: "Battery",
  defaultLayout: { w: 6, h: 2, minW: 3, minH: 2 },
  configSchema: batterySchema,
  fields,
  query: (ctx, s) => statusData(ctx, s),
};

export const statusOverviewWidget: WidgetDefinition<z.infer<typeof batterySchema>> = {
  type: "status_overview",
  label: "Status overview",
  description: "Tiles with the number of items per status label.",
  category: "numbers",
  icon: "Status",
  defaultLayout: { w: 6, h: 3, minW: 3, minH: 2 },
  configSchema: batterySchema,
  fields,
  query: (ctx, s) => statusData(ctx, s),
};

const progressSchema = z.object({
  ...baseShape,
  columnId: z.string().optional(),
  target: z.number().min(0).default(100),
  mode: z.enum(["done", "sum"]).default("done"),
  label: z.string().default(""),
});
export const progressWidget: WidgetDefinition<z.infer<typeof progressSchema>> = {
  type: "progress",
  label: "Progress",
  description: "Progress toward a target: share of done items, or the sum of a numbers column against a goal.",
  category: "numbers",
  icon: "Counter",
  defaultLayout: { w: 4, h: 3, minW: 3, minH: 2 },
  configSchema: progressSchema,
  fields: [
    { key: "boardIds", kind: "boards" },
    { key: "mode", kind: "select", options: [{ value: "done", label: "done" }, { value: "sum", label: "sum" }] },
    { key: "columnId", kind: "column", columnTypes: ["numbers"], showIf: { key: "mode", in: ["sum"] } },
    { key: "target", kind: "number", showIf: { key: "mode", in: ["sum"] } },
    { key: "label", kind: "text" },
    { key: "filters", kind: "filters" },
  ],
  query(ctx, s) {
    const entries = collectEntries(ctx, s);
    if (s.mode === "sum") {
      const col = findColumnAnywhere(ctx, s.columnId);
      const value = round(entries.reduce((a, e) => a + (numberOf(e, col) ?? 0), 0));
      return { mode: "sum", value, target: s.target, percent: s.target ? Math.min(100, round((value / s.target) * 100, 1)) : 0, label: s.label, columnTitle: col?.title ?? "" };
    }
    const done = entries.filter((e) => isDone(e.board, e.item)).length;
    return { mode: "done", value: done, target: entries.length, percent: entries.length ? round((done / entries.length) * 100, 1) : 0, label: s.label, columnTitle: "" };
  },
};
