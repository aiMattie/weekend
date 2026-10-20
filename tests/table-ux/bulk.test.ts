import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, ValidationError } from "../../src/lib/errors";
import * as boards from "../../src/server/services/boards";
import * as bulk from "../../src/server/services/bulk";
import * as columns from "../../src/server/services/columns";
import * as groups from "../../src/server/services/groups";
import * as items from "../../src/server/services/items";
import * as itemOps from "../../src/server/services/item-ops";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

const mk = (n: number) => Array.from({ length: n }, (_, i) => items.create(c.admin, { boardId: c.boardId, name: `Item ${i + 1}` }));
const names = (state: "active" | "archived" | "deleted" = "active") => items.list(c.admin, { boardId: c.boardId, state }).map((i) => i.name);

describe("bulk operations", () => {
  it("duplicates, archives, deletes and restores a selection", () => {
    const [a, b, d] = mk(3);
    const r = bulk.apply(c.admin, c.boardId, { action: "duplicate", itemIds: [a.id, b.id] });
    expect(r.count).toBe(2);
    expect(r.createdIds).toHaveLength(2);
    expect(names()).toHaveLength(5);
    bulk.apply(c.admin, c.boardId, { action: "archive", itemIds: [a.id] });
    expect(names("archived")).toEqual(["Item 1"]);
    bulk.apply(c.admin, c.boardId, { action: "delete", itemIds: [d.id] });
    expect(names("deleted")).toEqual(["Item 3"]);
    bulk.apply(c.admin, c.boardId, { action: "restore", itemIds: [a.id, d.id] });
    expect(names("archived")).toEqual([]);
    expect(names()).toContain("Item 3");
  });

  it("moves a selection to another group and to another board", () => {
    const [a, b] = mk(2);
    const g2 = groups.create(c.admin, c.boardId, { title: "Doel" });
    bulk.apply(c.admin, c.boardId, { action: "move", itemIds: [a.id, b.id], groupId: g2.id });
    expect(items.list(c.admin, { boardId: c.boardId, groupId: g2.id }).map((i) => i.name)).toEqual(["Item 1", "Item 2"]);
    const other = boards.create(c.admin, { workspaceId: c.workspaceId, name: "Doelboard" });
    bulk.apply(c.admin, c.boardId, { action: "move", itemIds: [a.id], boardId: other.id });
    expect(items.list(c.admin, { boardId: other.id }).map((i) => i.name)).toEqual(["Item 1"]);
    expect(names()).toEqual(["Item 2"]);
  });

  it("updates one column on every selected item (and clears with null)", () => {
    const [a, b] = mk(2);
    const status = columns.list(c.admin, c.boardId).find((x) => x.key === "status")!;
    bulk.apply(c.admin, c.boardId, { action: "update", itemIds: [a.id, b.id], columnId: status.id, value: "Done" });
    expect(items.get(c.admin, a.id).values[status.id]).toEqual({ index: 1 });
    expect(items.get(c.admin, b.id).values[status.id]).toEqual({ index: 1 });
    bulk.apply(c.admin, c.boardId, { action: "update", itemIds: [a.id], columnId: "status", value: null });
    expect(items.get(c.admin, a.id).values[status.id]).toBeUndefined();
  });

  it("is all or nothing: one bad item or value rolls the whole selection back", () => {
    const [a, b] = mk(2);
    const other = boards.create(c.admin, { workspaceId: c.workspaceId, name: "Ander" });
    const foreign = items.create(c.admin, { boardId: other.id, name: "Vreemd" });
    expect(() => bulk.apply(c.admin, c.boardId, { action: "archive", itemIds: [a.id, foreign.id] })).toThrow(ValidationError);
    expect(names()).toEqual(["Item 1", "Item 2"]);
    expect(() => bulk.apply(c.admin, c.boardId, { action: "update", itemIds: [a.id, b.id], columnId: "status", value: "bestaat-niet" })).toThrow(ValidationError);
    expect(names("archived")).toEqual([]);
  });

  it("validates input and permissions", () => {
    const [a] = mk(1);
    expect(() => bulk.apply(c.admin, c.boardId, { action: "archive", itemIds: [] })).toThrow(ValidationError);
    expect(() => bulk.apply(c.admin, c.boardId, { action: "explode", itemIds: [a.id] })).toThrow(ValidationError);
    expect(() => bulk.apply(c.viewer, c.boardId, { action: "archive", itemIds: [a.id] })).toThrow(ForbiddenError);
  });
});

describe("convert item <-> subitem", () => {
  it("converts an item to a subitem (values mapped by key/type) and back", () => {
    const [parent, child] = mk(2);
    items.changeMultipleColumnValues(c.admin, child.id, { status: "Done", date: "2026-12-01" });
    const sub = itemOps.convertToSubitem(c.admin, child.id, parent.id);
    expect(sub.parentItemId).toBe(parent.id);
    expect(names()).toEqual(["Item 1"]);
    const subCols = columns.list(c.admin, c.boardId, "subitem");
    const subStatus = subCols.find((x) => x.key === "status")!;
    expect(items.get(c.admin, child.id).values[subStatus.id]).toEqual({ index: 1 });
    expect(items.get(c.admin, parent.id).subitems.map((s) => s.name)).toEqual(["Item 2"]);
    const back = itemOps.convertToItem(c.admin, child.id);
    expect(back.parentItemId).toBeNull();
    expect(names()).toEqual(["Item 1", "Item 2"]);
    const itemStatus = columns.list(c.admin, c.boardId, "item").find((x) => x.key === "status")!;
    expect(items.get(c.admin, child.id).values[itemStatus.id]).toEqual({ index: 1 });
  });

  it("refuses invalid conversions", () => {
    const [a, b] = mk(2);
    itemOps.convertToSubitem(c.admin, b.id, a.id);
    expect(() => itemOps.convertToSubitem(c.admin, a.id, b.id)).toThrow(ValidationError); // a has subitems
    expect(() => itemOps.convertToSubitem(c.admin, a.id, a.id)).toThrow(ValidationError);
    expect(() => itemOps.convertToItem(c.admin, a.id)).toThrow(ValidationError); // not a subitem
  });
});
