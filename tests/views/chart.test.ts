import { describe, expect, it } from "vitest";
import type { ColumnDto, GroupDto, ItemDto } from "../../src/lib/board-types";
import { buildChart, GROUP_AXIS } from "../../src/modules/views/lib/chart";

const col = (id: string, type: string, settings: Record<string, unknown> = {}): ColumnDto => ({ id, boardId: "b", key: id, title: id, type, scope: "item", description: null, settings, position: 1, width: null });
const status = col("st", "status", { labels: [{ id: 0, text: "Working", color: "#fdab3d", index: 0 }, { id: 1, text: "Done", color: "#00c875", index: 1 }] });
const dd = col("dd", "dropdown", { labels: [{ id: 1, text: "Dev" }, { id: 2, text: "AI" }] });
const num = col("n", "numbers");
const date = col("dt", "date");
const columns = [status, dd, num, date];
const groups: GroupDto[] = [{ id: "g1", boardId: "b", title: "G1", color: "#111111", position: 1 }, { id: "g2", boardId: "b", title: "G2", color: "#222222", position: 2 }];
const item = (id: string, groupId: string, values: Record<string, unknown>): ItemDto => ({ id, boardId: "b", groupId, parentItemId: null, name: id, values, position: 1, creatorId: null, createdAt: "", updatedAt: "", subitemCount: 0, updateCount: 0 });
const items = [
  item("1", "g1", { st: { index: 0 }, dd: { ids: [1] }, n: 10, dt: { date: "2026-10-03" } }),
  item("2", "g1", { st: { index: 1 }, dd: { ids: [1, 2] }, n: 30, dt: { date: "2026-10-20" } }),
  item("3", "g2", { st: { index: 1 }, n: 5, dt: { date: "2026-11-02" } }),
  item("4", "g2", {}),
];
const row = (data: ReturnType<typeof buildChart>, label: string) => data.rows.find((r) => r.label === label)!;

describe("chart aggregation", () => {
  it("counts items per status in label order with label colors, empty last", () => {
    const d = buildChart(items, columns, groups, [], { xColumnId: "st", metric: "count" }, "Leeg");
    expect(d.rows.map((r) => [r.label, r.total])).toEqual([["Working", 1], ["Done", 2], ["Leeg", 1]]);
    expect(d.buckets[0].color).toBe("#fdab3d");
  });

  it("sums and averages a numbers column", () => {
    const sum = buildChart(items, columns, groups, [], { xColumnId: "st", metric: "sum", yColumnId: "n" });
    expect(row(sum, "Done").total).toBe(35);
    const avg = buildChart(items, columns, groups, [], { xColumnId: "st", metric: "avg", yColumnId: "n" });
    expect(row(avg, "Done").total).toBe(17.5);
  });

  it("stacks by a second column", () => {
    const d = buildChart(items, columns, groups, [], { xColumnId: "st", stackColumnId: "dd", metric: "count" }, "Leeg");
    expect(d.series.map((s) => s.label)).toEqual(["Dev", "AI", "Leeg"]);
    const done = row(d, "Done");
    expect(done[d.series.find((s) => s.label === "Dev")!.key]).toBe(1);
    expect(done[d.series.find((s) => s.label === "AI")!.key]).toBe(1);
  });

  it("groups by board group and by month of a date column", () => {
    const g = buildChart(items, columns, groups, [], { xColumnId: GROUP_AXIS, metric: "count" });
    expect(g.rows.map((r) => [r.label, r.total])).toEqual([["G1", 2], ["G2", 2]]);
    expect(g.rows[0].color).toBe("#111111");
    const m = buildChart(items, columns, groups, [], { xColumnId: "dt", metric: "count" }, "Leeg");
    expect(m.rows.map((r) => [r.label, r.total])).toEqual([["2026-10", 2], ["2026-11", 1], ["Leeg", 1]]);
  });

  it("ignores subitems and counts multi-value dropdown items in each bucket", () => {
    const sub = { ...item("5", "g1", { st: { index: 0 } }), parentItemId: "1" };
    const d = buildChart([...items, sub], columns, groups, [], { xColumnId: "dd", metric: "count" }, "Leeg");
    expect(d.rows.map((r) => [r.label, r.total])).toEqual([["Dev", 2], ["AI", 1], ["Leeg", 2]]);
  });
});
