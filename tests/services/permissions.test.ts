import { beforeEach, describe, expect, it } from "vitest";
import { can } from "../../src/lib/permissions";
import * as boards from "../../src/server/services/boards";
import * as workspaces from "../../src/server/services/workspaces";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

describe("can()", () => {
  it("admins and system can do anything; anonymous nothing", () => {
    expect(can(c.admin, "account:manage")).toBe(true);
    expect(can(c.sys, "board:delete", { boardId: c.boardId })).toBe(true);
    expect(can(null, "board:view", { boardId: c.boardId })).toBe(false);
  });

  it("members see open workspaces and public boards, edit items and structure, but cannot delete", () => {
    expect(can(c.member, "workspace:view", { workspaceId: c.workspaceId })).toBe(true);
    expect(can(c.member, "board:edit_items", { boardId: c.boardId })).toBe(true);
    expect(can(c.member, "board:edit_structure", { boardId: c.boardId })).toBe(true);
    expect(can(c.member, "board:delete", { boardId: c.boardId })).toBe(false);
    expect(can(c.member, "account:manage")).toBe(false);
  });

  it("private boards need a membership", () => {
    const priv = boards.create(c.admin, { workspaceId: c.workspaceId, name: "Secret", visibility: "private" });
    expect(can(c.member, "board:view", { boardId: priv.id })).toBe(false);
    expect(boards.list(c.member).some((b) => b.id === priv.id)).toBe(false);
    boards.setMember(c.admin, priv.id, c.member.id, "viewer");
    expect(can(c.member, "board:view", { boardId: priv.id })).toBe(true);
    expect(can(c.member, "board:edit_items", { boardId: priv.id })).toBe(false);
  });

  it("closed workspaces are hidden from non-members", () => {
    const ws = workspaces.create(c.admin, { name: "Closed", kind: "closed" });
    expect(can(c.member, "workspace:view", { workspaceId: ws.id })).toBe(false);
    workspaces.setMember(c.admin, ws.id, c.member.id, "member");
    expect(can(c.member, "workspace:view", { workspaceId: ws.id })).toBe(true);
    expect(can(c.member, "workspace:update", { workspaceId: ws.id })).toBe(false);
  });

  it("viewers and guests are read-only / board-scoped", () => {
    expect(can(c.viewer, "board:view", { boardId: c.boardId })).toBe(true);
    expect(can(c.viewer, "board:edit_items", { boardId: c.boardId })).toBe(false);
    expect(can(c.viewer, "workspace:create_board", { workspaceId: c.workspaceId })).toBe(false);
    expect(can(c.guest, "board:view", { boardId: c.boardId })).toBe(false);
    expect(can(c.guest, "workspace:view", { workspaceId: c.workspaceId })).toBe(false);
  });
});
