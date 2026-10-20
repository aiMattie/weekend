import { describe, expect, it } from "vitest";
import type { Task } from "@/server/services/dev-config";
import { buildSwimlanes } from "./swimlanes";

const task = (name: string, klant: string | null, epics: string[] = []): Task => ({
  id: name, boardId: "b", name, groupId: null, position: 0, createdAt: "", status: "To do", statusColor: "#c4c4c4",
  isDone: false, isStarted: false, points: 0, sprintId: "s", assigneeIds: [], klant,
  epicIds: epics.map((e) => `id-${e}`), epicNames: epics, prioriteit: null, type: null, jiraKey: null,
});
const labels = { noKlant: "Zonder klant", noEpic: "Zonder epic" };
const titles = (lanes: { title: string }[]) => lanes.map((l) => l.title);

describe("sprint board swimlanes", () => {
  const tasks = [task("a", "Delta", ["Login"]), task("b", "Delta"), task("c", "LMS"), task("d", null), task("e", "Delta", ["Login"])];

  it("none: one lane with every task", () => {
    const lanes = buildSwimlanes(tasks, "none", labels);
    expect(lanes).toHaveLength(1);
    expect(lanes[0].tasks).toHaveLength(5);
  });

  it("klant: sorted clients, tasks without client last", () => {
    const lanes = buildSwimlanes(tasks, "klant", labels);
    expect(titles(lanes)).toEqual(["Delta", "LMS", "Zonder klant"]);
    expect(lanes.every((l) => l.children.length === 0)).toBe(true);
    expect(lanes[0].tasks.map((t) => t.id)).toEqual(["a", "b", "e"]);
  });

  it("klant_epic: epic sub-lanes only for clients that have epic-linked tasks", () => {
    const [delta, lms] = buildSwimlanes(tasks, "klant_epic", labels);
    expect(lms.children).toEqual([]);
    expect(titles(delta.children)).toEqual(["Login", "Zonder epic"]);
    expect(delta.children[0].tasks.map((t) => t.id)).toEqual(["a", "e"]);
    expect(new Set([...delta.children.map((c) => c.key), delta.key, lms.key]).size).toBe(4);
  });
});
