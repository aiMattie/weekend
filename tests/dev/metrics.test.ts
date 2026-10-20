import { describe, expect, it } from "vitest";
import { addDays, burndownSeries, cycleTimes, nextSprintDates, scopeChange, totals, workload, type HistRow } from "../../src/server/services/sprint-metrics";

const row = (over: Partial<HistRow>): HistRow => ({ itemId: "1", addedAt: "2026-10-05T07:00:00.000Z", removedAt: null, addedAfterStart: false, points: 5, startedAt: null, doneAt: null, outcome: null, ...over });

describe("burndown series", () => {
  const rows = [
    row({ itemId: "a", points: 5, doneAt: "2026-10-06T12:00:00.000Z" }),
    row({ itemId: "b", points: 5, doneAt: "2026-10-08T12:00:00.000Z" }),
    row({ itemId: "c", points: 10 }),
    row({ itemId: "d", points: 4, addedAfterStart: true, addedAt: "2026-10-07T09:00:00.000Z" }),
  ];
  const series = burndownSeries({ startsOn: "2026-10-05", endsOn: "2026-10-16", today: "2026-10-08", rows });

  it("covers every calendar day of the sprint", () => {
    expect(series).toHaveLength(12);
    expect(series[0].date).toBe("2026-10-05");
    expect(series[11].date).toBe("2026-10-16");
  });
  it("burns down on the day work is done and shows scope creep", () => {
    const by = Object.fromEntries(series.map((p) => [p.date, p]));
    expect(by["2026-10-05"].remaining).toBe(20);
    expect(by["2026-10-06"].remaining).toBe(15);
    expect(by["2026-10-07"].remaining).toBe(19); // +4 added after the start
    expect(by["2026-10-08"].remaining).toBe(14);
    expect(by["2026-10-08"].scope).toBe(24);
  });
  it("has no actuals in the future and an ideal line that reaches 0 on the last working day", () => {
    const by = Object.fromEntries(series.map((p) => [p.date, p]));
    expect(by["2026-10-09"].remaining).toBeNull();
    expect(by["2026-10-16"].ideal).toBe(0);
    expect(by["2026-10-05"].ideal).toBe(18); // 20 * (1 - 1/10)
    expect(by["2026-10-10"].ideal).toBe(by["2026-10-09"].ideal); // weekend is flat
  });
  it("counts tasks when unit is count", () => {
    const s = burndownSeries({ startsOn: "2026-10-05", endsOn: "2026-10-16", today: "2026-10-16", rows, unit: "count" });
    expect(s[0].remaining).toBe(3);
    expect(s[11].remaining).toBe(2);
  });
  it("removed items leave the scope on the day they are removed", () => {
    const s = burndownSeries({ startsOn: "2026-10-05", endsOn: "2026-10-09", today: "2026-10-09", rows: [row({ points: 8, removedAt: "2026-10-07T10:00:00.000Z", outcome: "removed" }), row({ itemId: "z", points: 2 })] });
    expect(s.map((p) => p.remaining)).toEqual([10, 10, 2, 2, 2]);
  });
});

describe("scope change, totals, cycle time, workload", () => {
  const rows = [
    row({ itemId: "a", points: 5, doneAt: "2026-10-07T12:00:00.000Z", startedAt: "2026-10-05T12:00:00.000Z", assignees: ["u1"] }),
    row({ itemId: "b", points: 3, addedAfterStart: true, assignees: ["u1", "u2"] }),
    row({ itemId: "c", points: 2, removedAt: "2026-10-08T10:00:00.000Z", outcome: "removed" }),
  ];
  it("splits initial, added and removed", () => {
    expect(scopeChange(rows, "2026-10-05T07:00:00.000Z")).toEqual({ initialCount: 2, initialPoints: 7, addedCount: 1, addedPoints: 3, removedCount: 1, removedPoints: 2 });
  });
  it("totals ignore removed items", () => {
    expect(totals(rows)).toEqual({ count: 2, points: 8, doneCount: 1, donePoints: 5 });
  });
  it("cycle time is started to done in days", () => {
    const c = cycleTimes(rows);
    expect(c.averageDays).toBe(2);
    expect(c.items).toEqual([{ itemId: "a", days: 2 }]);
    expect(cycleTimes([]).averageDays).toBeNull();
  });
  it("workload counts an item for each assignee", () => {
    const w = workload(rows);
    expect(w.find((x) => x.userId === "u1")).toMatchObject({ count: 2, points: 8, donePoints: 5 });
    expect(w.find((x) => x.userId === "u2")).toMatchObject({ count: 1, points: 3 });
  });
});

describe("sprint dates", () => {
  it("next sprint starts on the Monday after the previous one and lasts two weeks (Mon-Fri)", () => {
    expect(nextSprintDates("2026-10-16", "2026-10-10")).toEqual({ startsOn: "2026-10-19", endsOn: "2026-10-30" });
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});
