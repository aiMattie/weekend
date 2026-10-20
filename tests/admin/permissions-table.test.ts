/**
 * Decision table for `decide()` (src/lib/permissions.ts), the single decision point of can()/assertCan().
 * Part 1: explicit rows (readable spec). Part 2: the full cartesian product checked against invariants.
 */
import { describe, expect, it } from "vitest";
import type { Actor } from "../../src/lib/actor";
import { boardAccess, decide, type Action, type DecideCtx } from "../../src/lib/permissions";
import type { BoardPermissionLevel, ColumnAccess } from "../../src/db/schema/audit-log";

const actor = (role: Actor["role"], extra: Partial<Actor> = {}): Actor => ({ id: "u1", accountId: "a1", role, ...extra });
const openWs = { id: "w1", kind: "open" as const, state: "active" };
const closedWs = { id: "w1", kind: "closed" as const, state: "active" };
const board = (visibility: "public" | "private" | "share" = "public", ownerId: string | null = null) => ({ id: "b1", workspaceId: "w1", visibility, ownerId, state: "active" });
const acc = (mode: ColumnAccess["mode"], userIds: string[] = [], teamIds: string[] = []): ColumnAccess => ({ mode, userIds, teamIds });

interface Row { name: string; role: Actor["role"]; action: Action; ctx: DecideCtx; allowed: boolean; extra?: Partial<Actor> }

const rows: Row[] = [
  // ---- account level
  { name: "admin manages the account", role: "admin", action: "account:manage", ctx: {}, allowed: true },
  { name: "member cannot manage the account", role: "member", action: "account:manage", ctx: {}, allowed: false },
  { name: "member cannot read the audit log", role: "member", action: "account:audit", ctx: {}, allowed: false },
  { name: "custom role grants the audit log", role: "member", action: "account:audit", ctx: { caps: { "account:audit": true } }, allowed: true },
  { name: "custom role with account:manage implies the granular rights", role: "member", action: "account:security", ctx: { caps: { "account:manage": true } }, allowed: true },
  { name: "custom role can deny a single right of an admin base", role: "admin", action: "account:security", ctx: { caps: { "account:security": false } }, allowed: false },
  { name: "admin base role with a custom role keeps the other rights", role: "admin", action: "account:audit", ctx: { caps: { "account:security": false } }, allowed: true },
  { name: "viewer cannot invite", role: "viewer", action: "account:invite", ctx: {}, allowed: false },
  // ---- workspace create
  { name: "member creates workspaces", role: "member", action: "workspace:create", ctx: {}, allowed: true },
  { name: "viewer cannot create workspaces", role: "viewer", action: "workspace:create", ctx: {}, allowed: false },
  { name: "guest cannot create workspaces", role: "guest", action: "workspace:create", ctx: {}, allowed: false },
  { name: "custom role lets a viewer create workspaces", role: "viewer", action: "workspace:create", ctx: { caps: { "workspace:create": true } }, allowed: true },
  { name: "custom role removes workspace creation from a member", role: "member", action: "workspace:create", ctx: { caps: { "workspace:create": false } }, allowed: false },
  // ---- workspace view
  { name: "open workspace visible to non-members", role: "member", action: "workspace:view", ctx: { ws: openWs }, allowed: true },
  { name: "closed workspace hidden from non-members", role: "member", action: "workspace:view", ctx: { ws: closedWs }, allowed: false },
  { name: "closed workspace visible to members", role: "member", action: "workspace:view", ctx: { ws: closedWs, wsRole: "member" }, allowed: true },
  { name: "closed workspace visible to subscribers", role: "member", action: "workspace:view", ctx: { ws: closedWs, wsRole: "viewer" }, allowed: true },
  { name: "guests never see workspaces", role: "guest", action: "workspace:view", ctx: { ws: openWs, wsRole: "member" }, allowed: false },
  { name: "admin sees a closed workspace", role: "admin", action: "workspace:view", ctx: { ws: closedWs }, allowed: true },
  { name: "deleted workspace is invisible", role: "member", action: "workspace:view", ctx: { ws: { ...openWs, state: "deleted" } }, allowed: false },
  // ---- workspace create board
  { name: "member creates boards in an open workspace", role: "member", action: "workspace:create_board", ctx: { ws: openWs }, allowed: true },
  { name: "subscriber cannot create boards", role: "member", action: "workspace:create_board", ctx: { ws: openWs, wsRole: "viewer" }, allowed: false },
  { name: "viewer account role cannot create boards", role: "viewer", action: "workspace:create_board", ctx: { ws: openWs }, allowed: false },
  { name: "owners-only workspace blocks plain members", role: "member", action: "workspace:create_board", ctx: { ws: openWs, wsRole: "member", wsCreateBoards: "owners" }, allowed: false },
  { name: "owners-only workspace allows owners", role: "member", action: "workspace:create_board", ctx: { ws: openWs, wsRole: "owner", wsCreateBoards: "owners" }, allowed: true },
  { name: "custom role can deny board creation", role: "member", action: "workspace:create_board", ctx: { ws: openWs, caps: { "workspace:create_board": false } }, allowed: false },
  // ---- workspace manage
  { name: "workspace owner updates the workspace", role: "member", action: "workspace:update", ctx: { ws: openWs, wsRole: "owner" }, allowed: true },
  { name: "workspace member cannot update", role: "member", action: "workspace:update", ctx: { ws: openWs, wsRole: "member" }, allowed: false },
  { name: "workspace owner deletes", role: "member", action: "workspace:delete", ctx: { ws: openWs, wsRole: "owner" }, allowed: true },
  { name: "workspace owner manages members", role: "member", action: "workspace:manage_members", ctx: { ws: openWs, wsRole: "owner" }, allowed: true },
  // ---- board view
  { name: "member views a public board in an open workspace", role: "member", action: "board:view", ctx: { ws: openWs, board: board() }, allowed: true },
  { name: "member cannot view a public board in a closed workspace", role: "member", action: "board:view", ctx: { ws: closedWs, board: board() }, allowed: false },
  { name: "board member views a board in a closed workspace", role: "member", action: "board:view", ctx: { ws: closedWs, board: board(), boardRole: "viewer" }, allowed: true },
  { name: "private board needs membership", role: "member", action: "board:view", ctx: { ws: openWs, board: board("private") }, allowed: false },
  { name: "private board member views", role: "member", action: "board:view", ctx: { ws: openWs, board: board("private"), boardRole: "editor" }, allowed: true },
  { name: "private board owner views", role: "member", action: "board:view", ctx: { ws: openWs, board: board("private", "u1") }, allowed: true },
  { name: "workspace owner does not see private boards", role: "member", action: "board:view", ctx: { ws: openWs, board: board("private"), wsRole: "owner" }, allowed: false },
  { name: "guest without membership sees nothing", role: "guest", action: "board:view", ctx: { ws: openWs, board: board("share") }, allowed: false },
  { name: "guest board member sees a shared board", role: "guest", action: "board:view", ctx: { ws: openWs, board: board("share"), boardRole: "viewer" }, allowed: true },
  { name: "guest board member sees a public board (legacy membership)", role: "guest", action: "board:view", ctx: { ws: openWs, board: board("public"), boardRole: "editor" }, allowed: true },
  { name: "guest never sees a private board", role: "guest", action: "board:view", ctx: { ws: openWs, board: board("private"), boardRole: "editor" }, allowed: false },
  { name: "workspace grant shows shared boards to a guest", role: "guest", action: "board:view", ctx: { ws: openWs, board: board("share"), guestGrantRole: "viewer" }, allowed: true },
  { name: "workspace grant does not show non-shared boards", role: "guest", action: "board:view", ctx: { ws: openWs, board: board("public"), guestGrantRole: "viewer" }, allowed: false },
  { name: "deleted board is invisible", role: "member", action: "board:view", ctx: { ws: openWs, board: { ...board(), state: "deleted" } }, allowed: false },
  { name: "unknown board is invisible", role: "member", action: "board:view", ctx: { ws: openWs, board: null }, allowed: false },
  // ---- board levels (member without board role)
  ...(["edit_all", "edit_content", "edit_assigned", "view_only"] as BoardPermissionLevel[]).flatMap((level): Row[] => {
    const ctx: DecideCtx = { ws: openWs, board: board(), boardLevel: level };
    const edit = level === "edit_all" || level === "edit_content";
    return [
      { name: `${level}: edit items without item`, role: "member", action: "board:edit_items", ctx, allowed: edit },
      { name: `${level}: edit an assigned item`, role: "member", action: "board:edit_items", ctx: { ...ctx, hasItem: true, itemAssigned: true }, allowed: edit || level === "edit_assigned" },
      { name: `${level}: edit an item that is not assigned`, role: "member", action: "board:edit_items", ctx: { ...ctx, hasItem: true, itemAssigned: false }, allowed: edit },
      { name: `${level}: comment`, role: "member", action: "board:comment", ctx, allowed: level !== "view_only" },
      { name: `${level}: edit structure`, role: "member", action: "board:edit_structure", ctx, allowed: level === "edit_all" },
      { name: `${level}: delete the board`, role: "member", action: "board:delete", ctx, allowed: false },
      { name: `${level}: the board owner can still do everything`, role: "member", action: "board:edit_structure", ctx: { ...ctx, boardRole: "owner" }, allowed: true },
    ];
  }),
  { name: "board viewer role is view only", role: "member", action: "board:edit_items", ctx: { ws: openWs, board: board(), boardRole: "viewer" }, allowed: false },
  { name: "board viewer role cannot comment", role: "member", action: "board:comment", ctx: { ws: openWs, board: board(), boardRole: "viewer" }, allowed: false },
  { name: "subscriber of the workspace is read only on public boards", role: "member", action: "board:edit_items", ctx: { ws: openWs, board: board(), wsRole: "viewer" }, allowed: false },
  { name: "viewer account role is read only even as board owner", role: "viewer", action: "board:edit_items", ctx: { ws: openWs, board: board("public", "u1"), boardRole: "owner" }, allowed: false },
  { name: "viewer account role can still view", role: "viewer", action: "board:view", ctx: { ws: openWs, board: board() }, allowed: true },
  { name: "board owner (ownerId) deletes the board", role: "member", action: "board:delete", ctx: { ws: openWs, board: board("public", "u1") }, allowed: true },
  { name: "board owner role manages members", role: "member", action: "board:manage_members", ctx: { ws: openWs, board: board(), boardRole: "owner" }, allowed: true },
  { name: "workspace owner owns the boards of the workspace", role: "member", action: "board:delete", ctx: { ws: openWs, board: board(), wsRole: "owner" }, allowed: true },
  { name: "plain editor cannot manage members", role: "member", action: "board:manage_members", ctx: { ws: openWs, board: board(), boardRole: "editor" }, allowed: false },
  { name: "custom role lets a member delete boards they can edit", role: "member", action: "board:delete", ctx: { ws: openWs, board: board(), caps: { "board:delete": true } }, allowed: true },
  { name: "custom role cannot delete on a view only board", role: "member", action: "board:delete", ctx: { ws: openWs, board: board(), boardLevel: "view_only", caps: { "board:delete": true } }, allowed: false },
  { name: "custom role denies structure edits for an owner", role: "member", action: "board:edit_structure", ctx: { ws: openWs, board: board("public", "u1"), caps: { "board:edit_structure": false } }, allowed: false },
  // ---- guests
  { name: "editor guest edits items", role: "guest", action: "board:edit_items", ctx: { ws: openWs, board: board("share"), boardRole: "editor" }, allowed: true },
  { name: "editor guest comments", role: "guest", action: "board:comment", ctx: { ws: openWs, board: board("share"), boardRole: "editor" }, allowed: true },
  { name: "editor guest never edits structure", role: "guest", action: "board:edit_structure", ctx: { ws: openWs, board: board("share"), boardRole: "editor" }, allowed: false },
  { name: "viewer guest cannot edit", role: "guest", action: "board:edit_items", ctx: { ws: openWs, board: board("share"), boardRole: "viewer" }, allowed: false },
  { name: "guest on an edit_assigned board needs the assignment", role: "guest", action: "board:edit_items", ctx: { ws: openWs, board: board("share"), boardRole: "editor", boardLevel: "edit_assigned", hasItem: true, itemAssigned: false }, allowed: false },
  { name: "guest granted a workspace edits shared boards", role: "guest", action: "board:edit_items", ctx: { ws: openWs, board: board("share"), guestGrantRole: "editor" }, allowed: true },
  { name: "guest cannot delete or manage even when listed as owner", role: "guest", action: "board:delete", ctx: { ws: openWs, board: board("share"), boardRole: "owner" }, allowed: false },
  // ---- column rights
  { name: "column view: everyone by default", role: "member", action: "column:view", ctx: { ws: openWs, board: board() }, allowed: true },
  { name: "column view: owners only hides it from members", role: "member", action: "column:view", ctx: { ws: openWs, board: board(), column: { edit: acc("everyone"), view: acc("owners") } }, allowed: false },
  { name: "column view: owners only shows it to board owners", role: "member", action: "column:view", ctx: { ws: openWs, board: board(), boardRole: "owner", column: { edit: acc("everyone"), view: acc("owners") } }, allowed: true },
  { name: "column view: specific person", role: "member", action: "column:view", ctx: { ws: openWs, board: board(), column: { edit: acc("everyone"), view: acc("specific", ["u1"]) } }, allowed: true },
  { name: "column view: specific team", role: "member", action: "column:view", ctx: { ws: openWs, board: board(), teamIds: ["t1"], column: { edit: acc("everyone"), view: acc("specific", [], ["t1"]) } }, allowed: true },
  { name: "column view: other person", role: "member", action: "column:view", ctx: { ws: openWs, board: board(), column: { edit: acc("everyone"), view: acc("specific", ["u2"]) } }, allowed: false },
  { name: "column view: admin always", role: "admin", action: "column:view", ctx: { ws: openWs, board: board(), column: { edit: acc("everyone"), view: acc("owners") } }, allowed: true },
  { name: "column edit: everyone", role: "member", action: "column:edit", ctx: { ws: openWs, board: board() }, allowed: true },
  { name: "column edit: owners only blocks members", role: "member", action: "column:edit", ctx: { ws: openWs, board: board(), column: { edit: acc("owners"), view: acc("everyone") } }, allowed: false },
  { name: "column edit: owners only allows owners", role: "member", action: "column:edit", ctx: { ws: openWs, board: board("public", "u1"), column: { edit: acc("owners"), view: acc("everyone") } }, allowed: true },
  { name: "column edit: specific people", role: "member", action: "column:edit", ctx: { ws: openWs, board: board(), column: { edit: acc("specific", ["u1"]), view: acc("everyone") } }, allowed: true },
  { name: "column edit: assigned needs the assignment", role: "member", action: "column:edit", ctx: { ws: openWs, board: board(), hasItem: true, itemAssigned: false, column: { edit: acc("assigned"), view: acc("everyone") } }, allowed: false },
  { name: "column edit: assigned allows the assignee", role: "member", action: "column:edit", ctx: { ws: openWs, board: board(), hasItem: true, itemAssigned: true, column: { edit: acc("assigned"), view: acc("everyone") } }, allowed: true },
  { name: "column edit: assigned without item fails closed", role: "member", action: "column:edit", ctx: { ws: openWs, board: board(), column: { edit: acc("assigned"), view: acc("everyone") } }, allowed: false },
  { name: "column edit: view only board blocks everything", role: "member", action: "column:edit", ctx: { ws: openWs, board: board(), boardLevel: "view_only" }, allowed: false },
  { name: "system actor bypasses", role: "member", action: "board:delete", ctx: { ws: closedWs, board: board("private") }, allowed: true, extra: { isSystem: true } },
];

describe("permission decision table (explicit rows)", () => {
  it.each(rows)("$name", ({ role, action, ctx, allowed, extra }) => {
    expect(decide(actor(role, extra), action, ctx)).toBe(allowed);
  });
  it("has a healthy number of rows", () => expect(rows.length).toBeGreaterThan(100));
});

describe("permission decision table (cartesian product invariants)", () => {
  const roles: Actor["role"][] = ["admin", "member", "viewer", "guest"];
  const wsKinds = [openWs, closedWs];
  const wsRoles = [null, "owner", "member", "viewer"] as const;
  const visibilities = ["public", "private", "share"] as const;
  const boardRoles = [null, "owner", "editor", "viewer"] as const;
  const levels: BoardPermissionLevel[] = ["edit_all", "edit_content", "edit_assigned", "view_only"];
  const grants = [null, "viewer", "editor"] as const;
  const actions: Action[] = ["board:view", "board:comment", "board:edit_items", "board:edit_structure", "board:delete", "board:manage_members", "column:view", "column:edit"];
  let combos = 0;

  it("holds for every combination", () => {
    for (const role of roles) for (const ws of wsKinds) for (const wsRole of wsRoles) for (const vis of visibilities)
      for (const boardRole of boardRoles) for (const level of levels) for (const grant of grants) for (const assigned of [false, true]) {
        const a = actor(role);
        const ctx: DecideCtx = { ws, wsRole, board: board(vis), boardRole, boardLevel: level, guestGrantRole: grant, hasItem: true, itemAssigned: assigned };
        const d = (act: Action) => decide(a, act, ctx);
        const access = boardAccess(a, ctx);
        combos++;
        // admins can do everything
        if (role === "admin") { for (const act of actions) expect(d(act)).toBe(true); continue; }
        // nothing is allowed without view access
        if (!access.canView) { for (const act of actions) expect(d(act), `${role} ${vis} ${wsRole} ${boardRole}`).toBe(false); continue; }
        expect(d("board:view")).toBe(true);
        // read only means read only
        if (access.level === "view_only") for (const act of ["board:comment", "board:edit_items", "board:edit_structure", "board:delete", "column:edit"] as Action[]) expect(d(act)).toBe(false);
        // edit_assigned only edits assigned items
        if (access.level === "edit_assigned" && !access.isOwner) expect(d("board:edit_items")).toBe(assigned);
        // guests and viewers never change structure, delete or manage
        if (role === "guest" || role === "viewer") for (const act of ["board:edit_structure", "board:delete", "board:manage_members"] as Action[]) expect(d(act)).toBe(false);
        // guests never see private boards or boards outside the share list without membership
        if (role === "guest") {
          expect(vis !== "private").toBe(true);
          expect(boardRole !== null || (vis === "share" && grant !== null)).toBe(true);
        }
        // viewer account role is read only
        if (role === "viewer") expect(d("board:edit_items")).toBe(false);
        // editing implies commenting
        if (d("board:edit_items")) expect(d("board:comment")).toBe(true);
        // structure edits imply item edits being possible at the board level
        if (d("board:edit_structure")) expect(["edit_all", "edit_content", "edit_assigned"].includes(access.level) || access.isOwner).toBe(true);
      }
    expect(combos).toBe(4 * 2 * 4 * 3 * 4 * 4 * 3 * 2);
  });

  it("system actors can always do everything", () => {
    for (const act of actions) expect(decide({ id: "system", accountId: "a1", role: "admin", isSystem: true }, act, {})).toBe(true);
  });
});
