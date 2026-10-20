import { describe, expect, it } from "vitest";
import {
  addDays, axisHeaders, endOfMonth, fitAxis, formatDay, isoWeek, isWeekend, layoutWeek, monthGrid, moveRange, packLanes, parseDay, rangeFromValue, resizeRange,
  startOfMonth, startOfWeek, valueFromRange, weekdayOf, workingDays, ymdOf,
} from "../../src/modules/views/lib/dates";

const d = (s: string) => parseDay(s)!;

describe("date math", () => {
  it("round-trips day numbers and survives DST changes", () => {
    expect(formatDay(d("2026-03-29"))).toBe("2026-03-29");
    expect(d("2026-03-30") - d("2026-03-28")).toBe(2); // DST switch in NL
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(parseDay("nope")).toBeNull();
    expect(parseDay("2026-10-06T10:00:00")).toBe(d("2026-10-06"));
  });

  it("knows weekdays (Monday first), weeks and ISO week numbers", () => {
    expect(weekdayOf(d("2026-10-05"))).toBe(0); // Monday
    expect(weekdayOf(d("2026-10-11"))).toBe(6);
    expect(isWeekend(d("2026-10-10"))).toBe(true);
    expect(formatDay(startOfWeek(d("2026-10-08")))).toBe("2026-10-05");
    expect(isoWeek(d("2026-10-06"))).toBe(41);
    expect(isoWeek(d("2026-01-01"))).toBe(1);
    expect(isoWeek(d("2027-01-01"))).toBe(53);
  });

  it("builds a month grid of full Monday-first weeks", () => {
    const grid = monthGrid(d("2026-10-15"));
    expect(grid).toHaveLength(5);
    expect(formatDay(grid[0][0])).toBe("2026-09-28");
    expect(formatDay(grid[4][6])).toBe("2026-11-01");
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(formatDay(startOfMonth(d("2026-02-14")))).toBe("2026-02-01");
    expect(formatDay(endOfMonth(d("2028-02-14")))).toBe("2028-02-29");
    expect(ymdOf(d("2026-10-06"))).toEqual({ year: 2026, month: 9, day: 6 });
  });

  it("moves and resizes ranges (never below one day)", () => {
    const r = { start: d("2026-10-05"), end: d("2026-10-09") };
    expect(moveRange(r, 3)).toEqual({ start: r.start + 3, end: r.end + 3 });
    expect(resizeRange(r, "end", 2)).toEqual({ start: r.start, end: r.end + 2 });
    expect(resizeRange(r, "start", -2)).toEqual({ start: r.start - 2, end: r.end });
    expect(resizeRange(r, "end", -20)).toEqual({ start: r.start, end: r.start });
    expect(resizeRange(r, "start", 20)).toEqual({ start: r.end, end: r.end });
    expect(workingDays({ start: d("2026-10-09"), end: d("2026-10-13") })).toBe(3); // Fri, Mon, Tue
  });

  it("reads and writes date and timeline values", () => {
    expect(rangeFromValue("date", { date: "2026-10-06", time: "10:00:00" })).toEqual({ start: d("2026-10-06"), end: d("2026-10-06") });
    expect(rangeFromValue("timeline", { from: "2026-10-09", to: "2026-10-05" })).toEqual({ start: d("2026-10-05"), end: d("2026-10-09") });
    expect(rangeFromValue("timeline", { from: "2026-10-09" })).toEqual({ start: d("2026-10-09"), end: d("2026-10-09") });
    expect(rangeFromValue("timeline", null)).toBeNull();
    expect(rangeFromValue("text", { date: "2026-10-09" })).toBeNull();
    const r = { start: d("2026-10-05"), end: d("2026-10-07") };
    expect(valueFromRange("timeline", r)).toEqual({ from: "2026-10-05", to: "2026-10-07" });
    expect(valueFromRange("date", r, { date: "2026-10-01", time: "09:30:00" })).toEqual({ date: "2026-10-05", time: "09:30:00" });
    expect(valueFromRange("date", r)).toEqual({ date: "2026-10-05" });
  });

  it("lays out events of a week in lanes, clipping at the week edges", () => {
    const week = d("2026-10-05");
    const ev = (id: string, a: string, b: string) => ({ id, range: { start: d(a), end: d(b) } });
    const placed = layoutWeek([ev("long", "2026-10-02", "2026-10-08"), ev("b", "2026-10-06", "2026-10-06"), ev("c", "2026-10-09", "2026-10-14"), ev("out", "2026-10-20", "2026-10-21")], week);
    expect(placed.map((p) => p.event.id)).toEqual(["long", "b", "c"]);
    const long = placed[0];
    expect(long).toMatchObject({ startCol: 0, endCol: 3, lane: 0, clippedStart: true, clippedEnd: false });
    expect(placed[1]).toMatchObject({ startCol: 1, endCol: 1, lane: 1 }); // overlaps "long" -> next lane
    expect(placed[2]).toMatchObject({ startCol: 4, endCol: 6, lane: 0, clippedEnd: true }); // free again after long ended
  });

  it("packs overlapping bars into lanes and fits an axis around them", () => {
    const bars = [{ range: { start: 1, end: 5 } }, { range: { start: 3, end: 8 } }, { range: { start: 6, end: 9 } }];
    expect(packLanes(bars).map((p) => p.lane)).toEqual([0, 1, 0]);
    const axis = fitAxis([{ start: 100, end: 120 }], 50, 10, 30);
    expect(axis).toEqual({ start: 40, end: 130 });
  });

  it("builds axis headers for each zoom level", () => {
    const names = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    const range = { start: d("2026-09-28"), end: d("2026-11-08") };
    const days = axisHeaders(range, "day", names);
    expect(days.bottom).toHaveLength(42);
    expect(days.top.map((h) => h.label)).toEqual(["sep 2026", "okt 2026", "nov 2026"]);
    const weeks = axisHeaders(range, "week", names);
    expect(weeks.bottom[0].label).toBe("W40");
    const months = axisHeaders({ start: d("2026-01-01"), end: d("2027-03-31") }, "month", names);
    expect(months.top.map((h) => h.label)).toEqual(["2026", "2027"]);
    const q = axisHeaders({ start: d("2026-01-01"), end: d("2026-12-31") }, "quarter", names);
    expect(q.bottom.map((h) => h.label)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
  });
});
