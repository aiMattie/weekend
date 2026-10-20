import { beforeEach, describe, expect, it } from "vitest";
import { seed } from "../../src/db/seed";
import { db } from "../../src/db/client";
import { users } from "../../src/db/schema/core";
import { hashPassword, verifyPassword } from "../../src/lib/auth/password";
import { signSession, verifySession } from "../../src/lib/auth/session";
import * as boards from "../../src/server/services/boards";
import * as columns from "../../src/server/services/columns";
import * as folders from "../../src/server/services/folders";
import * as groups from "../../src/server/services/groups";
import * as items from "../../src/server/services/items";
import * as workspaces from "../../src/server/services/workspaces";
import { getBoardFull, getNavData } from "../../src/server/services/board-data";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

describe("seed", () => {
  it("creates 12 users, 3 teams, 10 workspaces and is idempotent", async () => {
    expect(db.select().from(users).all()).toHaveLength(12);
    expect(workspaces.list(c.admin)).toHaveLength(10);
    await seed({ password: "other", demoBoards: true });
    await seed({ password: "other", demoBoards: true });
    expect(db.select().from(users).all()).toHaveLength(12);
    const names = boards.list(c.admin).map((b) => b.name);
    expect(names.filter((n) => n === "Klanten")).toHaveLength(1);
    expect(names).toContain("Projecten & Fases");
    const klanten = boards.list(c.admin).find((b) => b.name === "Klanten")!;
    const full = getBoardFull(c.admin, klanten.id);
    expect(full.groups.map((g) => g.title)).toEqual(["Actieve klanten", "Support SLA & strippenkaart", "Taken completed"]);
    expect(full.columns.find((x) => x.key === "status")!.settings.labels).toHaveLength(4);
    expect(full.items.length).toBeGreaterThan(5);
  });
});

describe("auth primitives", () => {
  it("hashes and verifies passwords, signs and verifies sessions", async () => {
    const h = await hashPassword("secret-pw");
    expect(await verifyPassword("secret-pw", h)).toBe(true);
    expect(await verifyPassword("nope", h)).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
    const token = await signSession("12345");
    expect(await verifySession(token)).toBe("12345");
    expect(await verifySession(token + "x")).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });
});

describe("boards / groups / folders / workspaces", () => {
  it("a new board has Name/Owner/Status/Date, one group and a table view", () => {
    const full = getBoardFull(c.admin, c.boardId);
    expect(full.columns.map((x) => x.key)).toEqual(["name", "people", "status", "date"]);
    expect(full.groups).toHaveLength(1);
    expect(full.views.map((v) => v.type)).toEqual(["table"]);
    expect(full.permissions.editItems).toBe(true);
  });

  it("duplicates structure and items with remapped column ids", () => {
    items.create(c.admin, { boardId: c.boardId, name: "A", values: { status: "Done" } });
    const copy = boards.duplicate(c.admin, c.boardId, { withItems: true, name: "Copy" });
    const full = getBoardFull(c.admin, copy.id);
    const status = full.columns.find((x) => x.key === "status")!;
    expect(full.items).toHaveLength(1);
    expect(full.items[0].values[status.id]).toEqual({ index: 1 });
  });

  it("manages favorites, groups, columns and soft-deletes boards", () => {
    expect(boards.toggleFavorite(c.member, c.boardId)).toBe(true);
    expect(getNavData(c.member).favorites).toEqual([c.boardId]);
    expect(boards.toggleFavorite(c.member, c.boardId)).toBe(false);
    const g2 = groups.create(c.admin, c.boardId, { title: "Two" });
    expect(groups.duplicate(c.admin, g2.id).title).toContain("Two");
    const col = columns.create(c.admin, c.boardId, { title: "Prio", type: "dropdown", settings: { labels: ["Hoog", "Laag"] } });
    expect(col.settings.labels).toEqual([{ id: 1, text: "Hoog" }, { id: 2, text: "Laag" }]);
    expect(() => columns.create(c.admin, c.boardId, { title: "x", type: "name" })).toThrow();
    boards.remove(c.admin, c.boardId);
    expect(boards.list(c.admin).some((b) => b.id === c.boardId)).toBe(false);
  });

  it("folders nest, delete moves boards to the root", () => {
    const f = folders.create(c.admin, { workspaceId: c.workspaceId, name: "Docs" });
    boards.update(c.admin, c.boardId, { folderId: f.id });
    folders.remove(c.admin, f.id);
    expect(boards.get(c.admin, c.boardId).folderId).toBeNull();
  });
});
