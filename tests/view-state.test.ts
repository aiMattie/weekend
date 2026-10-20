import { describe, expect, it } from "vitest";
import type { ColumnDto, GroupDto, ItemDto } from "../src/lib/board-types";
import { buildRenderGroups, emptyViewState } from "../src/lib/view-state";
import { DEFAULT_STATUS_LABELS } from "../src/server/columns/status";

const columns: ColumnDto[] = [
  { id: "c1", boardId: "b", key: "status", title: "Status", type: "status", scope: "item", description: null, settings: { labels: DEFAULT_STATUS_LABELS }, position: 1, width: null },
  { id: "c2", boardId: "b", key: "numbers", title: "N", type: "numbers", scope: "item", description: null, settings: {}, position: 2, width: null },
];
const groups: GroupDto[] = [{ id: "g1", boardId: "b", title: "G1", color: "#000000", position: 1 }, { id: "g2", boardId: "b", title: "G2", color: "#000000", position: 2 }];
const item = (id: string, name: string, groupId: string, values: Record<string, unknown>): ItemDto =>
  ({ id, boardId: "b", groupId, parentItemId: null, name, values, position: Number(id), creatorId: null, createdAt: "", updatedAt: "", subitemCount: 0, updateCount: 0 });
const items = [item("1", "Alpha", "g1", { c1: { index: 1 }, c2: 5 }), item("2", "Beta", "g1", { c1: { index: 2 }, c2: 1 }), item("3", "Gamma", "g2", {})];

describe("view state", () => {
  it("searches, filters, sorts (empties last) and hides empty groups while filtering", () => {
    const s = emptyViewState();
    expect(buildRenderGroups(groups, items, columns, s, []).map((g) => g.items.length)).toEqual([2, 1]);
    expect(buildRenderGroups(groups, items, columns, { ...s, search: "bet" }, [])).toHaveLength(1);
    expect(buildRenderGroups(groups, items, columns, { ...s, filters: [{ columnId: "c1", op: "any_of", operand: [1] }] }, [])[0].items.map((i) => i.name)).toEqual(["Alpha"]);
    const sorted = buildRenderGroups(groups, items, columns, { ...s, sort: [{ columnId: "c2", dir: "asc" }] }, []);
    expect(sorted[0].items.map((i) => i.name)).toEqual(["Beta", "Alpha"]);
    expect(buildRenderGroups(groups, items, columns, { ...s, sort: [{ columnId: "c2", dir: "desc" }] }, [])[0].items.map((i) => i.name)).toEqual(["Alpha", "Beta"]);
  });
  it("groups by a column into virtual groups", () => {
    const g = buildRenderGroups(groups, items, columns, { ...emptyViewState(), groupByColumnId: "c1" }, []);
    expect(g.map((x) => x.group.title)).toEqual(["Done", "Stuck", "-"]);
    expect(g[0].group.color).toBe("#00c875");
  });
});
