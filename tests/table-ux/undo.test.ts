import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, ValidationError } from "../../src/lib/errors";
import * as columns from "../../src/server/services/columns";
import * as groups from "../../src/server/services/groups";
import * as items from "../../src/server/services/items";
import * as undo from "../../src/server/services/undo";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

const statusCol = () => columns.list(c.admin, c.boardId).find((x) => x.key === "status")!;
const names = () => items.list(c.admin, { boardId: c.boardId }).map((i) => i.name);

describe("undo log", () => {
  it("undoes and redoes a value change through the services", () => {
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "A" });
    const col = statusCol();
    items.changeColumnValue(c.admin, it1.id, col.id, "Done");
    undo.record(c.admin, c.boardId, { label: "Status gewijzigd", undo: [{ op: "setValues", itemId: it1.id, values: { [col.id]: null } }], redo: [{ op: "setValues", itemId: it1.id, values: { [col.id]: { index: 1 } } }] });
    expect(undo.state(c.admin, c.boardId)).toMatchObject({ canUndo: true, canRedo: false, undoLabel: "Status gewijzigd" });
    expect(undo.undo(c.admin, c.boardId)).toEqual({ label: "Status gewijzigd" });
    expect(items.get(c.admin, it1.id).values[col.id]).toBeUndefined();
    expect(undo.state(c.admin, c.boardId)).toMatchObject({ canUndo: false, canRedo: true, redoLabel: "Status gewijzigd" });
    undo.redo(c.admin, c.boardId);
    expect(items.get(c.admin, it1.id).values[col.id]).toEqual({ index: 1 });
  });

  it("undoes create (soft delete) and delete (restore), and rename", () => {
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "A" });
    undo.record(c.admin, c.boardId, { label: "Item aangemaakt", undo: [{ op: "setItemState", itemIds: [it1.id], state: "deleted" }], redo: [{ op: "setItemState", itemIds: [it1.id], state: "active" }] });
    undo.undo(c.admin, c.boardId);
    expect(names()).toEqual([]);
    undo.redo(c.admin, c.boardId);
    expect(names()).toEqual(["A"]);
    items.update(c.admin, it1.id, { name: "B" });
    undo.record(c.admin, c.boardId, { label: "Naam", undo: [{ op: "rename", itemId: it1.id, name: "A" }], redo: [{ op: "rename", itemId: it1.id, name: "B" }] });
    undo.undo(c.admin, c.boardId);
    expect(names()).toEqual(["A"]);
  });

  it("restores the position and group of a moved item", () => {
    const g2 = groups.create(c.admin, c.boardId, { title: "Tweede" });
    const g1 = groups.list(c.admin, c.boardId)[0];
    const a = items.create(c.admin, { boardId: c.boardId, name: "A", groupId: g1.id });
    items.create(c.admin, { boardId: c.boardId, name: "B", groupId: g1.id });
    items.move(c.admin, a.id, { groupId: g2.id, top: true });
    undo.record(c.admin, c.boardId, { label: "Verplaatst", undo: [{ op: "moveItem", itemId: a.id, groupId: g1.id, position: a.position }], redo: [{ op: "moveItem", itemId: a.id, groupId: g2.id, position: 0 }] });
    undo.undo(c.admin, c.boardId);
    const back = items.get(c.admin, a.id);
    expect(back.groupId).toBe(g1.id);
    expect(back.position).toBe(a.position);
  });

  it("restores a deleted group together with its items", () => {
    const g2 = groups.create(c.admin, c.boardId, { title: "Weg" });
    items.create(c.admin, { boardId: c.boardId, name: "In weg", groupId: g2.id });
    groups.remove(c.admin, g2.id);
    expect(names()).toEqual([]);
    undo.record(c.admin, c.boardId, { label: "Groep verwijderd", undo: [{ op: "setGroupState", groupId: g2.id, state: "active" }], redo: [{ op: "setGroupState", groupId: g2.id, state: "deleted" }] });
    undo.undo(c.admin, c.boardId);
    expect(names()).toEqual(["In weg"]);
  });

  it("clears the redo side on a new action, is per user and capped", () => {
    const it1 = items.create(c.member, { boardId: c.boardId, name: "A" });
    const rec = (label: string) => undo.record(c.member, c.boardId, { label, undo: [{ op: "rename", itemId: it1.id, name: "A" }], redo: [{ op: "rename", itemId: it1.id, name: "B" }] });
    rec("een");
    rec("twee");
    undo.undo(c.member, c.boardId);
    expect(undo.state(c.member, c.boardId).canRedo).toBe(true);
    rec("drie");
    expect(undo.state(c.member, c.boardId)).toMatchObject({ canRedo: false, undoLabel: "drie" });
    expect(undo.state(c.admin, c.boardId).canUndo).toBe(false);
    for (let i = 0; i < undo.MAX_ENTRIES + 5; i++) rec(`x${i}`);
    let n = 0;
    while (undo.undo(c.member, c.boardId)) n++;
    expect(n).toBe(undo.MAX_ENTRIES);
  });

  it("validates operations and respects permissions", () => {
    expect(() => undo.record(c.admin, c.boardId, { label: "x", undo: [{ op: "nope" }], redo: [{ op: "nope" }] })).toThrow(ValidationError);
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "A" });
    undo.record(c.viewer, c.boardId, { label: "v", undo: [{ op: "rename", itemId: it1.id, name: "V" }], redo: [{ op: "rename", itemId: it1.id, name: "A" }] });
    expect(() => undo.undo(c.viewer, c.boardId)).toThrow(ForbiddenError);
    // an undo that would break a permission rule fails and keeps the entry
    undo.record(c.admin, c.boardId, { label: "x", undo: [{ op: "rename", itemId: it1.id, name: "Z" }], redo: [{ op: "rename", itemId: it1.id, name: "A" }] });
    expect(undo.undo(c.admin, c.boardId)).toEqual({ label: "x" });
    expect(undo.undo(c.admin, c.boardId)).toBeNull();
  });
});
