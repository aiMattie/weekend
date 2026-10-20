/**
 * Database side of the permission model: loads everything `decide()` (src/lib/permissions.ts) needs
 * for one actor + resource. No decisions are made here.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Actor } from "./actor";
import { db } from "../db/client";
import { boardMembers, boards, columns, items, teamMembers, workspaceMembers, workspaces } from "../db/schema/core";
import {
  accountRoles, boardPermissions, columnPermissions, guestGrants, userRoles, workspacePermissions,
  type BoardPermissionLevel, type ColumnAccess,
} from "../db/schema/audit-log";

export type WsRole = "owner" | "member" | "viewer" | null;
export type BoardRole = "owner" | "editor" | "viewer" | null;
export interface WsRow { id: string; kind: "open" | "closed"; state: string }
export interface BoardRow { id: string; workspaceId: string; visibility: "public" | "private" | "share"; ownerId: string | null; state: string }

export interface ColumnAccessPair { edit: ColumnAccess; view: ColumnAccess }

/** Everything the pure decision function needs. All fields are optional (defaults = product defaults). */
export interface DecideCtx {
  ws?: WsRow | null;
  wsRole?: WsRole;
  board?: BoardRow | null;
  boardRole?: BoardRole;
  /** custom account role capability matrix (null = no custom role) */
  caps?: Record<string, boolean> | null;
  /** workspace setting: who can create boards */
  wsCreateBoards?: "members" | "owners";
  /** board setting: what non-owner members may do (default edit_all) */
  boardLevel?: BoardPermissionLevel;
  /** guest invited to the whole workspace (applies to boards shared with guests) */
  guestGrantRole?: "editor" | "viewer" | null;
  /** column permission rows (null = everyone) */
  column?: ColumnAccessPair | null;
  /** true when the actor (or one of the actor's teams) is assigned to the item (people column) */
  itemAssigned?: boolean;
  /** the item id was part of the resource (needed for "assigned only" rules) */
  hasItem?: boolean;
  /** teams the actor belongs to */
  teamIds?: string[];
}

export interface ResourceIds { workspaceId?: string; boardId?: string; columnId?: string; itemId?: string }

export function actorTeamIds(userId: string): string[] {
  return db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId)).all().map((r) => r.teamId);
}

export function actorCaps(userId: string): Record<string, boolean> | null {
  const row = db.select({ caps: accountRoles.capabilities }).from(userRoles)
    .innerJoin(accountRoles, eq(accountRoles.id, userRoles.roleId)).where(eq(userRoles.userId, userId)).get();
  return row?.caps ?? null;
}

/** Is `userId` (or one of the teams) assigned to the item through any people column? */
export function isAssigned(itemId: string, userId: string, teamIds: string[]): boolean {
  const item = db.select({ boardId: items.boardId, values: items.values }).from(items).where(eq(items.id, itemId)).get();
  if (!item) return false;
  const peopleCols = db.select({ id: columns.id }).from(columns).where(and(eq(columns.boardId, item.boardId), eq(columns.type, "people"))).all();
  for (const c of peopleCols) {
    const v = item.values[c.id] as { personsAndTeams?: { id: string; kind: string }[] } | undefined;
    for (const p of v?.personsAndTeams ?? []) {
      if (p.kind === "team" ? teamIds.includes(p.id) : p.id === userId) return true;
    }
  }
  return false;
}

export function loadCtx(actor: Actor, res: ResourceIds): DecideCtx {
  let boardRow: BoardRow | undefined;
  let workspaceId = res.workspaceId;
  if (res.boardId) {
    boardRow = db.select({ id: boards.id, workspaceId: boards.workspaceId, visibility: boards.visibility, ownerId: boards.ownerId, state: boards.state })
      .from(boards).where(eq(boards.id, res.boardId)).get();
    workspaceId = boardRow?.workspaceId ?? workspaceId;
  }
  const ws = workspaceId
    ? db.select({ id: workspaces.id, kind: workspaces.kind, state: workspaces.state }).from(workspaces).where(eq(workspaces.id, workspaceId)).get()
    : undefined;
  const wsRole = ws
    ? (db.select({ role: workspaceMembers.role }).from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.userId, actor.id))).get()?.role ?? null)
    : null;
  const boardRole = boardRow
    ? (db.select({ role: boardMembers.role }).from(boardMembers)
        .where(and(eq(boardMembers.boardId, boardRow.id), eq(boardMembers.userId, actor.id))).get()?.role ?? null)
    : null;
  const ctx: DecideCtx = { ws: ws ?? null, wsRole, board: boardRow ?? null, boardRole, caps: actorCaps(actor.id) };
  if (ws) ctx.wsCreateBoards = db.select().from(workspacePermissions).where(eq(workspacePermissions.workspaceId, ws.id)).get()?.createBoards ?? "members";
  if (boardRow) {
    ctx.boardLevel = db.select().from(boardPermissions).where(eq(boardPermissions.boardId, boardRow.id)).get()?.level ?? "edit_all";
    if (actor.role === "guest" && boardRole === null && ws) {
      ctx.guestGrantRole = db.select().from(guestGrants).where(and(eq(guestGrants.userId, actor.id), eq(guestGrants.workspaceId, ws.id))).get()?.role ?? null;
    }
  }
  if (res.columnId) {
    const row = db.select().from(columnPermissions).where(eq(columnPermissions.columnId, res.columnId)).get();
    ctx.column = row ? { edit: row.edit, view: row.view } : null;
  }
  if (res.itemId || res.columnId || boardRow) ctx.teamIds = actorTeamIds(actor.id);
  if (res.itemId) {
    ctx.hasItem = true;
    ctx.itemAssigned = isAssigned(res.itemId, actor.id, ctx.teamIds ?? []);
  }
  return ctx;
}

/** Preloaded maps for list filtering (sidebar, search) without per-row queries. */
export function loadListContext(actor: Actor) {
  const wsRoles = new Map(db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actor.id)).all().map((r) => [r.workspaceId, r.role]));
  const boardRoles = new Map(db.select().from(boardMembers).where(eq(boardMembers.userId, actor.id)).all().map((r) => [r.boardId, r.role]));
  const wsById = new Map(db.select({ id: workspaces.id, kind: workspaces.kind, state: workspaces.state }).from(workspaces).all().map((w) => [w.id, w]));
  const grants = actor.role === "guest"
    ? new Map(db.select().from(guestGrants).where(eq(guestGrants.userId, actor.id)).all().map((g) => [g.workspaceId, g.role]))
    : new Map<string, "editor" | "viewer">();
  return { wsRoles, boardRoles, wsById, grants, caps: actorCaps(actor.id) };
}

/** Column ids on a board the actor may not see (column "view" permission). */
export function hiddenColumnIds(actor: Actor, boardId: string, colIds?: string[]): Set<string> {
  const hidden = new Set<string>();
  if (actor.isSystem || actor.role === "admin") return hidden;
  const rows = db.select().from(columnPermissions).where(eq(columnPermissions.boardId, boardId)).all()
    .filter((r) => r.view.mode !== "everyone" && (!colIds || colIds.includes(r.columnId)));
  if (!rows.length) return hidden;
  const board = db.select({ ownerId: boards.ownerId }).from(boards).where(eq(boards.id, boardId)).get();
  const boardRole = db.select({ role: boardMembers.role }).from(boardMembers).where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, actor.id))).get()?.role;
  const wsId = db.select({ w: boards.workspaceId }).from(boards).where(eq(boards.id, boardId)).get()?.w;
  const wsRole = wsId ? db.select({ role: workspaceMembers.role }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, actor.id))).get()?.role : undefined;
  const isOwner = board?.ownerId === actor.id || boardRole === "owner" || wsRole === "owner";
  const teams = actorTeamIds(actor.id);
  for (const r of rows) {
    const v = r.view;
    const ok = isOwner || (v.mode === "specific" && (v.userIds.includes(actor.id) || v.teamIds.some((t) => teams.includes(t))));
    if (!ok) hidden.add(r.columnId);
  }
  return hidden;
}

/** helper for callers that need the board ids a user is explicitly a member of */
export function memberBoardIds(userId: string, boardIds: string[]): Set<string> {
  if (!boardIds.length) return new Set();
  return new Set(db.select({ id: boardMembers.boardId }).from(boardMembers).where(and(eq(boardMembers.userId, userId), inArray(boardMembers.boardId, boardIds))).all().map((r) => r.id));
}
