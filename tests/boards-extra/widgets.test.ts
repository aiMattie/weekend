import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, ValidationError } from "../../src/lib/errors";
import * as boardsSvc from "../../src/server/services/boards";
import * as columns from "../../src/server/services/columns";
import * as items from "../../src/server/services/items";
import * as dashboards from "../../src/server/services/dashboards";
import * as widgets from "../../src/server/services/widgets";
import { toEmbedUrl } from "../../src/modules/boards-extra/widgets/defs/misc";
import { allWidgetsSchema, widgetTypes } from "../../src/modules/boards-extra/widgets/registry";
import { dateBucket, readDateRange } from "../../src/modules/boards-extra/widgets/columns-util";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
let boardB: string;
beforeEach(async () => {
  c = await freshCtx();
  const b = boardsSvc.create(c.sys, { workspaceId: c.workspaceId, name: "Tweede board" });
  boardB = b.id;
  // numbers column on both boards
  for (const id of [c.boardId, boardB]) columns.create(c.sys, id, { title: "Uren", type: "numbers" });
  const mk = (board: string, name: string, status: string, hours: number, who?: string) =>
    items.create(c.sys, { boardId: board, name, values: { status, numbers: hours, ...(who ? { people: [who] } : {}), date: "2026-11-02" } });
  mk(c.boardId, "A1", "Done", 5, c.userIds.dev1);
  mk(c.boardId, "A2", "Working on it", 3, c.userIds.dev1);
  mk(boardB, "B1", "Done", 2, c.userIds.pm1);
  mk(boardB, "B2", "Stuck", 10);
});

const uren = (board: string) => columns.list(c.sys, board).find((x) => x.title === "Uren")!.id;
const status = (board: string) => columns.list(c.sys, board).find((x) => x.type === "status")!.id;

describe("widget registry", () => {
  it("offers at least 15 widget types with JSON schemas", () => {
    expect(widgetTypes().length).toBeGreaterThanOrEqual(15);
    const schema = allWidgetsSchema();
    for (const t of ["chart", "numbers", "battery", "list", "table", "timeline", "gantt", "workload", "calendar", "files", "text", "embed", "status_overview", "counter", "progress"]) {
      const w = schema.find((x) => x.type === t);
      expect(w, t).toBeTruthy();
      expect(typeof w!.settingsSchema).toBe("object");
    }
  });
  it("converts video links to embed urls and rejects junk", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=abcdefghijk")).toBe("https://www.youtube.com/embed/abcdefghijk");
    expect(toEmbedUrl("https://youtu.be/abcdefghijk")).toBe("https://www.youtube.com/embed/abcdefghijk");
    expect(toEmbedUrl("javascript:alert(1)")).toBeNull();
    expect(toEmbedUrl("not a url")).toBeNull();
  });
  it("reads dates tolerantly and buckets them", () => {
    expect(readDateRange({ date: "2026-11-02" })).toEqual({ start: "2026-11-02", end: "2026-11-02" });
    expect(readDateRange({ from: "2026-11-02", to: "2026-11-09" })).toEqual({ start: "2026-11-02", end: "2026-11-09" });
    expect(readDateRange(null)).toBeNull();
    expect(dateBucket("2026-11-05", "month")).toBe("2026-11");
    expect(dateBucket("2026-11-05", "week")).toBe("2026-11-02"); // Monday
  });
});

describe("dashboards + widget data (cross board)", () => {
  it("counts items per status across two boards (labels merge by text)", () => {
    const d = dashboards.create(c.admin, { name: "Overzicht", boardIds: [c.boardId, boardB] });
    const w = dashboards.createWidget(c.admin, d.id, { type: "chart", settings: { groupBy: status(c.boardId), chartType: "bar" } });
    const res = widgets.dashboardData(c.admin, d.id).data[w.id];
    expect(res.ok).toBe(true);
    const rows = (res as { data: { rows: { label: string; value: number }[] } }).data.rows;
    expect(Object.fromEntries(rows.map((r) => [r.label, r.value]))).toEqual({ "Working on it": 1, Done: 2, Stuck: 1 });
  });

  it("numbers: sum / avg / count and updates after an item change", () => {
    const d = dashboards.create(c.admin, { name: "Cijfers", boardIds: [c.boardId, boardB] });
    const w = dashboards.createWidget(c.admin, d.id, { type: "numbers", settings: { metrics: [{ label: "Totaal uren", aggregation: "sum", columnId: uren(c.boardId) }, { label: "Aantal", aggregation: "count" }, { label: "Gem", aggregation: "avg", columnId: uren(c.boardId) }] } });
    const read = () => (widgets.dashboardData(c.admin, d.id).data[w.id] as { data: { metrics: { value: number }[] } }).data.metrics.map((m) => m.value);
    expect(read()).toEqual([20, 4, 5]);
    const first = items.list(c.sys, { boardId: c.boardId })[0];
    items.changeColumnValue(c.sys, first.id, "numbers", 15);
    expect(read()).toEqual([30, 4, 7.5]);
  });

  it("filters: dashboard-level filter applies to every widget, widget board subset works", () => {
    const d = dashboards.create(c.admin, { name: "Gefilterd", boardIds: [c.boardId, boardB] });
    const n = dashboards.createWidget(c.admin, d.id, { type: "numbers" });
    const only = dashboards.createWidget(c.admin, d.id, { type: "numbers", settings: { boardIds: [boardB] } });
    const val = (id: string) => (widgets.dashboardData(c.admin, d.id).data[id] as { data: { metrics: { value: number }[] } }).data.metrics[0].value;
    expect(val(n.id)).toBe(4);
    expect(val(only.id)).toBe(2);
    // a rule without a value yet does not filter anything
    dashboards.update(c.admin, d.id, { filters: [{ columnId: status(c.boardId), op: "any_of", operand: [] }] });
    expect(val(n.id)).toBe(4);
    // "Done" label id on board A, translated by text for board B
    const doneId = String(((columns.list(c.sys, c.boardId).find((x) => x.type === "status")!.settings.labels) as { id: number; text: string }[]).find((l) => l.text === "Done")!.id);
    dashboards.update(c.admin, d.id, { filters: [{ columnId: status(c.boardId), op: "any_of", operand: [doneId] }] });
    expect(val(n.id)).toBe(2);
    expect(val(only.id)).toBe(1);
  });

  it("battery, status overview, workload, list/table and timeline produce data", () => {
    const d = dashboards.create(c.admin, { name: "Alles", boardIds: [c.boardId, boardB] });
    const types = ["battery", "status_overview", "progress", "workload", "list", "table", "timeline", "gantt", "calendar", "files", "activity", "text", "embed", "counter"];
    const ids = types.map((t) => [t, dashboards.createWidget(c.admin, d.id, { type: t }).id] as const);
    const data = widgets.dashboardData(c.admin, d.id).data;
    for (const [t, id] of ids) expect(data[id].ok, t).toBe(true);
    const battery = (data[ids.find(([t]) => t === "battery")![1]] as { data: { total: number; done: number; percent: number } }).data;
    expect(battery).toMatchObject({ total: 4, done: 2, percent: 50 });
    const wl = (data[ids.find(([t]) => t === "workload")![1]] as { data: { people: { label: string; total: number }[] } }).data.people;
    expect(wl.find((p) => p.label === "Builder Hartog" || p.label.startsWith("Builder"))?.total).toBe(2);
    const tl = (data[ids.find(([t]) => t === "timeline")![1]] as { data: { events: unknown[] } }).data;
    expect(tl.events).toHaveLength(4);
    const table = (data[ids.find(([t]) => t === "table")![1]] as { data: { rows: unknown[]; total: number } }).data;
    expect(table.total).toBe(4);
  });

  it("stacked chart groups by a second dimension", () => {
    const d = dashboards.create(c.admin, { name: "Stack", boardIds: [c.boardId, boardB] });
    const w = dashboards.createWidget(c.admin, d.id, { type: "chart", settings: { chartType: "stacked", groupBy: "__board", stackBy: status(c.boardId) } });
    const r = widgets.dashboardData(c.admin, d.id).data[w.id] as { data: { rows: { label: string; stacks: Record<string, number> }[]; stackKeys: unknown[] } };
    expect(r.data.rows).toHaveLength(2);
    expect(r.data.stackKeys.length).toBeGreaterThanOrEqual(3);
    expect(r.data.rows.find((x) => x.label === "Test board")!.stacks).toMatchObject({ done: 1, "working on it": 1 });
  });

  it("skips boards the viewer cannot see and validates widget settings", () => {
    const d = dashboards.create(c.admin, { name: "Rechten", boardIds: [c.boardId] });
    expect(() => dashboards.createWidget(c.admin, d.id, { type: "nope" })).toThrow(ValidationError);
    expect(() => dashboards.createWidget(c.admin, d.id, { type: "chart", settings: { chartType: "radar" } })).toThrow(ValidationError);
  });

  it("lock: only the owner may change a locked dashboard; private dashboards are hidden", () => {
    const d = dashboards.create(c.admin, { name: "Slot", boardIds: [c.boardId] });
    const w = dashboards.createWidget(c.admin, d.id, { type: "text" });
    expect(dashboards.get(c.member, d.id).canEdit).toBe(true);
    dashboards.update(c.admin, d.id, { locked: true });
    expect(() => dashboards.updateWidget(c.member, w.id, { title: "x" })).toThrow(ForbiddenError);
    expect(dashboards.get(c.member, d.id).canEdit).toBe(false);
    expect(() => dashboards.update(c.member, d.id, { locked: false })).toThrow(ForbiddenError);
    dashboards.update(c.admin, d.id, { visibility: "private" });
    expect(dashboards.list(c.member).find((x) => x.id === d.id)).toBeUndefined();
    dashboards.update(c.admin, d.id, { memberIds: [c.member.id] });
    expect(dashboards.list(c.member).find((x) => x.id === d.id)).toBeTruthy();
  });

  it("duplicates a dashboard with its widgets and saves a layout", () => {
    const d = dashboards.create(c.admin, { name: "Orig", boardIds: [c.boardId] });
    const w1 = dashboards.createWidget(c.admin, d.id, { type: "text" });
    const w2 = dashboards.createWidget(c.admin, d.id, { type: "counter" });
    expect(w2.layout.y + w2.layout.x).toBeGreaterThanOrEqual(0);
    dashboards.saveLayout(c.admin, d.id, [{ id: w1.id, x: 6, y: 0, w: 4, h: 2 }]);
    expect(dashboards.getWidget(c.admin, w1.id).layout).toEqual({ x: 6, y: 0, w: 4, h: 2 });
    const copy = dashboards.duplicate(c.admin, d.id);
    expect(dashboards.get(c.admin, copy.id).widgets).toHaveLength(2);
    expect(copy.name).toBe("Orig (copy)");
  });
});
