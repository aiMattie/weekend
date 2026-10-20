import { beforeEach, describe, expect, it } from "vitest";
import * as groups from "../../src/server/services/groups";
import * as items from "../../src/server/services/items";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

const inGroup = (gid: string) => items.list(c.admin, { boardId: c.boardId, groupId: gid }).map((i) => i.name);

describe("ordering (drag and drop backing)", () => {
  it("moves rows within a group and across groups with before/after/top specs", () => {
    const g1 = groups.list(c.admin, c.boardId)[0];
    const g2 = groups.create(c.admin, c.boardId, { title: "G2" });
    const [a, b, d] = ["A", "B", "C"].map((n) => items.create(c.admin, { boardId: c.boardId, name: n, groupId: g1.id }));
    const x = items.create(c.admin, { boardId: c.boardId, name: "X", groupId: g2.id });
    items.move(c.admin, d.id, { beforeId: a.id });
    expect(inGroup(g1.id)).toEqual(["C", "A", "B"]);
    items.move(c.admin, a.id, { groupId: g2.id, afterId: x.id });
    expect(inGroup(g2.id)).toEqual(["X", "A"]);
    items.move(c.admin, b.id, { groupId: g2.id, top: true });
    expect(inGroup(g2.id)).toEqual(["B", "X", "A"]);
    expect(inGroup(g1.id)).toEqual(["C"]);
    items.move(c.admin, d.id, { groupId: g2.id, beforeId: x.id });
    expect(inGroup(g2.id)).toEqual(["B", "C", "X", "A"]);
  });

  it("moves a row to an absolute position (undo) and many moves keep a strict order", () => {
    const g1 = groups.list(c.admin, c.boardId)[0];
    const rows = Array.from({ length: 6 }, (_, i) => items.create(c.admin, { boardId: c.boardId, name: `R${i}`, groupId: g1.id }));
    const original = rows[3].position;
    for (let i = 0; i < 30; i++) items.move(c.admin, rows[3].id, { beforeId: rows[0].id });
    items.move(c.admin, rows[3].id, { groupId: g1.id, position: original });
    expect(inGroup(g1.id)).toEqual(["R0", "R1", "R2", "R3", "R4", "R5"]);
    const positions = items.list(c.admin, { boardId: c.boardId }).map((i) => i.position);
    expect([...positions].sort((p, q) => p - q)).toEqual(positions);
  });

  it("reorders groups and subitems", () => {
    const g1 = groups.list(c.admin, c.boardId)[0];
    const g2 = groups.create(c.admin, c.boardId, { title: "G2" });
    const g3 = groups.create(c.admin, c.boardId, { title: "G3" });
    groups.move(c.admin, g3.id, { top: true });
    groups.move(c.admin, g1.id, { afterId: g2.id });
    expect(groups.list(c.admin, c.boardId).map((g) => g.title)).toEqual(["G3", "G2", "Group Title"]);
    const p = items.create(c.admin, { boardId: c.boardId, name: "P", groupId: g1.id });
    const s1 = items.create(c.admin, { boardId: c.boardId, name: "S1", parentItemId: p.id });
    items.create(c.admin, { boardId: c.boardId, name: "S2", parentItemId: p.id });
    items.move(c.admin, s1.id, { afterId: items.listSubitems(c.admin, p.id)[1].id });
    expect(items.listSubitems(c.admin, p.id).map((s) => s.name)).toEqual(["S2", "S1"]);
  });
});
