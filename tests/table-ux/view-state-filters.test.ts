import { describe, expect, it } from "vitest";
import type { ColumnDto, GroupDto, ItemDto, UserLite } from "../../src/lib/board-types";
import { buildRenderGroups, emptyViewState, matchesFilters, NAME_COLUMN_SORT, sameSavedPart, savedPart, stateFromView, type FilterRule } from "../../src/lib/view-state";
import { DEFAULT_STATUS_LABELS } from "../../src/server/columns/status";

const col = (id: string, key: string, type: string, settings: Record<string, unknown> = {}): ColumnDto =>
  ({ id, boardId: "b", key, title: key, type, scope: "item", description: null, settings, position: Number(id.slice(1)), width: null });
const columns: ColumnDto[] = [
  col("c0", "name", "name"),
  col("c1", "status", "status", { labels: DEFAULT_STATUS_LABELS }),
  col("c2", "numbers", "numbers"),
  col("c3", "people", "people"),
  col("c4", "date", "date"),
  col("c5", "text", "text"),
  col("c6", "checkbox", "checkbox"),
  col("c7", "dropdown", "dropdown", { labels: [{ id: 0, text: "Web" }, { id: 1, text: "App" }, { id: 2, text: "API" }] }),
];
const users: UserLite[] = [
  { id: "u1", name: "Admin", email: "n@x", photoUrl: null, title: null, isAiAgent: false },
  { id: "u2", name: "Builder", email: "w@x", photoUrl: null, title: null, isAiAgent: false },
];
const groups: GroupDto[] = [{ id: "g1", boardId: "b", title: "G1", color: "#000000", position: 1 }];
const p = (...ids: string[]) => ({ personsAndTeams: ids.map((id) => ({ id, kind: "person" })) });
const item = (id: string, name: string, values: Record<string, unknown>): ItemDto =>
  ({ id, boardId: "b", groupId: "g1", parentItemId: null, name, values, position: Number(id), creatorId: null, createdAt: "", updatedAt: "", subitemCount: 0, updateCount: 0 });
const items = [
  item("1", "Alpha website", { c1: { index: 1 }, c2: 5, c3: p("u1"), c4: { date: "2026-01-10" }, c5: "foo bar", c6: { checked: true }, c7: { ids: [0, 1] } }),
  item("2", "Beta app", { c1: { index: 2 }, c2: 12, c3: p("u1", "u2"), c4: { date: "2026-03-01" }, c5: "baz", c7: { ids: [2] } }),
  item("3", "Gamma", { c1: { index: 0 }, c2: 1, c4: { date: "2025-06-01" } }),
  item("4", "Delta", {}),
];
const names = (rules: FilterRule[]) => items.filter((i) => matchesFilters(i, columns, rules)).map((i) => i.name);
const groupsOf = (st: Partial<ReturnType<typeof emptyViewState>>) => buildRenderGroups(groups, items, columns, { ...emptyViewState(), ...st }, users);

describe("filter rules per column type", () => {
  it("text and name contains / is / is_empty", () => {
    expect(names([{ columnId: "c5", op: "contains", operand: "ba" }])).toEqual(["Alpha website", "Beta app"]);
    expect(names([{ columnId: "c5", op: "is", operand: "baz" }])).toEqual(["Beta app"]);
    expect(names([{ columnId: "c5", op: "is_empty" }])).toEqual(["Gamma", "Delta"]);
    expect(names([{ columnId: NAME_COLUMN_SORT, op: "contains", operand: "ta" }])).toEqual(["Beta app", "Delta"]);
    expect(names([{ columnId: NAME_COLUMN_SORT, op: "not_contains", operand: "a" }])).toEqual([]);
  });
  it("status and dropdown any_of / none_of", () => {
    expect(names([{ columnId: "c1", op: "any_of", operand: [1, 2] }])).toEqual(["Alpha website", "Beta app"]);
    expect(names([{ columnId: "c1", op: "none_of", operand: [1] }])).toEqual(["Beta app", "Gamma", "Delta"]);
    expect(names([{ columnId: "c1", op: "is_empty" }])).toEqual(["Delta"]);
    expect(names([{ columnId: "c7", op: "any_of", operand: [1, 2] }])).toEqual(["Alpha website", "Beta app"]);
  });
  it("people any_of / is_empty", () => {
    expect(names([{ columnId: "c3", op: "any_of", operand: ["u2"] }])).toEqual(["Beta app"]);
    expect(names([{ columnId: "c3", op: "is_empty" }])).toEqual(["Gamma", "Delta"]);
  });
  it("date before / after / is / empty", () => {
    expect(names([{ columnId: "c4", op: "before", operand: "2026-02-01" }])).toEqual(["Alpha website", "Gamma"]);
    expect(names([{ columnId: "c4", op: "after", operand: "2026-02-01" }])).toEqual(["Beta app"]);
    expect(names([{ columnId: "c4", op: "is", operand: "2026-01-10" }])).toEqual(["Alpha website"]);
    expect(names([{ columnId: "c4", op: "is_not_empty" }])).toHaveLength(3);
  });
  it("numbers and checkbox", () => {
    expect(names([{ columnId: "c2", op: "gt", operand: "4" }])).toEqual(["Alpha website", "Beta app"]);
    expect(names([{ columnId: "c2", op: "lte", operand: 1 }])).toEqual(["Gamma"]);
    expect(names([{ columnId: "c6", op: "is_checked" }])).toEqual(["Alpha website"]);
    expect(names([{ columnId: "c6", op: "is_not_checked" }])).toHaveLength(3);
  });
  it("combines AND (default) and OR with AND binding tighter", () => {
    const a: FilterRule = { columnId: "c1", op: "any_of", operand: [1] };
    const b: FilterRule = { columnId: "c2", op: "gt", operand: 3 };
    const c: FilterRule = { columnId: "c5", op: "is_empty" };
    expect(names([a, b])).toEqual(["Alpha website"]);
    expect(names([a, { ...c, join: "or" }])).toEqual(["Alpha website", "Gamma", "Delta"]);
    // a AND b OR c = (a AND b) OR c
    expect(names([a, { ...b, join: "and" }, { ...c, join: "or" }])).toEqual(["Alpha website", "Gamma", "Delta"]);
    // a OR b AND c = a OR (b AND c)
    expect(names([a, { ...b, join: "or" }, { ...c, join: "and" }])).toEqual(["Alpha website"]);
    expect(names([{ ...a, join: "or" }])).toEqual(["Alpha website"]); // first join is ignored
  });
  it("ignores rules on unknown columns and tolerates wrong operand shapes", () => {
    expect(names([{ columnId: "nope", op: "is", operand: "x" }])).toHaveLength(4);
    expect(() => names([{ columnId: "c1", op: "any_of", operand: undefined }])).not.toThrow();
  });
});

describe("search and person filter", () => {
  it("searches name and formatted values, case insensitive", () => {
    expect(groupsOf({ search: "STUCK" })[0].items.map((i) => i.name)).toEqual(["Beta app"]);
    expect(groupsOf({ search: "foo" })[0].items.map((i) => i.name)).toEqual(["Alpha website"]);
    expect(groupsOf({ search: "zzz" })).toEqual([]);
  });
  it("matches subitem names while searching", () => {
    const sub: ItemDto = { ...item("9", "Verborgen subtaak", {}), parentItemId: "4" };
    const gs = buildRenderGroups(groups, [...items, sub], columns, { ...emptyViewState(), search: "verborgen" }, users);
    expect(gs[0].items.map((i) => i.name)).toEqual(["Delta"]);
  });
  it("person filter incl. unassigned", () => {
    expect(groupsOf({ personIds: ["u2"] })[0].items.map((i) => i.name)).toEqual(["Beta app"]);
    expect(groupsOf({ personIds: ["none"] })[0].items.map((i) => i.name)).toEqual(["Gamma", "Delta"]);
    expect(groupsOf({ personIds: ["u2", "none"] })[0].items.map((i) => i.name)).toEqual(["Beta app", "Gamma", "Delta"]);
  });
});

describe("sort", () => {
  it("multi-level sort with empties last and per-level direction", () => {
    const r = groupsOf({ sort: [{ columnId: "c3", dir: "asc" }, { columnId: NAME_COLUMN_SORT, dir: "desc" }] })[0].items.map((i) => i.name);
    // people sortKey: Alpha(u1), Beta(u1,u2) ... empties (Gamma, Delta) last, ordered by name desc
    expect(r.slice(2)).toEqual(["Gamma", "Delta"].sort().reverse());
    expect(groupsOf({ sort: [{ columnId: "c4", dir: "desc" }] })[0].items.map((i) => i.name)).toEqual(["Beta app", "Alpha website", "Gamma", "Delta"]);
    expect(groupsOf({ sort: [{ columnId: "c2", dir: "asc" }] })[0].items.map((i) => i.name)).toEqual(["Gamma", "Alpha website", "Beta app", "Delta"]);
  });
});

describe("group by", () => {
  it("status: label order, colors, empty last", () => {
    const g = groupsOf({ groupByColumnId: "c1" });
    expect(g.map((x) => x.group.title)).toEqual(["Working on it", "Done", "Stuck", "-"]);
    expect(g[1].group.color).toBe("#00c875");
    expect(g.every((x) => x.virtual)).toBe(true);
  });
  it("people: one bucket per person, multi-assigned items appear in each", () => {
    const g = groupsOf({ groupByColumnId: "c3" });
    expect(g.map((x) => x.group.title)).toEqual(["Admin", "Builder", "-"]);
    expect(g[0].items.map((i) => i.name)).toEqual(["Alpha website", "Beta app"]);
    expect(g[1].items.map((i) => i.name)).toEqual(["Beta app"]);
    expect(g[2].items.map((i) => i.name)).toEqual(["Gamma", "Delta"]);
  });
  it("dropdown (multi) in label order; dates by value ascending; numbers; keeps sort within groups", () => {
    expect(groupsOf({ groupByColumnId: "c7" }).map((x) => x.group.title)).toEqual(["Web", "App", "API", "-"]);
    expect(groupsOf({ groupByColumnId: "c4" }).map((x) => x.group.title)).toEqual(["2025-06-01", "2026-01-10", "2026-03-01", "-"]);
    const g = groupsOf({ groupByColumnId: "c3", sort: [{ columnId: NAME_COLUMN_SORT, dir: "desc" }] });
    expect(g[0].items.map((i) => i.name)).toEqual(["Beta app", "Alpha website"]);
  });
  it("respects filters while grouping and hides empty real groups while filtering", () => {
    expect(groupsOf({ groupByColumnId: "c1", filters: [{ columnId: "c1", op: "any_of", operand: [1] }] }).map((x) => x.group.title)).toEqual(["Done"]);
    expect(groupsOf({ filters: [{ columnId: "c2", op: "gt", operand: 100 }] })).toEqual([]);
  });
});

describe("saved part", () => {
  it("round-trips through a view row and detects changes", () => {
    const st = { ...emptyViewState(), filters: [{ columnId: "c1", op: "any_of", operand: [1] }], sort: [{ columnId: "c2", dir: "desc" as const }], hiddenColumnIds: ["c5"], groupByColumnId: "c1", pinnedColumnIds: ["c2"], search: "x", personIds: ["u1"] };
    const v = { filters: st.filters, sort: st.sort, settings: { hiddenColumnIds: ["c5"], groupByColumnId: "c1", pinnedColumnIds: ["c2"] } };
    const back = stateFromView(v);
    expect(savedPart(back)).toEqual(savedPart(st));
    expect(back.search).toBe("");
    expect(sameSavedPart(back, st)).toBe(true); // search/person are not part of the saved state
    expect(sameSavedPart(back, { ...st, hiddenColumnIds: [] })).toBe(false);
    expect(sameSavedPart(back, { ...st, filters: [{ ...st.filters[0], join: "and" }] })).toBe(true);
    expect(sameSavedPart(stateFromView({ filters: [], sort: [], settings: {} }), emptyViewState())).toBe(true);
  });
});

describe("incomplete rules", () => {
  it("ignores a rule whose operand is not filled in yet", () => {
    expect(names([{ columnId: "c3", op: "any_of", operand: [] }])).toHaveLength(4);
    expect(names([{ columnId: "c5", op: "contains", operand: "" }])).toHaveLength(4);
    expect(names([{ columnId: NAME_COLUMN_SORT, op: "contains" }])).toHaveLength(4);
    expect(names([{ columnId: "c5", op: "is_empty" }])).toHaveLength(2);
  });
});
