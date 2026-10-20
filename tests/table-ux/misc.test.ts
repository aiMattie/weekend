import { beforeEach, describe, expect, it } from "vitest";
import * as boardExport from "../../src/server/services/export";
import * as boardInfo from "../../src/server/services/board-info";
import * as boardTemplates from "../../src/server/services/board-templates";
import * as columns from "../../src/server/services/columns";
import * as groups from "../../src/server/services/groups";
import * as items from "../../src/server/services/items";
import * as recent from "../../src/server/services/recent";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

describe("board templates", () => {
  it("lists built-in templates and creates a board with groups, columns and sample items", () => {
    const list = boardTemplates.list();
    expect(list.map((t) => t.id)).toEqual(expect.arrayContaining(["blank", "project-management", "task-tracker", "crm-leads"]));
    const b = boardTemplates.createBoard(c.admin, { templateId: "project-management", workspaceId: c.workspaceId, name: "Mijn project", visibility: "private" });
    expect(b.visibility).toBe("private");
    expect(b.settings).toMatchObject({ template: "project-management" });
    expect(groups.list(c.admin, b.id).map((g) => g.title)).toEqual(["Gepland", "Actief", "Afgerond"]);
    expect(columns.list(c.admin, b.id, "item").map((x) => x.title)).toEqual(["Name", "Verantwoordelijke", "Status", "Prioriteit", "Looptijd", "Deadline", "Notities"]);
    const its = items.list(c.admin, { boardId: b.id });
    expect(its.map((i) => i.name).sort()).toEqual(["Bouw", "Kick-off", "Ontwerp", "Oplevering"]);
    expect(items.listSubitems(c.admin, its.find((i) => i.name === "Kick-off")!.id).map((s) => s.name)).toEqual(["Agenda opstellen", "Uitnodigingen versturen"]);
  });

  it("every registered template (incl. dev and Delivery boards) creates a board with its items", () => {
    const list = boardTemplates.list();
    expect(list.map((t) => t.id)).toEqual(expect.arrayContaining(["dev-tasks", "dev-sprints", "dev-epics", "dev-bugs", "dev-retro", "delivery-klanten", "delivery-fases", "delivery-uren"]));
    for (const t of list) {
      const b = boardTemplates.createBoard(c.admin, { templateId: t.id, workspaceId: c.workspaceId, name: `T ${t.id}` });
      expect(columns.list(c.admin, b.id, "item").length, t.id).toBeGreaterThan(1);
    }
  });

  it("rejects unknown templates and respects workspace permissions", () => {
    expect(() => boardTemplates.createBoard(c.admin, { templateId: "bestaat-niet", workspaceId: c.workspaceId, name: "x" })).toThrow();
    expect(() => boardTemplates.createBoard(c.viewer, { templateId: "blank", workspaceId: c.workspaceId, name: "x" })).toThrow();
  });
});

describe("export", () => {
  it("exports csv with names, groups and formatted values, restricted to a selection", async () => {
    const a = items.create(c.admin, { boardId: c.boardId, name: "A, met komma" });
    items.create(c.admin, { boardId: c.boardId, name: "B" });
    items.changeMultipleColumnValues(c.admin, a.id, { status: "Done" });
    const all = await boardExport.exportBoard(c.admin, c.boardId, { format: "csv" });
    const text = all.bytes.toString("utf8");
    expect(all.filename).toBe("Test_board.csv");
    expect(text).toContain('Group,Name,Owner,Status,Date');
    expect(text).toContain('"A, met komma"');
    expect(text).toContain("Done");
    const one = await boardExport.exportBoard(c.admin, c.boardId, { format: "csv", itemIds: [a.id] });
    expect(one.bytes.toString("utf8")).not.toContain("\r\nGroup Title,B");
  });

  it("exports a valid xlsx workbook", async () => {
    items.create(c.admin, { boardId: c.boardId, name: "A" });
    const f = await boardExport.exportBoard(c.admin, c.boardId, { format: "xlsx" });
    expect(f.mimeType).toContain("spreadsheetml");
    expect(f.bytes.subarray(0, 2).toString()).toBe("PK");
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(f.bytes as never);
    expect(wb.worksheets[0].getRow(2).getCell(2).value).toBe("A");
  });
});

describe("recent boards and info", () => {
  it("tracks recently visited boards per user, newest first", async () => {
    const b2 = (await import("../../src/server/services/boards")).create(c.admin, { workspaceId: c.workspaceId, name: "Tweede" });
    recent.visit(c.admin, c.boardId);
    await new Promise((r) => setTimeout(r, 5));
    recent.visit(c.admin, b2.id);
    expect(recent.list(c.admin).map((r) => r.board.id)).toEqual([b2.id, c.boardId]);
    expect(recent.list(c.member)).toEqual([]);
  });

  it("returns board info counts", () => {
    const p = items.create(c.admin, { boardId: c.boardId, name: "P" });
    items.create(c.admin, { boardId: c.boardId, name: "S", parentItemId: p.id });
    const i = boardInfo.info(c.admin, c.boardId);
    expect(i.counts).toMatchObject({ items: 1, subitems: 1, groups: 1, views: 1 });
    expect(i.workspace?.name).toBe("Delivery");
  });
});
