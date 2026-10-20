import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { subscribe, type AppEvent } from "../../src/lib/events";
import { ForbiddenError, ValidationError } from "../../src/lib/errors";
import * as assets from "../../src/server/services/assets";
import * as boards from "../../src/server/services/boards";
import * as columnActions from "../../src/server/services/column-actions";
import * as columnLookup from "../../src/server/services/column-lookup";
import * as columnOps from "../../src/server/services/column-ops";
import * as columns from "../../src/server/services/columns";
import { getBoardFull } from "../../src/server/services/board-data";
import * as groups from "../../src/server/services/groups";
import * as items from "../../src/server/services/items";
import * as permissionsAdmin from "../../src/server/services/permissions";
import * as tags from "../../src/server/services/tags";
import { relationIds } from "../../src/server/columns/relation-base";
import { freshCtx, type Ctx } from "../helpers";

process.env.FILES_DIR = mkdtempSync(path.join(tmpdir(), "weekend-files-"));
let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

/** Two boards like the Delivery demo: Klanten (customers) and Projecten (phases). */
function twoBoards() {
  const klanten = boards.create(c.sys, { workspaceId: c.workspaceId, name: "Klanten", emptyColumns: true });
  const projecten = boards.create(c.sys, { workspaceId: c.workspaceId, name: "Projecten & Fases", emptyColumns: true });
  columns.create(c.sys, projecten.id, { title: "Uren begroot", type: "numbers", key: "uren" });
  columns.create(c.sys, projecten.id, { title: "Fasestatus", type: "status", key: "fasestatus" });
  const rel = columns.create(c.sys, klanten.id, { title: "Projecten", type: "board_relation", key: "projecten", settings: { boardIds: [projecten.id] } });
  return { klanten, projecten, rel };
}
const mkItem = (boardId: string, name: string, values: Record<string, unknown> = {}) => items.create(c.sys, { boardId, name, values });
const get = (id: string) => items.get(c.admin, id);

describe("board_relation two-way sync", () => {
  it("creates the peer column on the other board", () => {
    const { klanten, projecten, rel } = twoBoards();
    expect(rel.settings.peerColumnId).toBeTruthy();
    const peer = columns.list(c.sys, projecten.id).find((x) => x.id === rel.settings.peerColumnId)!;
    expect(peer.type).toBe("board_relation");
    expect(peer.title).toBe("Klanten");
    expect(peer.settings).toMatchObject({ boardIds: [klanten.id], peerColumnId: rel.id });
  });

  it("keeps both sides in sync on add, replace and remove", () => {
    const { klanten, projecten, rel } = twoBoards();
    const peerId = rel.settings.peerColumnId as string;
    const delta = mkItem(klanten.id, "Delta");
    const lms = mkItem(klanten.id, "LMS");
    const f1 = mkItem(projecten.id, "Fase 1");
    const f2 = mkItem(projecten.id, "Fase 2");
    items.changeColumnValue(c.sys, delta.id, rel.id, { item_ids: [f1.id, f2.id] });
    expect(relationIds(get(f1.id).values[peerId] as never)).toEqual([delta.id]);
    expect(relationIds(get(f2.id).values[peerId] as never)).toEqual([delta.id]);
    // setting from the other side
    items.changeColumnValue(c.sys, f2.id, peerId, [delta.id, lms.id]);
    expect(relationIds(get(lms.id).values[rel.id] as never)).toEqual([f2.id]);
    // remove one
    items.changeColumnValue(c.sys, delta.id, rel.id, { item_ids: [f1.id] });
    expect(get(f2.id).values[peerId]).toBeDefined(); // lms still links f2
    expect(relationIds(get(f2.id).values[peerId] as never)).toEqual([lms.id]);
    // clear
    items.changeColumnValue(c.sys, delta.id, rel.id, null);
    expect(get(f1.id).values[peerId]).toBeUndefined();
  });

  it("limit-to-one on the peer replaces the old partner", () => {
    const { klanten, projecten, rel } = twoBoards();
    const peerId = rel.settings.peerColumnId as string;
    columns.update(c.sys, peerId, { settings: { allowMultiple: false } });
    const a = mkItem(klanten.id, "A");
    const b = mkItem(klanten.id, "B");
    const f = mkItem(projecten.id, "F");
    items.changeColumnValue(c.sys, a.id, rel.id, [f.id]);
    items.changeColumnValue(c.sys, b.id, rel.id, [f.id]);
    expect(relationIds(get(f.id).values[peerId] as never)).toEqual([b.id]);
    expect(get(a.id).values[rel.id]).toBeUndefined();
  });

  it("limit-to-one on the column itself rejects two items", () => {
    const { klanten, projecten } = twoBoards();
    const one = columns.create(c.sys, klanten.id, { title: "Hoofdproject", type: "board_relation", settings: { boardIds: [projecten.id], allowMultiple: false, twoWay: false } });
    const k = mkItem(klanten.id, "K");
    const f1 = mkItem(projecten.id, "F1");
    const f2 = mkItem(projecten.id, "F2");
    expect(() => items.changeColumnValue(c.sys, k.id, one.id, [f1.id, f2.id])).toThrow(ValidationError);
    items.changeColumnValue(c.sys, k.id, one.id, [f1.id]);
    expect(one.settings.peerColumnId).toBeUndefined();
  });

  it("rejects items of boards that are not connected and unconfigured columns", () => {
    const { klanten, rel } = twoBoards();
    const other = boards.create(c.sys, { workspaceId: c.workspaceId, name: "Andere", emptyColumns: true });
    const x = mkItem(other.id, "X");
    const k = mkItem(klanten.id, "K");
    expect(() => items.changeColumnValue(c.sys, k.id, rel.id, [x.id])).toThrow(/not on a board connected/);
    expect(() => items.changeColumnValue(c.sys, k.id, rel.id, ["99999"])).toThrow(/does not exist/);
    const loose = columns.create(c.sys, klanten.id, { title: "Los", type: "board_relation" });
    expect(() => items.changeColumnValue(c.sys, k.id, loose.id, [x.id])).toThrow(/not connected/);
  });

  it("pairs two existing unlinked columns (seed boards Klanten / Projecten)", () => {
    const klanten = boards.create(c.sys, { workspaceId: c.workspaceId, name: "Klanten", emptyColumns: true });
    const projecten = boards.create(c.sys, { workspaceId: c.workspaceId, name: "Projecten", emptyColumns: true });
    const a = columns.create(c.sys, klanten.id, { title: "Projecten & fases", type: "board_relation", key: "pf" });
    const b = columns.create(c.sys, projecten.id, { title: "Klant", type: "board_relation", key: "klant" });
    const k = mkItem(klanten.id, "K");
    const f = mkItem(projecten.id, "F");
    columns.update(c.sys, a.id, { settings: { boardIds: [projecten.id], peerColumnId: b.id } });
    expect(columns.get(c.sys, b.id).settings.boardIds).toEqual([klanten.id]);
    expect(columns.list(c.sys, projecten.id).filter((x) => x.type === "board_relation")).toHaveLength(1); // no extra peer column created
    items.changeColumnValue(c.sys, k.id, a.id, [f.id]);
    expect(relationIds(get(f.id).values[b.id] as never)).toEqual([k.id]);
    expect(columns.get(c.sys, b.id).settings.peerColumnId).toBe(a.id);
  });

  it("deleting a column detaches its peer; duplicating gives a one-way copy", () => {
    const { klanten, projecten, rel } = twoBoards();
    const peerId = rel.settings.peerColumnId as string;
    const copy = columns.duplicate(c.sys, rel.id);
    expect(copy.settings.peerColumnId).toBeUndefined();
    columns.remove(c.sys, rel.id);
    expect(columns.get(c.sys, peerId).settings.peerColumnId).toBeUndefined();
    expect(klanten.id).not.toBe(projecten.id);
  });

  it("decorates names, hides removed items and emits events for the other board", () => {
    const { klanten, projecten, rel } = twoBoards();
    const k = mkItem(klanten.id, "Delta");
    const f = mkItem(projecten.id, "Fase 1");
    const events: AppEvent[] = [];
    const off = subscribe((e) => events.push(e));
    items.changeColumnValue(c.sys, k.id, rel.id, [f.id]);
    off();
    expect(events.some((e) => e.type === "column_value.changed" && e.boardId === projecten.id)).toBe(true);
    const v = get(k.id).values[rel.id] as { items: { name: string }[] };
    expect(v.items.map((i) => i.name)).toEqual(["Fase 1"]);
    items.remove(c.sys, f.id);
    expect((get(k.id).values[rel.id] as { items: unknown[] }).items).toEqual([]);
    const full = getBoardFull(c.admin, klanten.id);
    expect(full.items.find((i) => i.id === k.id)!.values[rel.id]).toBeDefined();
  });

  it("item picker search respects boards and query", () => {
    const { projecten } = twoBoards();
    mkItem(projecten.id, "Delta - Fase 1");
    mkItem(projecten.id, "LMS - Doorontwikkeling");
    const hits = columnLookup.searchItems(c.admin, { boardIds: [projecten.id], q: "lms" });
    expect(hits.map((h) => h.name)).toEqual(["LMS - Doorontwikkeling"]);
    expect(hits[0].boardName).toBe("Projecten & Fases");
  });
});

describe("mirror", () => {
  it("reads a column through a relation, with aggregation, on every read path", () => {
    const { klanten, projecten, rel } = twoBoards();
    const mirror = columns.create(c.sys, klanten.id, { title: "Uren", type: "mirror", key: "uren_m", settings: { relationColumnId: rel.key, targetColumnId: "uren", aggregate: "sum" } });
    const list = columns.create(c.sys, klanten.id, { title: "Fase status", type: "mirror", key: "status_m", settings: { relationColumnId: rel.id, targetColumnId: "fasestatus" } });
    const status = columns.list(c.sys, projecten.id).find((x) => x.key === "fasestatus")!;
    const k = mkItem(klanten.id, "Delta");
    const f1 = mkItem(projecten.id, "Fase 1", { uren: 120, fasestatus: "Working on it" });
    const f2 = mkItem(projecten.id, "Fase 2", { uren: 80.5 });
    items.changeColumnValue(c.sys, k.id, rel.id, [f1.id, f2.id]);
    const v = get(k.id).values[mirror.id] as { result: number; entries: unknown[]; column: { type: string } };
    expect(v.result).toBe(200.5);
    expect(v.entries).toHaveLength(2);
    expect(v.column.type).toBe("numbers");
    const lv = get(k.id).values[list.id] as { entries: { value: unknown }[]; column: { settings: { labels: unknown[] } } };
    expect(lv.entries[0].value).toEqual({ index: 0 });
    expect(lv.column.settings.labels.length).toBeGreaterThan(0);
    expect(status.type).toBe("status");
    // via board read model and subscribers of items.list
    expect(items.list(c.admin, { boardId: klanten.id })[0].values[mirror.id]).toMatchObject({ result: 200.5 });
    expect(getBoardFull(c.admin, klanten.id).items[0].values[mirror.id]).toMatchObject({ result: 200.5 });
    // value changes on the other board show up
    items.changeColumnValue(c.sys, f2.id, "uren", 100);
    expect(get(k.id).values[mirror.id]).toMatchObject({ result: 220 });
    // read-only
    expect(() => items.changeColumnValue(c.sys, k.id, mirror.id, 1)).toThrow(/read-only/);
  });

  it("emits item.updated on the mirroring board when the source changes", () => {
    const { klanten, projecten, rel } = twoBoards();
    const k = mkItem(klanten.id, "K");
    const f = mkItem(projecten.id, "F", { uren: 1 });
    items.changeColumnValue(c.sys, k.id, rel.id, [f.id]);
    const events: AppEvent[] = [];
    const off = subscribe((e) => events.push(e));
    items.changeColumnValue(c.sys, f.id, "uren", 5);
    off();
    expect(events.some((e) => e.type === "item.updated" && e.boardId === klanten.id && e.itemId === k.id)).toBe(true);
  });
});

describe("computed columns", () => {
  it("formula over numbers and text, errors, formula referencing a formula", () => {
    const b = c.boardId;
    columns.create(c.sys, b, { title: "Uren", type: "numbers", key: "uren" });
    columns.create(c.sys, b, { title: "Tarief", type: "numbers", key: "tarief" });
    const f = columns.create(c.sys, b, { title: "Bedrag", type: "formula", key: "bedrag", settings: { formula: "{Uren} * {Tarief}", decimals: 2 } });
    columns.create(c.sys, b, { title: "Btw", type: "formula", key: "btw", settings: { formula: "ROUND({Bedrag} * 0.21, 2)" } });
    columns.create(c.sys, b, { title: "Div", type: "formula", key: "div", settings: { formula: "{Uren} / {Tarief}" } });
    columns.create(c.sys, b, { title: "Label", type: "formula", key: "lbl", settings: { formula: 'IF({Uren} > 10, "Groot", "Klein") & " (" & {Name} & ")"' } });
    const it1 = items.create(c.sys, { boardId: b, name: "Taak", values: { uren: 10, tarief: 95 } });
    const row = get(it1.id).values;
    expect(row[f.id]).toMatchObject({ value: 950, kind: "number" });
    const byKey = (k: string) => columns.list(c.sys, b).find((x) => x.key === k)!.id;
    expect(row[byKey("btw")]).toMatchObject({ value: 199.5 });
    expect(row[byKey("lbl")]).toMatchObject({ value: "Klein (Taak)" });
    const none = items.create(c.sys, { boardId: b, name: "Leeg" });
    expect(get(none.id).values[byKey("div")]).toMatchObject({ error: expect.stringMatching(/Division by zero/) });
    expect(() => columns.create(c.sys, b, { title: "Bad", type: "formula", settings: { formula: "1 +" } })).toThrow(ValidationError);
  });

  it("formula SUM over a mirror (Delivery: uren per klant)", () => {
    const { klanten, projecten, rel } = twoBoards();
    columns.create(c.sys, klanten.id, { title: "Uren", type: "mirror", key: "uren_m", settings: { relationColumnId: rel.id, targetColumnId: "uren" } });
    const total = columns.create(c.sys, klanten.id, { title: "Totaal", type: "formula", key: "totaal", settings: { formula: "SUM({Uren}) * 2" } });
    const k = mkItem(klanten.id, "K");
    const f1 = mkItem(projecten.id, "F1", { uren: 10 });
    const f2 = mkItem(projecten.id, "F2", { uren: 5 });
    items.changeColumnValue(c.sys, k.id, rel.id, [f1.id, f2.id]);
    expect(get(k.id).values[total.id]).toMatchObject({ value: 30 });
  });

  it("circular formulas are reported as errors", () => {
    const b = c.boardId;
    columns.create(c.sys, b, { title: "A", type: "formula", key: "a", settings: { formula: "{B} + 1" } });
    const bcol = columns.create(c.sys, b, { title: "B", type: "formula", key: "b", settings: { formula: "{A} + 1" } });
    const i = mkItem(b, "x");
    expect(get(i.id).values[bcol.id]).toMatchObject({ error: expect.stringMatching(/Circular/) });
  });

  it("progress from subitem statuses, auto number, item id, creation log, last updated, assignees", () => {
    const b = c.boardId;
    const progress = columns.create(c.sys, b, { title: "Voortgang", type: "progress", key: "voortgang" });
    const num = columns.create(c.sys, b, { title: "Nr", type: "auto_number", key: "nr", settings: { prefix: "T-", minDigits: 3, startAt: 10 } });
    const idc = columns.create(c.sys, b, { title: "Id", type: "item_id", key: "idc" });
    const cl = columns.create(c.sys, b, { title: "Gemaakt", type: "creation_log", key: "gemaakt" });
    const lu = columns.create(c.sys, b, { title: "Gewijzigd", type: "last_updated", key: "gewijzigd" });
    const as = columns.create(c.sys, b, { title: "Wie", type: "item_assignees", key: "wie" });
    const first = items.create(c.admin, { boardId: b, name: "Eerste", values: { people: [c.userIds.dev1] } });
    const second = items.create(c.admin, { boardId: b, name: "Tweede" });
    items.create(c.sys, { boardId: b, parentItemId: first.id, name: "s1", values: { status: "Done", people: [c.userIds.dev2] } });
    items.create(c.sys, { boardId: b, parentItemId: first.id, name: "s2", values: { status: "Working on it" } });
    items.create(c.sys, { boardId: b, parentItemId: first.id, name: "s3", values: { status: "Done" } });
    items.create(c.sys, { boardId: b, parentItemId: first.id, name: "s4" });
    const r = get(first.id).values;
    expect(r[progress.id]).toEqual({ done: 2, total: 4, percent: 50 });
    expect(get(second.id).values[progress.id]).toBeUndefined();
    expect(r[num.id]).toBe(10);
    expect(get(second.id).values[num.id]).toBe(11);
    expect(r[idc.id]).toBe(first.id);
    expect(r[cl.id]).toMatchObject({ userId: c.admin.id });
    expect((r[lu.id] as { at: string }).at).toBeTruthy();
    expect((r[as.id] as { personsAndTeams: { id: string }[] }).personsAndTeams.map((p) => p.id).sort()).toEqual([c.userIds.dev2, c.userIds.dev1].sort());
    expect(getBoardFull(c.admin, b).items.find((i) => i.id === first.id)!.values[progress.id]).toMatchObject({ percent: 50 });
  });

  it("progress through a relation", () => {
    const { klanten, projecten, rel } = twoBoards();
    const p = columns.create(c.sys, klanten.id, { title: "Fasevoortgang", type: "progress", key: "fv", settings: { source: "relation", relationColumnId: rel.id, columnId: "fasestatus" } });
    const k = mkItem(klanten.id, "K");
    const status = columns.list(c.sys, projecten.id).find((x) => x.key === "fasestatus")!;
    columns.update(c.sys, status.id, { settings: { labels: [{ id: 0, text: "Gepland", color: "#fdab3d", index: 0 }, { id: 1, text: "Afgerond", color: "#00c875", index: 1 }] } });
    const f1 = mkItem(projecten.id, "F1", { fasestatus: "Afgerond" });
    const f2 = mkItem(projecten.id, "F2", { fasestatus: "Gepland" });
    items.changeColumnValue(c.sys, k.id, rel.id, [f1.id, f2.id]);
    expect(get(k.id).values[p.id]).toEqual({ done: 1, total: 2, percent: 50 });
  });
});

describe("dependency", () => {
  it("accepts same-board links and rejects cycles and foreign items", () => {
    const b = c.boardId;
    const dep = columns.create(c.sys, b, { title: "Afhankelijk van", type: "dependency", key: "dep" });
    const a = mkItem(b, "A");
    const bb = mkItem(b, "B");
    const cc = mkItem(b, "C");
    items.changeColumnValue(c.sys, bb.id, dep.id, [a.id]);
    items.changeColumnValue(c.sys, cc.id, dep.id, [bb.id]);
    expect(() => items.changeColumnValue(c.sys, a.id, dep.id, [cc.id])).toThrow(/cycle/);
    expect(() => items.changeColumnValue(c.sys, a.id, dep.id, [a.id])).toThrow(/itself/);
    const other = boards.create(c.sys, { workspaceId: c.workspaceId, name: "Ander", emptyColumns: true });
    const x = mkItem(other.id, "X");
    expect(() => items.changeColumnValue(c.sys, a.id, dep.id, [x.id])).toThrow(/same board/);
    expect((get(cc.id).values[dep.id] as { items: { name: string }[] }).items[0].name).toBe("B");
    items.changeColumnValue(c.sys, bb.id, dep.id, null);
    items.changeColumnValue(c.sys, a.id, dep.id, [cc.id]); // chain is cut, now fine
  });
});

describe("tags", () => {
  it("creates/gets account tags and decorates values", () => {
    const t1 = tags.createOrGet(c.admin, { name: "Urgent" });
    expect(tags.createOrGet(c.admin, { name: "urgent" }).id).toBe(t1.id);
    const t2 = tags.createOrGet(c.admin, { name: "Klant" });
    const col = columns.create(c.sys, c.boardId, { title: "Tags", type: "tags", key: "tgs" });
    const i = mkItem(c.boardId, "x");
    items.changeColumnValue(c.admin, i.id, col.id, { tag_ids: [t1.id, t2.id] });
    const v = get(i.id).values[col.id] as { tag_ids: string[]; tags: { name: string }[] };
    expect(v.tags.map((t) => t.name)).toEqual(["Urgent", "Klant"]);
    expect(tags.list(c.admin, { q: "kl" }).map((t) => t.name)).toEqual(["Klant"]);
    tags.update(c.admin, t1.id, { name: "Dringend" });
    expect((get(i.id).values[col.id] as { tags: { name: string }[] }).tags[0].name).toBe("Dringend");
    expect(() => tags.createOrGet(c.viewer, { name: "Nope" })).toThrow(ForbiddenError);
  });
});

describe("time tracking", () => {
  it("start/stop/add via commands and actions", () => {
    const col = columns.create(c.sys, c.boardId, { title: "Tijd", type: "time_tracking", key: "tijd" });
    const i = mkItem(c.boardId, "x");
    columnActions.run(c.admin, i.id, col.id, { action: "start" });
    let v = get(i.id).values[col.id] as { running: boolean; startDate: number };
    expect(v.running).toBe(true);
    items.changeColumnValue(c.admin, i.id, col.id, { command: "stop" });
    v = get(i.id).values[col.id] as never;
    expect(v).toMatchObject({ running: false });
    columnActions.run(c.admin, i.id, col.id, { action: "add", seconds: 600, note: "handmatig" });
    const after = get(i.id).values[col.id] as { duration: number; additional_value: { id: string; started_user_id: string }[] };
    expect(after.duration).toBeGreaterThanOrEqual(600);
    expect(after.additional_value.at(-1)!.started_user_id).toBe(c.admin.id);
    columnActions.run(c.admin, i.id, col.id, { action: "remove", id: after.additional_value.at(-1)!.id });
    expect(() => columnActions.run(c.admin, i.id, col.id, { action: "click" })).toThrow(/not a button/);
    // also on create
    const j = items.create(c.sys, { boardId: c.boardId, name: "y", values: { tijd: { command: "start" } } });
    expect((get(j.id).values[col.id] as { running: boolean }).running).toBe(true);
  });
});

describe("button", () => {
  it("click emits button.clicked, viewers cannot click", () => {
    const col = columns.create(c.sys, c.boardId, { title: "Go", type: "button", key: "go", settings: { label: "Start" } });
    const i = mkItem(c.boardId, "x");
    const events: AppEvent[] = [];
    const off = subscribe((e) => events.push(e));
    columnActions.click(c.admin, i.id, col.id);
    off();
    expect(events).toContainEqual(expect.objectContaining({ type: "button.clicked", itemId: i.id, columnId: col.id }));
    expect(() => columnActions.click(c.viewer, i.id, col.id)).toThrow(ForbiddenError);
    expect(() => items.changeColumnValue(c.sys, i.id, col.id, "x")).toThrow(/read-only/);
  });
});

describe("assets and the file column", () => {
  it("uploads to data/files, attaches to the file column, lists, reads, removes", () => {
    const col = columns.create(c.sys, c.boardId, { title: "Bestanden", type: "file", key: "bestanden" });
    const i = mkItem(c.boardId, "x");
    const a = assets.upload(c.admin, { itemId: i.id, columnId: col.key, name: "logo.png", mimeType: "image/png" }, new Uint8Array([1, 2, 3]));
    const b = assets.upload(c.admin, { itemId: i.id, columnId: col.id, name: "notities.pdf", mimeType: "application/pdf" }, new Uint8Array([4, 5]));
    expect(a).toMatchObject({ name: "logo.png", size: 3, isImage: true, url: `/api/v1/assets/${a.id}` });
    const v = get(i.id).values[col.id] as { files: { assetId: string; name: string }[] };
    expect(v.files.map((f) => f.name)).toEqual(["logo.png", "notities.pdf"]);
    expect(assets.list(c.admin, { itemId: i.id }).map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
    expect(assets.read(c.admin, a.id).bytes()).toEqual(Buffer.from([1, 2, 3]));
    assets.remove(c.admin, a.id);
    expect((get(i.id).values[col.id] as { files: unknown[] }).files).toHaveLength(1);
    expect(() => assets.get(c.admin, a.id)).toThrow(/Asset/);
    assets.remove(c.admin, b.id);
    expect(get(i.id).values[col.id]).toBeUndefined();
  });

  it("validates uploads and permissions", () => {
    const col = columns.create(c.sys, c.boardId, { title: "F", type: "file", key: "f" });
    const i = mkItem(c.boardId, "x");
    expect(() => assets.upload(c.admin, { itemId: i.id, name: "a.txt" }, new Uint8Array())).toThrow(/empty/);
    expect(() => assets.upload(c.admin, { name: "a.txt" }, new Uint8Array([1]))).toThrow(ValidationError);
    expect(() => assets.upload(c.viewer, { itemId: i.id, name: "a.txt" }, new Uint8Array([1]))).toThrow(ForbiddenError);
    expect(() => assets.upload(c.admin, { itemId: i.id, columnId: "nope", name: "a.txt" }, new Uint8Array([1]))).toThrow();
    // path traversal in names is neutralised
    const a = assets.upload(c.admin, { itemId: i.id, name: "../../etc/passwd" }, new Uint8Array([1]));
    expect(assets.read(c.admin, a.id).absPath.startsWith(process.env.FILES_DIR!)).toBe(true);
    // a file column refuses unknown asset ids
    expect(() => items.changeColumnValue(c.admin, i.id, col.id, { files: [{ assetId: "424242", name: "x" }] })).toThrow(/does not exist/);
  });
});

describe("column permissions and label cleanup", () => {
  it("hidden columns are stripped, non-editors cannot write", () => {
    const col = columns.create(c.sys, c.boardId, { title: "Geheim", type: "text", key: "geheim" });
    const i = mkItem(c.boardId, "x", { geheim: "top secret" });
    expect(get(i.id).values[col.id]).toBe("top secret");
    permissionsAdmin.setColumnPermission(c.admin, col.id, { view: { mode: "owners" }, edit: { mode: "owners" } });
    expect(get(i.id).values[col.id]).toBe("top secret"); // admin is owner
    expect(items.get(c.member, i.id).values[col.id]).toBeUndefined();
    expect(getBoardFull(c.member, c.boardId).columns.some((x) => x.id === col.id)).toBe(false);
    permissionsAdmin.setColumnPermission(c.admin, col.id, { view: { mode: "everyone" }, edit: { mode: "owners" } });
    expect(items.get(c.member, i.id).values[col.id]).toBe("top secret");
    expect(getBoardFull(c.member, c.boardId).columns.find((x) => x.id === col.id)!.canEdit).toBe(false);
    expect(() => items.changeColumnValue(c.member, i.id, col.id, "nope")).toThrow(ForbiddenError);
    items.changeColumnValue(c.admin, i.id, col.id, "wel");
  });

  it("removing status / dropdown labels clears values that used them", () => {
    const st = columns.list(c.sys, c.boardId).find((x) => x.type === "status")!;
    const i = mkItem(c.boardId, "x", { status: "Done" });
    const labels = (st.settings.labels as { id: number; text: string }[]).filter((l) => l.text !== "Done");
    columns.update(c.admin, st.id, { settings: { labels } });
    expect(get(i.id).values[st.id]).toBeUndefined();
    const dd = columns.create(c.sys, c.boardId, { title: "D", type: "dropdown", key: "dd", settings: { labels: [{ id: 1, text: "a" }, { id: 2, text: "b" }, { id: 3, text: "c" }] } });
    const j = mkItem(c.boardId, "y", { dd: ["a", "b"] });
    columns.update(c.admin, dd.id, { settings: { labels: [{ id: 1, text: "a" }, { id: 3, text: "c" }] } });
    expect(get(j.id).values[dd.id]).toEqual({ ids: [1] });
  });
});

describe("change column type", () => {
  it("text -> status builds labels, numbers -> text, status -> dropdown keeps ids, computed drops values", () => {
    const t = columns.create(c.sys, c.boardId, { title: "Soort", type: "text", key: "soort" });
    const a = mkItem(c.boardId, "a", { soort: "Rood" });
    const b = mkItem(c.boardId, "b", { soort: "Blauw" });
    mkItem(c.boardId, "c", { soort: "Rood" });
    const st = columnOps.changeType(c.admin, t.id, { type: "status" });
    expect(st.type).toBe("status");
    const labels = st.settings.labels as { id: number; text: string }[];
    expect(labels.map((l) => l.text)).toEqual(["Rood", "Blauw"]);
    expect(get(a.id).values[t.id]).toEqual({ index: labels[0].id });
    expect(get(b.id).values[t.id]).toEqual({ index: labels[1].id });
    const dd = columnOps.changeType(c.admin, t.id, { type: "dropdown" });
    expect(get(a.id).values[dd.id]).toEqual({ ids: [labels[0].id] });
    const txt = columnOps.changeType(c.admin, t.id, { type: "text" });
    expect(get(a.id).values[txt.id]).toBe("Rood");
    const n = columns.create(c.sys, c.boardId, { title: "N", type: "numbers", key: "n" });
    const x = mkItem(c.boardId, "x", { n: 12.5 });
    columnOps.changeType(c.admin, n.id, { type: "text" });
    expect(get(x.id).values[n.id]).toBe("12.5");
    columnOps.changeType(c.admin, n.id, { type: "numbers" });
    expect(get(x.id).values[n.id]).toBe(12.5);
    mkItem(c.boardId, "y", { n: 3 });
    columnOps.changeType(c.admin, n.id, { type: "text" });
    const d = columns.create(c.sys, c.boardId, { title: "Dat", type: "date", key: "dat" });
    mkItem(c.boardId, "z", { dat: "2026-10-06" });
    const dateAsNumber = columnOps.changeType(c.admin, d.id, { type: "numbers" });
    expect(dateAsNumber.type).toBe("numbers"); // unconvertible values are dropped, not an error
    expect(() => columnOps.changeType(c.admin, "999", { type: "text" })).toThrow();
    expect(() => columnOps.changeType(c.viewer, t.id, { type: "text" })).toThrow(ForbiddenError);
    expect(groups.list(c.sys, c.boardId).length).toBeGreaterThan(0);
  });
});
