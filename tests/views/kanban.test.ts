import { describe, expect, it } from "vitest";
import type { ColumnDto, ItemDto, UserLite } from "../../src/lib/board-types";
import { buildLanes, defaultKanbanColumn, inputAfterLaneMove, itemLaneKeys, laneDefs, NO_VALUE_LANE } from "../../src/modules/views/lib/kanban";

const col = (id: string, type: string, settings: Record<string, unknown>): ColumnDto => ({ id, boardId: "b", key: id, title: id, type, scope: "item", description: null, settings, position: 1, width: null });
const status = col("st", "status", { labels: [{ id: 1, text: "Done", color: "#00c875", index: 1 }, { id: 0, text: "Working", color: "#fdab3d", index: 0 }, { id: 2, text: "Stuck", color: "#df2f4a", index: 2 }] });
const dropdown = col("dd", "dropdown", { labels: [{ id: 1, text: "A" }, { id: 2, text: "B" }] });
const people = col("pp", "people", {});
const users: UserLite[] = [{ id: "u1", name: "Admin", email: "", photoUrl: null, title: null, isAiAgent: false }, { id: "u2", name: "Builder", email: "", photoUrl: null, title: null, isAiAgent: false }];
const item = (id: string, values: Record<string, unknown>): ItemDto => ({ id, boardId: "b", groupId: "g", parentItemId: null, name: id, values, position: Number(id.slice(1)), creatorId: null, createdAt: "", updatedAt: "", subitemCount: 0, updateCount: 0 });
const items = [item("i1", { st: { index: 1 }, dd: { ids: [1, 2] }, pp: { personsAndTeams: [{ id: "u1", kind: "person" }] } }), item("i2", { st: { index: 0 } }), item("i3", {}), item("i4", { st: { index: 99 } })];

describe("kanban grouping", () => {
  it("makes a lane per status label in label order plus a no-value lane last", () => {
    const lanes = buildLanes(status, items, users);
    expect(lanes.map((l) => l.title)).toEqual(["Working", "Done", "Stuck", ""]);
    expect(lanes.map((l) => l.items.map((i) => i.id))).toEqual([["i2"], ["i1"], [], ["i3", "i4"]]); // unknown label id -> no value
    expect(lanes[0].color).toBe("#fdab3d");
    expect(lanes[3].isNoValue).toBe(true);
  });

  it("puts an item in each dropdown lane it has", () => {
    const lanes = buildLanes(dropdown, items, users);
    expect(lanes.find((l) => l.key === "1")!.items.map((i) => i.id)).toEqual(["i1"]);
    expect(lanes.find((l) => l.key === "2")!.items.map((i) => i.id)).toEqual(["i1"]);
    expect(lanes.find((l) => l.key === NO_VALUE_LANE)!.items.map((i) => i.id)).toEqual(["i2", "i3", "i4"]);
  });

  it("only shows people lanes that have items and respects hidden lanes", () => {
    expect(buildLanes(people, items, users).map((l) => l.key)).toEqual(["u1", NO_VALUE_LANE]);
    expect(buildLanes(people, items, users, { hideEmptyPeopleLanes: false }).map((l) => l.key)).toEqual(["u1", "u2", NO_VALUE_LANE]);
    expect(buildLanes(status, items, users, { hiddenLanes: ["2", NO_VALUE_LANE] }).map((l) => l.key)).toEqual(["0", "1"]);
    expect(laneDefs(people, users)).toHaveLength(2);
    expect(itemLaneKeys(status, items[0])).toEqual(["1"]);
  });

  it("computes the new value after dragging between lanes", () => {
    expect(inputAfterLaneMove(status, items[1], "0", "2")).toEqual({ index: 2 });
    expect(inputAfterLaneMove(status, items[1], "0", NO_VALUE_LANE)).toBeNull();
    expect(inputAfterLaneMove(status, items[2], NO_VALUE_LANE, "1")).toEqual({ index: 1 });
    // multi dropdown: swap only the source lane's value
    expect(inputAfterLaneMove(dropdown, items[0], "1", "2")).toEqual({ ids: [2] });
    expect(inputAfterLaneMove(dropdown, items[0], "2", NO_VALUE_LANE)).toEqual({ ids: [1] });
    expect(inputAfterLaneMove(dropdown, items[0], "1", NO_VALUE_LANE)).toEqual({ ids: [2] });
    expect(inputAfterLaneMove(dropdown, item("x", { dd: { ids: [1] } }), "1", NO_VALUE_LANE)).toBeNull();
    // people: keeps teams
    const withTeam = item("t", { pp: { personsAndTeams: [{ id: "u1", kind: "person" }, { id: "t1", kind: "team" }] } });
    expect(inputAfterLaneMove(people, withTeam, "u1", "u2")).toEqual({ personsAndTeams: [{ id: "u2", kind: "person" }, { id: "t1", kind: "team" }] });
  });

  it("defaults to status, then dropdown, then people", () => {
    expect(defaultKanbanColumn([people, dropdown, status])?.id).toBe("st");
    expect(defaultKanbanColumn([people, dropdown])?.id).toBe("dd");
    expect(defaultKanbanColumn([col("n", "numbers", {})])).toBeUndefined();
  });
});
