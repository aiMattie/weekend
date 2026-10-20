/**
 * Permission model. Services call `can()` / `assertCan()` before touching data; `decide()` is the
 * single (pure) decision point and is covered by the decision table test (tests/permissions-table.test.ts).
 *
 * Layers (monday.com):
 *  1. account role: admin | member | viewer | guest, plus an optional custom account role whose
 *     capability matrix (`ctx.caps`) can deny (false) or grant (true) single actions.
 *  2. workspace: open | closed; roles owner | member | viewer ("subscriber"); setting "who can create boards".
 *  3. board: visibility public | private | share; board owners; per-board level for non-owners:
 *     edit_all > edit_content > edit_assigned > view_only; board member role viewer = view_only.
 *  4. column: per column who can view / edit (everyone | owners | specific | assigned).
 *  5. item: level edit_assigned only lets people edit items they are assigned to (pass `itemId`).
 *
 * Rules of thumb:
 *  - system actors and account admins can do everything (unless a custom role explicitly denies an action).
 *  - guest: only boards shared with guests (visibility "share") where they are a board member or the
 *    workspace was granted to them; never structure changes.
 *  - without `itemId`, "edit_items" on an edit_assigned board is denied (fail closed): pass the item.
 *
 * Actions: "<resource>:<verb>". Resource ids go in `res`.
 */
import type { Actor } from "./actor";
import { ForbiddenError } from "./errors";
import type { BoardPermissionLevel, ColumnAccess } from "../db/schema/audit-log";
import { agentAllows } from "./agent-permissions";
import { loadCtx, loadListContext, type DecideCtx, type ResourceIds, type WsRow, type BoardRow } from "./permissions-data";

export type { DecideCtx } from "./permissions-data";

export type Action =
  | "account:manage" // everything in the admin center
  | "account:invite" // invite and manage users
  | "account:teams"
  | "account:guests"
  | "account:audit" // read the audit log
  | "account:security"
  | "account:export" // export boards / account data
  | "workspace:create"
  | "workspace:view"
  | "workspace:update"
  | "workspace:delete"
  | "workspace:manage_members"
  | "workspace:create_board" // boards and folders in a workspace
  | "board:view"
  | "board:comment" // updates, replies, likes
  | "board:edit_items" // create/update/move/delete items, values (pass itemId for "assigned only" boards)
  | "board:edit_structure" // groups, columns, views, board settings
  | "board:delete"
  | "board:manage_members"
  | "column:view" // needs columnId (+ boardId)
  | "column:edit"; // needs columnId (+ boardId), optionally itemId

export type Resource = ResourceIds;

/** Capability matrix rows for custom account roles (Admin > Roles). `deny` = can only be switched off. */
export const CAPABILITIES: { key: Action; group: "account" | "content"; labelKey: string }[] = [
  { key: "account:manage", group: "account", labelKey: "admin.cap.account:manage" },
  { key: "account:invite", group: "account", labelKey: "admin.cap.account:invite" },
  { key: "account:teams", group: "account", labelKey: "admin.cap.account:teams" },
  { key: "account:guests", group: "account", labelKey: "admin.cap.account:guests" },
  { key: "account:audit", group: "account", labelKey: "admin.cap.account:audit" },
  { key: "account:security", group: "account", labelKey: "admin.cap.account:security" },
  { key: "account:export", group: "account", labelKey: "admin.cap.account:export" },
  { key: "workspace:create", group: "content", labelKey: "admin.cap.workspace:create" },
  { key: "workspace:create_board", group: "content", labelKey: "admin.cap.workspace:create_board" },
  { key: "board:edit_items", group: "content", labelKey: "admin.cap.board:edit_items" },
  { key: "board:edit_structure", group: "content", labelKey: "admin.cap.board:edit_structure" },
  { key: "board:comment", group: "content", labelKey: "admin.cap.board:comment" },
  { key: "board:delete", group: "content", labelKey: "admin.cap.board:delete" },
];

export const BOARD_LEVELS: BoardPermissionLevel[] = ["edit_all", "edit_content", "edit_assigned", "view_only"];
const RANK: Record<BoardPermissionLevel, number> = { view_only: 0, edit_assigned: 1, edit_content: 2, edit_all: 3 };
const minLevel = (a: BoardPermissionLevel, b: BoardPermissionLevel): BoardPermissionLevel => (RANK[a] <= RANK[b] ? a : b);

function columnAccess(a: ColumnAccess | undefined, ctx: DecideCtx, actor: Actor, isOwner: boolean): boolean {
  if (!a || a.mode === "everyone") return true;
  if (isOwner) return true;
  switch (a.mode) {
    case "owners": return false;
    case "specific": return a.userIds.includes(actor.id) || a.teamIds.some((t) => (ctx.teamIds ?? []).includes(t));
    case "assigned": return !!ctx.hasItem && !!ctx.itemAssigned;
    default: return false;
  }
}

/** Effective access of an actor on one board (UI badge, tests). Pure. */
export function boardAccess(actor: Actor, ctx: DecideCtx): { canView: boolean; isOwner: boolean; level: BoardPermissionLevel } {
  const { board, ws, wsRole = null, boardRole = null } = ctx;
  const none = { canView: false, isOwner: false, level: "view_only" as BoardPermissionLevel };
  if (!board || board.state === "deleted") return none;
  const isGuest = actor.role === "guest";
  const isViewer = actor.role === "viewer";
  const memberRole = boardRole ?? (isGuest ? ctx.guestGrantRole ?? null : null);
  const isOwner = board.ownerId === actor.id || boardRole === "owner" || wsRole === "owner";
  let canView: boolean;
  // explicit board membership works on any non-private board; a workspace grant only on boards shared with guests
  if (isGuest) canView = board.visibility !== "private" && (boardRole !== null || (board.visibility === "share" && memberRole !== null));
  else if (board.visibility === "private") canView = boardRole !== null || board.ownerId === actor.id;
  else canView = !!ws && ws.state !== "deleted" && (ws.kind === "open" || wsRole !== null || boardRole !== null);
  if (!canView) return none;
  let level: BoardPermissionLevel;
  if (isViewer) level = "view_only";
  else if (isOwner && !isGuest) level = "edit_all";
  else {
    level = ctx.boardLevel ?? "edit_all";
    const readOnly = memberRole === "viewer" || (boardRole === null && !isGuest && wsRole === "viewer");
    if (readOnly) level = "view_only";
    else if (isGuest) level = minLevel(level, "edit_content");
  }
  return { canView, isOwner: isOwner && !isGuest && !isViewer, level };
}

/** Pure decision function (no I/O) so it can be unit tested and reused for list filtering. */
export function decide(actor: Actor, action: Action, ctx: DecideCtx = {}): boolean {
  if (actor.isSystem) return true;
  if (actor.agent && !agentAllows(actor, action, ctx)) return false; // ai agents: only granted boards
  const caps = ctx.caps ?? null;
  const cap = caps?.[action];
  if (cap === false) return false; // explicit deny from the custom role (also for admins with a custom role)
  if (actor.role === "admin") return true;
  const isViewer = actor.role === "viewer";
  const isGuest = actor.role === "guest";

  if (action.startsWith("account:")) return cap === true || caps?.["account:manage"] === true;
  if (action === "workspace:create") return cap === true || actor.role === "member";

  if (action.startsWith("workspace:")) {
    const { ws, wsRole = null } = ctx;
    if (!ws || ws.state === "deleted") return false;
    if (isGuest) return false;
    const visible = ws.kind === "open" || wsRole !== null;
    switch (action) {
      case "workspace:view":
        return visible;
      case "workspace:create_board":
        return !isViewer && visible && wsRole !== "viewer" && (ctx.wsCreateBoards !== "owners" || wsRole === "owner");
      case "workspace:update":
      case "workspace:delete":
      case "workspace:manage_members":
        return wsRole === "owner";
      default:
        return false;
    }
  }

  // board / column actions
  const acc = boardAccess(actor, ctx);
  if (!acc.canView) return false;
  if (action === "board:view") return true;
  if (action === "column:view") return columnAccess(ctx.column?.view, ctx, actor, acc.isOwner);
  const editItems = (): boolean => {
    if (acc.level === "edit_all" || acc.level === "edit_content") return true;
    if (acc.level === "edit_assigned") return !!ctx.hasItem && !!ctx.itemAssigned;
    return false;
  };
  switch (action) {
    case "board:comment":
      return acc.level !== "view_only";
    case "board:edit_items":
      return editItems();
    case "column:edit":
      return editItems() && columnAccess(ctx.column?.edit, ctx, actor, acc.isOwner);
    case "board:edit_structure":
      if (acc.level === "view_only") return false;
      return cap === true || acc.isOwner || (acc.level === "edit_all" && !isGuest);
    case "board:delete":
      if (acc.level === "view_only") return false;
      return cap === true || acc.isOwner;
    case "board:manage_members":
      return acc.isOwner;
    default:
      return false;
  }
}

/** Can `actor` do `action` on the given workspace/board/column/item? Unknown resources return false. */
export function can(actor: Actor | null | undefined, action: Action, res: Resource = {}): boolean {
  if (!actor) return false;
  if (actor.isSystem) return true;
  return decide(actor, action, loadCtx(actor, res));
}

/** Throws ForbiddenError when `can` is false. Services call this first. */
export function assertCan(actor: Actor | null | undefined, action: Action, res: Resource = {}): void {
  if (!can(actor, action, res)) throw new ForbiddenError(`Not allowed: ${action}`);
}

/** Effective level of the actor on a board (null = cannot view). */
export function boardLevelFor(actor: Actor, boardId: string): { level: BoardPermissionLevel; isOwner: boolean } | null {
  if (actor.isSystem || actor.role === "admin") return { level: "edit_all", isOwner: true };
  const acc = boardAccess(actor, loadCtx(actor, { boardId }));
  return acc.canView ? { level: acc.level, isOwner: acc.isOwner } : null;
}

/** Preloaded context for filtering lists (sidebar, board lists, search) without N queries per row. */
export function boardVisibilityFilter(actor: Actor) {
  if (actor.isSystem || actor.role === "admin") return () => true;
  const lc = loadListContext(actor);
  return (b: BoardRow): boolean =>
    decide(actor, "board:view", { ws: lc.wsById.get(b.workspaceId) ?? null, wsRole: lc.wsRoles.get(b.workspaceId) ?? null, board: b, boardRole: lc.boardRoles.get(b.id) ?? null, guestGrantRole: lc.grants.get(b.workspaceId) ?? null });
}

export function workspaceVisibilityFilter(actor: Actor) {
  if (actor.isSystem || actor.role === "admin") return () => true;
  const lc = loadListContext(actor);
  return (w: WsRow): boolean => decide(actor, "workspace:view", { ws: w, wsRole: lc.wsRoles.get(w.id) ?? null });
}

export { hiddenColumnIds } from "./permissions-data";
