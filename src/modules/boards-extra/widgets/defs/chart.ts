import { z } from "zod";
import { aggregate, collectEntries, findColumnAnywhere, groupKeys, numberOf, round, type Aggregation, type GroupKey } from "../columns-util";
import type { WidgetDefinition } from "../types";
import { aggSchema, baseShape, dateBucketSchema, pickColumn } from "./common";

const schema = z.object({
  ...baseShape,
  chartType: z.enum(["bar", "column", "line", "pie", "donut", "stacked"]).default("bar"),
  /** column (id) or "__board" / "__group" to group by; default = first status column */
  groupBy: z.string().optional(),
  /** second dimension for stacked charts */
  stackBy: z.string().optional(),
  measure: aggSchema.default("count"),
  measureColumnId: z.string().optional(),
  dateBucket: dateBucketSchema,
  limit: z.number().int().min(1).max(100).default(30),
  showLegend: z.boolean().default(true),
});
export type ChartSettings = z.infer<typeof schema>;

export interface ChartRow { key: string; label: string; color: string; value: number; stacks?: Record<string, number> }
export interface ChartData { chartType: ChartSettings["chartType"]; rows: ChartRow[]; stackKeys: GroupKey[]; total: number; measure: { agg: Aggregation; columnTitle: string | null }; groupTitle: string }

export const chartWidget: WidgetDefinition<ChartSettings> = {
  type: "chart",
  label: "Chart",
  description: "Bar, column, line, pie, donut or stacked chart of items grouped by a column (count, sum, average, min, max).",
  category: "charts",
  icon: "Chart",
  defaultLayout: { w: 6, h: 6, minW: 3, minH: 3 },
  configSchema: schema,
  fields: [
    { key: "boardIds", kind: "boards" },
    { key: "chartType", kind: "select", options: ["bar", "column", "line", "pie", "donut", "stacked"].map((v) => ({ value: v, label: v })) },
    { key: "groupBy", kind: "column", special: true },
    { key: "stackBy", kind: "column", special: true, showIf: { key: "chartType", in: ["stacked"] } },
    { key: "measure", kind: "select", options: ["count", "sum", "avg", "min", "max"].map((v) => ({ value: v, label: v })) },
    { key: "measureColumnId", kind: "column", columnTypes: ["numbers"], showIf: { key: "measure", in: ["sum", "avg", "min", "max", "median"] } },
    { key: "dateBucket", kind: "select", options: ["day", "week", "month", "year"].map((v) => ({ value: v, label: v })) },
    { key: "filters", kind: "filters" },
    { key: "showLegend", kind: "switch" },
  ],
  query(ctx, s): ChartData {
    const groupRaw = s.groupBy && s.groupBy.startsWith("__") ? s.groupBy : undefined;
    const groupCol = groupRaw ? undefined : pickColumn(ctx, s.groupBy, ["status"], s.boardIds);
    const stackRaw = s.stackBy && s.stackBy.startsWith("__") ? s.stackBy : undefined;
    const stackCol = stackRaw ? undefined : s.chartType === "stacked" ? pickColumn(ctx, s.stackBy, null) : undefined;
    const measureCol = findColumnAnywhere(ctx, s.measureColumnId);
    const agg: Aggregation = s.measure === "count" || !measureCol ? "count" : s.measure;
    const entries = collectEntries(ctx, s);
    type Acc = { key: GroupKey; nums: number[]; count: number };
    const buckets = new Map<string, Acc & { stacks: Map<string, Acc> }>();
    const stackKeys = new Map<string, GroupKey>();
    for (const e of entries) {
      const num = numberOf(e, measureCol);
      for (const gk of groupKeys(ctx, e, groupRaw ?? groupCol, s.dateBucket)) {
        const b = buckets.get(gk.key) ?? { key: gk, nums: [] as number[], count: 0, stacks: new Map<string, Acc>() };
        buckets.set(gk.key, b);
        b.count++;
        if (num !== null) b.nums.push(num);
        if (s.chartType === "stacked" && (stackRaw || stackCol)) {
          for (const sk of groupKeys(ctx, e, stackRaw ?? stackCol, s.dateBucket)) {
            stackKeys.set(sk.key, sk);
            const st = b.stacks.get(sk.key) ?? { key: sk, nums: [] as number[], count: 0 };
            b.stacks.set(sk.key, st);
            st.count++;
            if (num !== null) st.nums.push(num);
          }
        }
      }
    }
    const isDateGroup = groupCol && ["date", "timeline", "week"].includes(groupCol.type);
    let rows: ChartRow[] = [...buckets.values()].map((b) => ({
      key: b.key.key, label: b.key.label, color: b.key.color, value: round(aggregate(b.nums, agg, b.count)),
      ...(b.stacks.size ? { stacks: Object.fromEntries([...b.stacks.entries()].map(([k, v]) => [k, round(aggregate(v.nums, agg, v.count))])) } : {}),
      _order: b.key.order,
    })) as (ChartRow & { _order?: number })[];
    const orderOf = (r: ChartRow & { _order?: number }) => r._order;
    if (isDateGroup || s.chartType === "line") rows.sort((a, b) => (a.key === "__empty" ? 1 : b.key === "__empty" ? -1 : a.key.localeCompare(b.key)));
    else if (groupCol?.type === "status") rows.sort((a, b) => (orderOf(a) ?? 0) - (orderOf(b) ?? 0));
    else rows.sort((a, b) => b.value - a.value);
    rows = rows.slice(0, s.limit).map(({ ...r }) => { delete (r as { _order?: number })._order; return r; });
    return {
      chartType: s.chartType, rows, stackKeys: [...stackKeys.values()],
      total: round(rows.reduce((a, r) => a + r.value, 0)),
      measure: { agg, columnTitle: measureCol?.title ?? null },
      groupTitle: groupRaw === "__board" ? "Board" : groupRaw === "__group" ? "Group" : groupCol?.title ?? "",
    };
  },
};
