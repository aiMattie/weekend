import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, ValidationError } from "../../src/lib/errors";
import * as columns from "../../src/server/services/columns";
import * as views from "../../src/server/services/views";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

const state = (statusId: string) => ({
  filters: [{ columnId: statusId, op: "any_of", operand: [1] }, { columnId: statusId, op: "is_empty", join: "or" as const }],
  sort: [{ columnId: statusId, dir: "desc" as const }],
  hiddenColumnIds: ["1"],
  groupByColumnId: statusId,
  pinnedColumnIds: [],
});

describe("saved view state", () => {
  it("saves the toolbar state as a shared view and reads it back", () => {
    const status = columns.list(c.admin, c.boardId).find((x) => x.key === "status")!;
    const v = views.createFromState(c.admin, c.boardId, { name: "Klaar", personal: false, state: state(status.id) });
    expect(v.ownerId).toBeNull();
    expect(v.filters).toEqual(state(status.id).filters);
    expect(v.sort).toEqual(state(status.id).sort);
    expect(v.settings).toMatchObject({ hiddenColumnIds: ["1"], groupByColumnId: status.id });
    expect(views.list(c.member, c.boardId).some((x) => x.id === v.id)).toBe(true);
  });

  it("keeps personal views private to their owner", () => {
    const mine = views.createFromState(c.member, c.boardId, { name: "Mijn view", state: state("1") });
    expect(mine.ownerId).toBe(c.member.id);
    expect(views.list(c.member, c.boardId).map((v) => v.id)).toContain(mine.id);
    expect(views.list(c.admin, c.boardId).map((v) => v.id)).not.toContain(mine.id);
  });

  it("saveState updates an existing view; viewers can only keep personal views", () => {
    const mine = views.createFromState(c.viewer, c.boardId, { name: "Viewer view", state: state("1") });
    const saved = views.saveState(c.viewer, mine.id, { ...state("1"), filters: [] });
    expect(saved.filters).toEqual([]);
    expect(() => views.createFromState(c.viewer, c.boardId, { name: "Gedeeld", personal: false, state: state("1") })).toThrow(ForbiddenError);
    const shared = views.createFromState(c.admin, c.boardId, { name: "Gedeeld", personal: false, state: state("1") });
    expect(() => views.saveState(c.viewer, shared.id, state("1"))).toThrow(ForbiddenError);
  });

  it("rejects a malformed state", () => {
    expect(() => views.createFromState(c.admin, c.boardId, { name: "x", state: { filters: [{ op: "x" }] } })).toThrow(ValidationError);
    expect(() => views.createFromState(c.admin, c.boardId, { name: "x", state: { sort: [{ columnId: "1", dir: "sideways" }] } })).toThrow(ValidationError);
  });

  it("shares a personal view with the board", () => {
    const mine = views.createFromState(c.viewer, c.boardId, { name: "Mijn view", state: state("1") });
    expect(() => views.setShared(c.viewer, mine.id, true)).toThrow(ForbiddenError); // viewers cannot share
    const adminMine = views.createFromState(c.admin, c.boardId, { name: "Admin view", state: state("1") });
    expect(views.setShared(c.admin, adminMine.id, true).ownerId).toBeNull();
    expect(views.list(c.member, c.boardId).map((v) => v.id)).toContain(adminMine.id);
  });
});
