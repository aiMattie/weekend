import { describe, expect, it } from "vitest";
import type { ColumnDto, ItemDto } from "../../src/lib/board-types";
import { parseDay } from "../../src/modules/views/lib/dates";
import { aggregateWorkload, bucketLoad, reassignInput, UNASSIGNED, type WorkloadConfig } from "../../src/modules/views/lib/workload";

const col = (id: string, type: string): ColumnDto => ({ id, boardId: "b", key: id, title: id, type, scope: "item", description: null, settings: {}, position: 1, width: null });
const tl = col("tl", "timeline");
const est = col("est", "numbers");
const d = (s: string) => parseDay(s)!;
const person = (...ids: string[]) => ({ personsAndTeams: ids.map((id) => ({ id, kind: "person" })) });
const item = (id: string, values: Record<string, unknown>): ItemDto => ({ id, boardId: "b", groupId: "g", parentItemId: null, name: id, values, position: 1, creatorId: null, createdAt: "", updatedAt: "", subitemCount: 0, updateCount: 0 });
const cfg: WorkloadConfig = { mode: "hours", capacityPerDay: 8, defaultDailyHours: 4 };
// week of Mon 2026-10-05 .. Fri 09
const week = { start: d("2026-10-05"), end: d("2026-10-11") };

describe("workload aggregation", () => {
  it("spreads the estimate evenly over the working days of the range", () => {
    const items = [item("a", { pp: person("u1"), tl: { from: "2026-10-05", to: "2026-10-09" }, est: 20 })];
    const load = aggregateWorkload(items, "pp", tl, est, cfg).get("u1")!;
    expect(load.perDay.get(d("2026-10-07"))).toBe(4);
    const b = bucketLoad(load, week, cfg);
    expect(b).toMatchObject({ load: 20, capacity: 40, level: "low" }); // 50%
  });

  it("skips weekends and splits across several assignees", () => {
    const items = [item("a", { pp: person("u1", "u2"), tl: { from: "2026-10-09", to: "2026-10-12" }, est: 8 })]; // Fri..Mon = 2 working days
    const agg = aggregateWorkload(items, "pp", tl, est, cfg);
    expect(agg.get("u1")!.perDay.get(d("2026-10-10"))).toBeUndefined();
    expect(agg.get("u1")!.perDay.get(d("2026-10-09"))).toBe(2); // 8h / 2 people / 2 days
    expect(agg.get("u2")!.perDay.get(d("2026-10-12"))).toBe(2);
  });

  it("uses the default daily hours without an estimate, and counts items in item mode", () => {
    const items = [item("a", { pp: person("u1"), tl: { from: "2026-10-05", to: "2026-10-06" } }), item("b", { pp: person("u1"), tl: { from: "2026-10-06", to: "2026-10-06" } })];
    const hours = aggregateWorkload(items, "pp", tl, null, cfg).get("u1")!;
    expect(hours.perDay.get(d("2026-10-06"))).toBe(8); // 4 + 4
    const counts = aggregateWorkload(items, "pp", tl, null, { ...cfg, mode: "items", capacityPerDay: 1 }).get("u1")!;
    expect(counts.perDay.get(d("2026-10-06"))).toBe(2);
    expect(bucketLoad(counts, { start: d("2026-10-06"), end: d("2026-10-06") }, { ...cfg, mode: "items", capacityPerDay: 1 }).level).toBe("over");
  });

  it("flags over / ok / low / empty and honours per-user capacity", () => {
    const items = [item("a", { pp: person("u1"), tl: { from: "2026-10-05", to: "2026-10-09" }, est: 50 })];
    const load = aggregateWorkload(items, "pp", tl, est, cfg).get("u1")!;
    expect(bucketLoad(load, week, cfg).level).toBe("over"); // 50 > 40
    expect(bucketLoad(load, week, { ...cfg, capacityByUser: { u1: 12 } }).level).toBe("ok"); // 50 <= 60
    expect(bucketLoad(load, { start: d("2026-10-12"), end: d("2026-10-16") }, cfg).level).toBe("empty");
    expect(bucketLoad(undefined, week, cfg)).toMatchObject({ load: 0, level: "empty" });
    const ok = aggregateWorkload([item("o", { pp: person("u3"), tl: { from: "2026-10-05", to: "2026-10-09" }, est: 30 })], "pp", tl, est, cfg).get("u3")!;
    expect(bucketLoad(ok, week, cfg).level).toBe("ok"); // 75%
  });

  it("collects unassigned items and ignores items without dates or subitems", () => {
    const sub = { ...item("s", { tl: { from: "2026-10-05", to: "2026-10-05" } }), parentItemId: "a" };
    const items = [item("a", { tl: { from: "2026-10-05", to: "2026-10-05" }, est: 4 }), item("nodate", { pp: person("u1") }), sub];
    const agg = aggregateWorkload(items, "pp", tl, est, cfg);
    expect([...agg.keys()]).toEqual([UNASSIGNED]);
    expect(agg.get(UNASSIGNED)!.items).toHaveLength(1);
  });

  it("computes the people value after reassigning", () => {
    const a = item("a", { pp: person("u1", "u2") });
    expect(reassignInput(a, "pp", "u1", "u3")).toEqual({ personsAndTeams: [{ id: "u2", kind: "person" }, { id: "u3", kind: "person" }] });
    expect(reassignInput(a, "pp", "u1", "u2")).toEqual({ personsAndTeams: [{ id: "u2", kind: "person" }] });
    expect(reassignInput(item("b", { pp: person("u1") }), "pp", "u1", UNASSIGNED)).toBeNull();
    expect(reassignInput(item("c", {}), "pp", UNASSIGNED, "u9")).toEqual({ personsAndTeams: [{ id: "u9", kind: "person" }] });
  });
});
