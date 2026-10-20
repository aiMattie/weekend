import { describe, expect, it } from "vitest";
import { parseDay } from "../../src/modules/views/lib/dates";
import { criticalPath, depsFromValue, depsToInput, shiftWithDependencies, successorMap, wouldCycle, type GanttTask } from "../../src/modules/views/lib/gantt";

const r = (a: string, b: string) => ({ start: parseDay(a)!, end: parseDay(b)! });
const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;
const task = (id: string, a: number, b: number, deps: string[] = []): GanttTask => ({ id, range: r(day(a), day(b)), deps });

describe("gantt dependencies", () => {
  it("reads dependency values in every accepted shape", () => {
    expect(depsFromValue({ linkedPulseIds: [{ linkedPulseId: 5 }, { linkedPulseId: "6" }] })).toEqual(["5", "6"]);
    expect(depsFromValue(["7", 8])).toEqual(["7", "8"]);
    expect(depsFromValue({ item_ids: [9] })).toEqual(["9"]);
    expect(depsFromValue(null)).toEqual([]);
    expect(depsToInput(["1", "2"])).toEqual({ linkedPulseIds: [{ linkedPulseId: "1" }, { linkedPulseId: "2" }] });
    expect(depsToInput([])).toBeNull();
  });

  it("pushes successors forward when the predecessor moves over them (chain)", () => {
    const tasks = [task("a", 1, 3), task("b", 4, 6, ["a"]), task("c", 7, 8, ["b"]), task("free", 5, 6)];
    // a grows to the 5th: b must start on the 6th (keeping 3 days), c on the 9th
    const changed = shiftWithDependencies(tasks, "a", r(day(1), day(5)));
    expect([...changed.keys()].sort()).toEqual(["a", "b", "c"]);
    expect(changed.get("b")).toEqual(r(day(6), day(8)));
    expect(changed.get("c")).toEqual(r(day(9), day(10)));
    expect(changed.has("free")).toBe(false);
  });

  it("does not move successors that still start after the predecessor ends (no pull-back)", () => {
    const tasks = [task("a", 1, 3), task("b", 10, 12, ["a"])];
    const changed = shiftWithDependencies(tasks, "a", r(day(2), day(6)));
    expect([...changed.keys()]).toEqual(["a"]);
  });

  it("waits for the slowest predecessor and handles diamonds", () => {
    const tasks = [task("a", 1, 2), task("b", 1, 2), task("c", 3, 4, ["a", "b"])];
    const changed = shiftWithDependencies(tasks, "b", r(day(1), day(6)));
    expect(changed.get("c")).toEqual(r(day(7), day(8)));
    expect(shiftWithDependencies(tasks, "nope", r(day(1), day(2))).size).toBe(0);
  });

  it("survives cyclic data without looping forever", () => {
    const tasks = [task("a", 1, 3, ["b"]), task("b", 2, 4, ["a"])];
    expect(() => shiftWithDependencies(tasks, "a", r(day(5), day(8)))).not.toThrow();
  });

  it("detects cycles before linking", () => {
    const tasks = [task("a", 1, 2), task("b", 3, 4, ["a"]), task("c", 5, 6, ["b"])];
    expect(wouldCycle(tasks, "c", "a")).toBe(true); // a would depend on c
    expect(wouldCycle(tasks, "a", "c")).toBe(false);
    expect(wouldCycle(tasks, "a", "a")).toBe(true);
    expect(successorMap(tasks).get("a")).toEqual(["b"]);
  });

  it("finds the critical path: the longest chain by duration", () => {
    // a(3d) -> b(2d) -> d(1d) = 6 days ; a -> c(5d) -> d = 9 days (critical)
    const tasks = [task("a", 1, 3), task("b", 4, 5, ["a"]), task("c", 4, 8, ["a"]), task("d", 9, 9, ["b", "c"]), task("solo", 1, 20)];
    expect([...criticalPath(tasks)].sort()).toEqual(["a", "c", "d"]);
    expect(criticalPath([task("x", 1, 2), task("y", 3, 4)]).size).toBe(0); // nothing linked
  });
});
