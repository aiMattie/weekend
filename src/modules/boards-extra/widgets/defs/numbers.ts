import { z } from "zod";
import { aggregate, collectEntries, findColumnAnywhere, numberOf, round, type Aggregation } from "../columns-util";
import type { WidgetDefinition } from "../types";
import { aggSchema, baseShape } from "./common";

const metric = z.object({ label: z.string().default(""), aggregation: aggSchema.default("count"), columnId: z.string().optional() });
const schema = z.object({
  ...baseShape,
  metrics: z.array(metric).min(1).max(4).default([{ label: "", aggregation: "count" }]),
  unit: z.string().default(""),
});
export type NumbersSettings = z.infer<typeof schema>;
export interface NumbersData { metrics: { label: string; aggregation: Aggregation; columnTitle: string | null; value: number }[]; unit: string }

export const numbersWidget: WidgetDefinition<NumbersSettings> = {
  type: "numbers",
  label: "Numbers",
  description: "One to four key figures: count of items, or sum / average / min / max / median of a numbers column.",
  category: "numbers",
  icon: "Numbers",
  defaultLayout: { w: 3, h: 3, minW: 2, minH: 2 },
  configSchema: schema,
  fields: [{ key: "boardIds", kind: "boards" }, { key: "metrics", kind: "metrics" }, { key: "unit", kind: "text" }, { key: "filters", kind: "filters" }],
  query(ctx, s): NumbersData {
    const entries = collectEntries(ctx, s);
    return {
      unit: s.unit,
      metrics: s.metrics.map((m) => {
        const col = findColumnAnywhere(ctx, m.columnId);
        const agg: Aggregation = m.aggregation === "count" || !col ? "count" : m.aggregation;
        const nums = col ? entries.map((e) => numberOf(e, col)).filter((n): n is number => n !== null) : [];
        return { label: m.label, aggregation: agg, columnTitle: col?.title ?? null, value: round(aggregate(nums, agg, entries.length)) };
      }),
    };
  },
};
