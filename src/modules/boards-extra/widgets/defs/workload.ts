import { z } from "zod";
import { aggregate, collectEntries, findColumnAnywhere, groupKeys, numberOf, round, type Aggregation } from "../columns-util";
import type { WidgetDefinition } from "../types";
import { aggSchema, baseShape, pickColumn } from "./common";

const schema = z.object({
  ...baseShape,
  peopleColumnId: z.string().optional(),
  statusColumnId: z.string().optional(),
  measure: aggSchema.default("count"),
  measureColumnId: z.string().optional(),
});
export type WorkloadSettings = z.infer<typeof schema>;

export interface WorkloadData {
  people: { key: string; label: string; total: number; segments: { key: string; label: string; color: string; value: number }[] }[];
  unit: string;
  max: number;
}

export const workloadWidget: WidgetDefinition<WorkloadSettings> = {
  type: "workload", label: "Workload", description: "Workload per person: number of items (or sum of a numbers column) split by status.", category: "planning", icon: "Person",
  defaultLayout: { w: 6, h: 6, minW: 4, minH: 3 }, configSchema: schema,
  fields: [
    { key: "boardIds", kind: "boards" }, { key: "peopleColumnId", kind: "column", columnTypes: ["people"] },
    { key: "statusColumnId", kind: "column", columnTypes: ["status"] },
    { key: "measure", kind: "select", options: ["count", "sum", "avg"].map((v) => ({ value: v, label: v })) },
    { key: "measureColumnId", kind: "column", columnTypes: ["numbers"], showIf: { key: "measure", in: ["sum", "avg", "min", "max", "median"] } },
    { key: "filters", kind: "filters" },
  ],
  query(ctx, s): WorkloadData {
    const peopleCol = pickColumn(ctx, s.peopleColumnId, ["people"], s.boardIds);
    const statusCol = pickColumn(ctx, s.statusColumnId, ["status"], s.boardIds);
    const measureCol = findColumnAnywhere(ctx, s.measureColumnId);
    const agg: Aggregation = s.measure === "count" || !measureCol ? "count" : s.measure;
    const per = new Map<string, { label: string; segs: Map<string, { label: string; color: string; nums: number[]; count: number }> }>();
    for (const e of collectEntries(ctx, s)) {
      const num = numberOf(e, measureCol);
      for (const who of groupKeys(ctx, e, peopleCol)) {
        const p = per.get(who.key) ?? { label: who.label, segs: new Map() };
        per.set(who.key, p);
        for (const st of groupKeys(ctx, e, statusCol)) {
          const seg = p.segs.get(st.key) ?? { label: st.label, color: st.color, nums: [], count: 0 };
          p.segs.set(st.key, seg);
          seg.count++;
          if (num !== null) seg.nums.push(num);
        }
      }
    }
    const people = [...per.entries()].map(([key, p]) => {
      const segments = [...p.segs.entries()].map(([k, v]) => ({ key: k, label: v.label, color: v.color, value: round(aggregate(v.nums, agg, v.count)) }));
      return { key, label: p.label, segments, total: round(segments.reduce((a, x) => a + x.value, 0)) };
    }).sort((a, b) => (a.key === "__empty" ? 1 : b.key === "__empty" ? -1 : b.total - a.total));
    return { people, unit: measureCol?.title ?? "", max: people.reduce((m, p) => Math.max(m, p.total), 0) };
  },
};
