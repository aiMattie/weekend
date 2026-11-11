import { beforeEach, describe, expect, it } from "vitest";
import { getNavData } from "../../src/server/services/board-data";
import * as workspaces from "../../src/server/services/workspaces";
import { groupWorkspaces, workspaceCategories } from "../../src/lib/workspace-groups";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

describe("workspace category", () => {
  it("is stored, trimmed, cleared with an empty string and exposed in nav data", () => {
    const ws = workspaces.create(c.admin, { name: "Acme", category: "  Klanten " });
    expect(ws.category).toBe("Klanten");
    expect(getNavData(c.admin).workspaces.find((w) => w.id === ws.id)?.category).toBe("Klanten");
    expect(workspaces.update(c.admin, ws.id, { category: "" }).category).toBeNull();
    expect(workspaces.update(c.admin, ws.id, { category: "Intern" }).category).toBe("Intern");
    expect(workspaces.update(c.admin, ws.id, { name: "Acme BV" }).category).toBe("Intern");
  });

  it("rejects categories longer than 60 characters", () => {
    expect(() => workspaces.create(c.admin, { name: "Long", category: "x".repeat(61) })).toThrow();
  });
});

describe("workspace favorites", () => {
  it("toggles per user and is exposed in nav data", () => {
    const ws = workspaces.create(c.admin, { name: "Acme" });
    expect(getNavData(c.admin).workspaceFavorites).toEqual([]);
    expect(workspaces.toggleFavorite(c.admin, ws.id)).toBe(true);
    expect(getNavData(c.admin).workspaceFavorites).toEqual([ws.id]);
    expect(workspaces.listFavoriteIds(c.member)).toEqual([]);
    expect(workspaces.toggleFavorite(c.admin, ws.id)).toBe(false);
    expect(getNavData(c.admin).workspaceFavorites).toEqual([]);
  });

  it("rejects unknown workspaces", () => {
    expect(() => workspaces.toggleFavorite(c.admin, "nope")).toThrow();
  });
});

describe("groupWorkspaces", () => {
  const list = [
    { id: "1", name: "Delivery", category: null },
    { id: "2", name: "Sumedia", category: "Klanten" },
    { id: "3", name: "NinA Intern", category: "Intern" },
    { id: "4", name: "Megaborn", category: "klanten" },
    { id: "5", name: "Support", category: "" },
  ];

  it("groups case-insensitively, puts Klanten first, sorts the rest and puts uncategorised last, alphabetical within a group", () => {
    expect(groupWorkspaces([...list, { id: "6", name: "Archief", category: "Archief" }]).map((g) => [g.category, g.workspaces.map((w) => w.id)])).toEqual([
      ["Klanten", ["4", "2"]],
      ["Archief", ["6"]],
      ["Intern", ["3"]],
      [null, ["1", "5"]],
    ]);
    expect(workspaceCategories(list)).toEqual(["Klanten", "Intern"]);
  });

  it("puts starred workspaces in their own alphabetical group at the top, out of their category", () => {
    const groups = groupWorkspaces(list, ["5", "2"]);
    expect(groups.map((g) => [g.favorite ?? false, g.category, g.workspaces.map((w) => w.id)])).toEqual([
      [true, null, ["2", "5"]],
      [false, "klanten", ["4"]],
      [false, "Intern", ["3"]],
      [false, null, ["1"]],
    ]);
  });

  it("sorts a flat list alphabetically, case-insensitively", () => {
    const flat = ["Main workspace", "Delivery", "adjust", "Cookinglife", "Carrier API", "Bouwbrain"].map((name, i) => ({ id: String(i), name, category: null }));
    expect(groupWorkspaces(flat)[0].workspaces.map((w) => w.name)).toEqual(["adjust", "Bouwbrain", "Carrier API", "Cookinglife", "Delivery", "Main workspace"]);
  });

  it("returns one uncategorised group when nothing has a category", () => {
    expect(groupWorkspaces([{ id: "1", category: null }])).toEqual([{ category: null, workspaces: [{ id: "1", category: null }] }]);
    expect(groupWorkspaces([])).toEqual([]);
  });
});
