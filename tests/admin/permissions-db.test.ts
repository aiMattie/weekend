import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/client";
import { users } from "../../src/db/schema/core";
import { assertCan, boardLevelFor, can, hiddenColumnIds } from "../../src/lib/permissions";
import * as boards from "../../src/server/services/boards";
import * as columns from "../../src/server/services/columns";
import * as guests from "../../src/server/services/guests";
import * as items from "../../src/server/services/items";
import * as members from "../../src/server/services/members";
import * as permissions from "../../src/server/services/permissions";
import * as teams from "../../src/server/services/teams";
import * as workspaces from "../../src/server/services/workspaces";
import * as audit from "../../src/server/services/audit";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
// the helper only overrides the guest role on the actor: make Coordinator a real guest in the database too
beforeEach(async () => { c = await freshCtx(); db.update(users).set({ role: "guest" }).where(eq(users.id, c.guest.id)).run(); });

describe("can() against the database", () => {
  it("board level edit_assigned: only assigned items (also through a team), never create", () => {
    const people = columns.list(c.admin, c.boardId).find((x) => x.type === "people") ?? columns.create(c.admin, c.boardId, { title: "Wie", type: "people" });
    const mine = items.create(c.admin, { boardId: c.boardId, name: "Van Builder", values: { [people.id]: { personsAndTeams: [{ id: c.member.id, kind: "person" }] } } });
    const other = items.create(c.admin, { boardId: c.boardId, name: "Van iemand anders" });
    permissions.setBoard(c.admin, c.boardId, { level: "edit_assigned" });
    expect(can(c.member, "board:edit_items", { boardId: c.boardId, itemId: mine.id })).toBe(true);
    expect(can(c.member, "board:edit_items", { boardId: c.boardId, itemId: other.id })).toBe(false);
    expect(can(c.member, "board:edit_items", { boardId: c.boardId })).toBe(false);
    expect(can(c.member, "board:comment", { boardId: c.boardId })).toBe(true);
    expect(can(c.member, "board:edit_structure", { boardId: c.boardId })).toBe(false);
    // via a team
    const team = teams.create(c.admin, { name: "Taakteam", memberIds: [c.member.id] });
    items.changeColumnValue(c.admin, other.id, people.id, { personsAndTeams: [{ id: team.id, kind: "team" }] });
    expect(can(c.member, "board:edit_items", { boardId: c.boardId, itemId: other.id })).toBe(true);
    // the admin sees the effective level
    expect(boardLevelFor(c.member, c.boardId)).toEqual({ level: "edit_assigned", isOwner: false });
    expect(boardLevelFor(c.admin, c.boardId)).toEqual({ level: "edit_all", isOwner: true });
  });

  it("board levels edit_content / view_only and owners", () => {
    permissions.setBoard(c.admin, c.boardId, { level: "edit_content" });
    expect(can(c.member, "board:edit_items", { boardId: c.boardId })).toBe(true);
    expect(can(c.member, "board:edit_structure", { boardId: c.boardId })).toBe(false);
    expect(() => columns.create(c.member, c.boardId, { title: "X", type: "text" })).toThrow(/Not allowed/);
    permissions.setBoard(c.admin, c.boardId, { level: "view_only" });
    expect(() => items.create(c.member, { boardId: c.boardId, name: "Nope" })).toThrow(/Not allowed/);
    permissions.setBoardMember(c.admin, c.boardId, c.member.id, "owner");
    expect(can(c.member, "board:edit_structure", { boardId: c.boardId })).toBe(true);
    expect(can(c.member, "board:manage_members", { boardId: c.boardId })).toBe(true);
    expect(audit.list(c.admin, { event: "permission.board_changed" }).rows).toHaveLength(2);
  });

  it("only owners and admins change board permissions", () => {
    expect(() => permissions.setBoard(c.member, c.boardId, { level: "view_only" })).toThrow(/Not allowed/);
    expect(() => permissions.setColumnPermission(c.member, "1", { edit: { mode: "owners" } })).toThrow();
  });

  it("private boards cannot be shared with guests; public ones become shareable", () => {
    const priv = boards.create(c.admin, { workspaceId: c.workspaceId, name: "Prive", visibility: "private" });
    expect(() => permissions.setBoardMember(c.admin, priv.id, c.guest.id, "viewer")).toThrow(/shared with guests/);
    permissions.setBoardMember(c.admin, c.boardId, c.guest.id, "viewer");
    expect(boards.get(c.admin, c.boardId).visibility).toBe("share");
    expect(can(c.guest, "board:view", { boardId: c.boardId })).toBe(true);
    expect(() => permissions.setBoard(c.admin, c.boardId, { visibility: "private" })).toThrow(/guests first/);
  });

  it("workspace: closed, owners-only board creation, members", () => {
    const ws = workspaces.create(c.admin, { name: "Team ruimte" });
    permissions.setWorkspaceMember(c.admin, ws.id, c.member.id, "member");
    expect(can(c.member, "workspace:create_board", { workspaceId: ws.id })).toBe(true);
    permissions.setWorkspace(c.admin, ws.id, { createBoards: "owners", kind: "closed" });
    expect(can(c.member, "workspace:create_board", { workspaceId: ws.id })).toBe(false);
    expect(() => boards.create(c.member, { workspaceId: ws.id, name: "Mag niet" })).toThrow(/Not allowed/);
    expect(can(c.viewer, "workspace:view", { workspaceId: ws.id })).toBe(false);
    permissions.setWorkspaceMember(c.admin, ws.id, c.viewer.id, "viewer");
    expect(can(c.viewer, "workspace:view", { workspaceId: ws.id })).toBe(true);
    expect(() => permissions.setWorkspaceMember(c.admin, ws.id, c.guest.id, "member")).toThrow(/Guests/);
    expect(permissions.getWorkspace(c.admin, ws.id)).toMatchObject({ kind: "closed", createBoards: "owners" });
  });

  it("column permissions: hide / read-only per person, owners and assignment", () => {
    const col = columns.create(c.admin, c.boardId, { title: "Tarief", type: "numbers" });
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Rij" });
    expect(can(c.member, "column:edit", { boardId: c.boardId, columnId: col.id, itemId: it1.id })).toBe(true);
    permissions.setColumnPermission(c.admin, col.id, { edit: { mode: "specific", userIds: [c.userIds.pm1], teamIds: [] }, view: { mode: "specific", userIds: [c.userIds.pm1], teamIds: [] } });
    expect(can(c.member, "column:edit", { boardId: c.boardId, columnId: col.id, itemId: it1.id })).toBe(false);
    expect(can(c.member, "column:view", { boardId: c.boardId, columnId: col.id })).toBe(false);
    expect([...hiddenColumnIds(c.member, c.boardId)]).toEqual([col.id]);
    expect([...hiddenColumnIds(c.admin, c.boardId)]).toEqual([]);
    const pm1 = { id: c.userIds.pm1, accountId: c.accountId, role: "member" as const };
    expect(can(pm1, "column:edit", { boardId: c.boardId, columnId: col.id, itemId: it1.id })).toBe(true);
    expect(hiddenColumnIds(pm1, c.boardId).size).toBe(0);
    expect(() => assertCan(c.member, "column:edit", { boardId: c.boardId, columnId: col.id })).toThrow(/Not allowed/);
    expect(permissions.listColumnPermissions(c.admin, c.boardId).find((x) => x.columnId === col.id)?.edit.mode).toBe("specific");
    permissions.setColumnPermission(c.admin, col.id, { edit: { mode: "everyone" }, view: { mode: "everyone" } });
    expect(can(c.member, "column:edit", { boardId: c.boardId, columnId: col.id, itemId: it1.id })).toBe(true);
    expect(() => permissions.setColumnPermission(c.admin, col.id, { view: { mode: "assigned" } })).toThrow(/hidden/);
    expect(audit.list(c.admin, { event: "permission.column_changed" }).rows.length).toBe(3 - 1);
  });
});

describe("guests", () => {
  it("workspace grant shows shared boards only; board access, views and removal", async () => {
    const shared = boards.create(c.admin, { workspaceId: c.workspaceId, name: "Gedeeld", visibility: "share" });
    const inv = guests.inviteGuest(c.admin, { email: "klant@extern.nl", name: "Klant", workspaceId: c.workspaceId, role: "viewer" });
    const r = await members.acceptInvitation(inv.link.split("/").pop()!, { password: "Geheim-12345" });
    const g = { id: r.user.id, accountId: r.user.accountId, role: r.user.role };
    expect(can(g, "board:view", { boardId: shared.id })).toBe(true);
    expect(can(g, "board:view", { boardId: c.boardId })).toBe(false); // not shared with guests
    expect(can(g, "board:edit_items", { boardId: shared.id })).toBe(false);
    expect(boards.list(g).map((b) => b.name)).toEqual(["Gedeeld"]);
    guests.setAccess(c.admin, g.id, { boardIds: [c.boardId], workspaceIds: [], role: "editor" });
    expect(can(g, "board:view", { boardId: shared.id })).toBe(false);
    expect(can(g, "board:edit_items", { boardId: c.boardId })).toBe(true);
    const ov = guests.overview(c.admin);
    expect(ov.guests.map((x) => x.id)).toEqual(expect.arrayContaining([g.id, c.guest.id]));
    expect(ov.guests.find((x) => x.id === g.id)!.boards.map((b) => b.id)).toEqual([c.boardId]);
    expect(() => guests.inviteGuest(c.admin, { email: "x@y.nl", boardIds: [] })).toThrow(/at least one/);
    guests.updateSettings(c.admin, { enabled: false });
    expect(() => guests.inviteGuest(c.admin, { email: "x@y.nl", boardIds: [c.boardId] })).toThrow(/disabled/);
    guests.removeGuest(c.admin, g.id);
    const removed = guests.overview(c.admin).guests.find((x) => x.id === g.id)!;
    expect(removed.isActive).toBe(false);
    expect(removed.boards).toHaveLength(0);
    expect(() => guests.overview(c.member)).toThrow(/Not allowed/);
  });
});

describe("teams", () => {
  it("creates teams, members and owners; owners manage their own team; @team mention expands", () => {
    const t = teams.create(c.admin, { name: "Support", memberIds: [c.member.id, c.viewer.id], ownerIds: [c.member.id] });
    expect(t.members).toHaveLength(2);
    expect(t.ownerIds).toEqual([c.member.id]);
    expect(teams.list(c.member).find((x) => x.id === t.id)?.canManage).toBe(true);
    expect(teams.list(c.viewer).find((x) => x.id === t.id)?.canManage).toBe(false);
    teams.setMembers(c.member, t.id, [c.member.id, c.userIds.pm1]);
    expect(teams.get(c.admin, t.id).memberIds.sort()).toEqual([c.member.id, c.userIds.pm1].sort());
    expect(teams.get(c.admin, t.id).ownerIds).toEqual([c.member.id]);
    expect(() => teams.setMembers(c.viewer, t.id, [])).toThrow(/team owners/);
    expect(() => teams.create(c.member, { name: "Nope" })).toThrow(/Not allowed/);
    expect(teams.expandMention(c.admin, t.id).sort()).toEqual([c.member.id, c.userIds.pm1].sort());
    expect(teams.mentionables(c.member).teams.find((x) => x.id === t.id)?.memberCount).toBe(2);
    teams.setOwner(c.admin, t.id, c.userIds.pm1, true);
    expect(teams.get(c.admin, t.id).ownerIds).toHaveLength(2);
    teams.rename(c.member, t.id, "Support NL");
    teams.remove(c.admin, t.id);
    expect(teams.list(c.admin).find((x) => x.id === t.id)).toBeUndefined();
  });
});
