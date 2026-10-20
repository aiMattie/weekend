/**
 * Roles and permission settings (the writable side of src/lib/permissions.ts):
 *  - custom account roles with a capability matrix (Admin > Roles)
 *  - workspace settings (open / closed, who can create boards)
 *  - board permission level, owners, private / shareable
 *  - column permissions (who can view / edit a column)
 * Every change is audited as a permission change.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors";
import { emit } from "../../lib/events";
import { assertCan, BOARD_LEVELS, boardLevelFor, CAPABILITIES, decide, type Action, type DecideCtx } from "../../lib/permissions";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { boardMembers, boards, columns, users, workspaceMembers, workspaces } from "../../db/schema/core";
import {
  accountRoles, boardPermissions, columnPermissions, userRoles, workspacePermissions,
  type BoardPermissionLevel, type ColumnAccess,
} from "../../db/schema/audit-log";
import { recordAudit } from "./audit";
import { syncGuestGrants } from "./guest-sync";
import { getBoardRow, parse, requireBoard } from "./_shared";

/* ------------------------------------------------------------------ custom account roles */

export type AccountRole = typeof accountRoles.$inferSelect & { userCount: number };

const capKeys = CAPABILITIES.map((c) => c.key) as [Action, ...Action[]];
const roleInput = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).nullish(),
  baseRole: z.enum(["admin", "member", "viewer", "guest"]).default("member"),
  capabilities: z.record(z.string(), z.boolean()).refine((c) => Object.keys(c).every((k) => (capKeys as string[]).includes(k)), "Unknown capability").default({}),
});

export function listRoles(actor: Actor): AccountRole[] {
  assertCan(actor, "account:invite");
  const counts = new Map(db.select({ id: userRoles.roleId, n: sql<number>`count(*)` }).from(userRoles).groupBy(userRoles.roleId).all().map((r) => [r.id, r.n]));
  return db.select().from(accountRoles).where(eq(accountRoles.accountId, actor.accountId)).orderBy(asc(accountRoles.name)).all().map((r) => ({ ...r, capabilities: knownCaps(r.capabilities), userCount: counts.get(r.id) ?? 0 }));
}

/** Drops capabilities that no longer exist (e.g. the removed account:billing), so saving an older role keeps working. */
function knownCaps(caps: Record<string, boolean>): Record<string, boolean> {
  return Object.fromEntries(Object.entries(caps).filter(([k]) => (capKeys as string[]).includes(k)));
}

export function createRole(actor: Actor, input: unknown): AccountRole {
  assertCan(actor, "account:manage");
  const d = parse(roleInput, input);
  if (db.select().from(accountRoles).where(and(eq(accountRoles.accountId, actor.accountId), sql`lower(${accountRoles.name}) = ${d.name.toLowerCase()}`)).get()) throw new ConflictError("A role with this name already exists");
  const r = db.insert(accountRoles).values({ accountId: actor.accountId, name: d.name, description: d.description ?? null, baseRole: d.baseRole, capabilities: d.capabilities }).returning().get();
  recordAudit(actor, "role.created", { targetType: "role", targetId: r.id, targetName: r.name, baseRole: r.baseRole, capabilities: d.capabilities });
  return { ...r, userCount: 0 };
}

export function updateRole(actor: Actor, id: string, input: unknown): AccountRole {
  assertCan(actor, "account:manage");
  const d = parse(roleInput.partial(), input);
  const cur = db.select().from(accountRoles).where(and(eq(accountRoles.id, id), eq(accountRoles.accountId, actor.accountId))).get();
  if (!cur) throw new NotFoundError("Role");
  const row = db.update(accountRoles).set({
    ...(d.name !== undefined ? { name: d.name } : {}), ...(d.description !== undefined ? { description: d.description ?? null } : {}),
    ...(d.baseRole !== undefined ? { baseRole: d.baseRole } : {}), ...(d.capabilities !== undefined ? { capabilities: d.capabilities } : {}),
  }).where(eq(accountRoles.id, id)).returning().get();
  // users of this role follow a changed base role
  if (d.baseRole && d.baseRole !== cur.baseRole) {
    const ids = db.select({ id: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, id)).all().map((r) => r.id);
    for (const uid of ids) db.update(users).set({ role: d.baseRole }).where(eq(users.id, uid)).run();
  }
  recordAudit(actor, "role.updated", { targetType: "role", targetId: id, targetName: row.name, capabilities: row.capabilities, baseRole: row.baseRole });
  emit({ type: "member.changed", boardId: null, actorId: actor.isSystem ? null : actor.id });
  return { ...row, userCount: db.select({ n: sql<number>`count(*)` }).from(userRoles).where(eq(userRoles.roleId, id)).get()?.n ?? 0 };
}

/** Deleting a role keeps its users on the base role. */
export function deleteRole(actor: Actor, id: string): void {
  assertCan(actor, "account:manage");
  const cur = db.select().from(accountRoles).where(and(eq(accountRoles.id, id), eq(accountRoles.accountId, actor.accountId))).get();
  if (!cur) throw new NotFoundError("Role");
  db.delete(accountRoles).where(eq(accountRoles.id, id)).run();
  recordAudit(actor, "role.deleted", { targetType: "role", targetId: id, targetName: cur.name });
}

/** What each built-in role may do, computed with the real decision function (never out of sync). */
export function builtinMatrix(): { actions: Action[]; roles: { role: "admin" | "member" | "viewer" | "guest"; allowed: Record<string, boolean> }[] } {
  const ws = { id: "w", kind: "open" as const, state: "active" };
  const roles = (["admin", "member", "viewer", "guest"] as const).map((role) => {
    const actor = { id: "u1", accountId: "a", role } as Actor;
    const ctx: DecideCtx = {
      ws: role === "guest" ? { ...ws, kind: "closed" } : ws,
      wsRole: null,
      board: { id: "b", workspaceId: "w", visibility: role === "guest" ? "share" : "public", ownerId: null, state: "active" },
      boardRole: role === "guest" ? "editor" : null,
    };
    const allowed: Record<string, boolean> = {};
    for (const c of CAPABILITIES) allowed[c.key] = decide(actor, c.key, ctx);
    return { role, allowed };
  });
  return { actions: CAPABILITIES.map((c) => c.key), roles };
}

/* ------------------------------------------------------------------ workspace */

export interface WorkspacePermissionInfo {
  id: string; name: string; kind: "open" | "closed"; createBoards: "members" | "owners";
  members: { userId: string; name: string; email: string; role: "owner" | "member" | "viewer" }[];
}

export function getWorkspace(actor: Actor, workspaceId: string): WorkspacePermissionInfo {
  assertCan(actor, "workspace:view", { workspaceId });
  const w = db.select().from(workspaces).where(and(eq(workspaces.id, workspaceId), eq(workspaces.accountId, actor.accountId))).get();
  if (!w) throw new NotFoundError("Workspace");
  const members = db.select({ userId: users.id, name: users.name, email: users.email, role: workspaceMembers.role })
    .from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, workspaceId)).orderBy(asc(users.name)).all();
  return { id: w.id, name: w.name, kind: w.kind, createBoards: db.select().from(workspacePermissions).where(eq(workspacePermissions.workspaceId, workspaceId)).get()?.createBoards ?? "members", members };
}

const wsInput = z.object({ kind: z.enum(["open", "closed"]).optional(), createBoards: z.enum(["members", "owners"]).optional() });

/** Open / closed and "who can create boards" (workspace owners and admins). */
export function setWorkspace(actor: Actor, workspaceId: string, input: unknown): WorkspacePermissionInfo {
  const d = parse(wsInput, input);
  assertCan(actor, "workspace:update", { workspaceId });
  const before = getWorkspace(actor, workspaceId);
  if (d.kind) db.update(workspaces).set({ kind: d.kind }).where(eq(workspaces.id, workspaceId)).run();
  if (d.createBoards) db.insert(workspacePermissions).values({ workspaceId, createBoards: d.createBoards }).onConflictDoUpdate({ target: workspacePermissions.workspaceId, set: { createBoards: d.createBoards } }).run();
  recordAudit(actor, "permission.workspace_changed", { targetType: "workspace", targetId: workspaceId, targetName: before.name, kind: d.kind, createBoards: d.createBoards, from: { kind: before.kind, createBoards: before.createBoards } });
  emit({ type: "workspace.changed", boardId: null, actorId: actor.isSystem ? null : actor.id });
  return getWorkspace(actor, workspaceId);
}

export function setWorkspaceMember(actor: Actor, workspaceId: string, userId: string, role: "owner" | "member" | "viewer" | null): WorkspacePermissionInfo {
  assertCan(actor, "workspace:manage_members", { workspaceId });
  const uid = parse(idSchema, userId);
  const u = db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(and(eq(users.id, uid), eq(users.accountId, actor.accountId))).get();
  if (!u) throw new NotFoundError("User");
  if (u.role === "guest") throw new ValidationError("Guests are added to boards or via the guest invitation");
  if (role === null) db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, uid))).run();
  else db.insert(workspaceMembers).values({ workspaceId, userId: uid, role }).onConflictDoUpdate({ target: [workspaceMembers.workspaceId, workspaceMembers.userId], set: { role } }).run();
  recordAudit(actor, "permission.workspace_member_changed", { targetType: "workspace", targetId: workspaceId, userId: uid, userName: u.name, role });
  emit({ type: "workspace.changed", boardId: null, actorId: actor.isSystem ? null : actor.id });
  return getWorkspace(actor, workspaceId);
}

/* ------------------------------------------------------------------ board */

export interface BoardPermissionInfo {
  id: string; name: string; visibility: "public" | "private" | "share"; level: BoardPermissionLevel; ownerId: string | null;
  members: { userId: string; name: string; email: string; role: "owner" | "editor" | "viewer"; accountRole: string }[];
  me: { level: BoardPermissionLevel; isOwner: boolean } | null;
}

export function getBoard(actor: Actor, boardId: string): BoardPermissionInfo {
  const b = requireBoard(actor, boardId, "board:view");
  const members = db.select({ userId: users.id, name: users.name, email: users.email, role: boardMembers.role, accountRole: users.role })
    .from(boardMembers).innerJoin(users, eq(users.id, boardMembers.userId)).where(eq(boardMembers.boardId, boardId)).orderBy(asc(users.name)).all();
  return {
    id: b.id, name: b.name, visibility: b.visibility, ownerId: b.ownerId, members, me: boardLevelFor(actor, boardId),
    level: db.select().from(boardPermissions).where(eq(boardPermissions.boardId, boardId)).get()?.level ?? "edit_all",
  };
}

const boardInput = z.object({ level: z.enum(BOARD_LEVELS as [BoardPermissionLevel, ...BoardPermissionLevel[]]).optional(), visibility: z.enum(["public", "private", "share"]).optional() });

/** Board owners and admins: permission level for members and main / private / shareable. */
export function setBoard(actor: Actor, boardId: string, input: unknown): BoardPermissionInfo {
  const d = parse(boardInput, input);
  const b = requireBoard(actor, boardId, "board:manage_members");
  const before = getBoard(actor, boardId);
  if (d.level) db.insert(boardPermissions).values({ boardId, level: d.level }).onConflictDoUpdate({ target: boardPermissions.boardId, set: { level: d.level } }).run();
  if (d.visibility && d.visibility !== b.visibility) {
    if (d.visibility === "private" && db.select({ id: users.id }).from(boardMembers).innerJoin(users, eq(users.id, boardMembers.userId)).where(and(eq(boardMembers.boardId, boardId), eq(users.role, "guest"))).get()) {
      throw new ValidationError("Remove the guests first: private boards cannot be shared with guests");
    }
    db.update(boards).set({ visibility: d.visibility }).where(eq(boards.id, boardId)).run();
    emit({ type: "board.updated", boardId, actorId: actor.isSystem ? null : actor.id });
    if (d.visibility === "share") syncGuestGrants(b.workspaceId);
  }
  recordAudit(actor, "permission.board_changed", { targetType: "board", targetId: boardId, targetName: b.name, level: d.level, visibility: d.visibility, from: { level: before.level, visibility: before.visibility } });
  return getBoard(actor, boardId);
}

/** Add / change / remove (role = null) a board member, with an audit entry. Owners and admins only. */
export function setBoardMember(actor: Actor, boardId: string, userId: string, role: "owner" | "editor" | "viewer" | null): BoardPermissionInfo {
  const b = requireBoard(actor, boardId, "board:manage_members");
  const uid = parse(idSchema, userId);
  const u = db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(and(eq(users.id, uid), eq(users.accountId, actor.accountId))).get();
  if (!u) throw new NotFoundError("User");
  if (role === null) db.delete(boardMembers).where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, uid))).run();
  else {
    if (u.role === "guest") {
      if (b.visibility === "private") throw new ValidationError("Guests can only be added to boards that are shared with guests");
      if (b.visibility === "public") db.update(boards).set({ visibility: "share" }).where(eq(boards.id, boardId)).run();
    }
    db.insert(boardMembers).values({ boardId, userId: uid, role }).onConflictDoUpdate({ target: [boardMembers.boardId, boardMembers.userId], set: { role } }).run();
  }
  recordAudit(actor, "permission.board_member_changed", { targetType: "board", targetId: boardId, targetName: b.name, userId: uid, userName: u.name, role });
  emit({ type: "member.changed", boardId, actorId: actor.isSystem ? null : actor.id });
  return getBoard(actor, boardId);
}

/* ------------------------------------------------------------------ column */

const accessSchema = z.object({
  mode: z.enum(["everyone", "owners", "specific", "assigned"]),
  userIds: z.array(idSchema).max(500).default([]),
  teamIds: z.array(idSchema).max(100).default([]),
});
const EVERYONE: ColumnAccess = { mode: "everyone", userIds: [], teamIds: [] };

export interface ColumnPermissionInfo { columnId: string; title: string; type: string; edit: ColumnAccess; view: ColumnAccess }

export function listColumnPermissions(actor: Actor, boardId: string): ColumnPermissionInfo[] {
  requireBoard(actor, boardId, "board:view");
  const perms = new Map(db.select().from(columnPermissions).where(eq(columnPermissions.boardId, boardId)).all().map((r) => [r.columnId, r]));
  return db.select().from(columns).where(and(eq(columns.boardId, boardId), eq(columns.archived, false))).orderBy(asc(columns.position)).all()
    .map((c) => ({ columnId: c.id, title: c.title, type: c.type, edit: perms.get(c.id)?.edit ?? EVERYONE, view: perms.get(c.id)?.view ?? EVERYONE }));
}

/** Only board owners and admins set column permissions. `view` accepts everyone | owners | specific. */
export function setColumnPermission(actor: Actor, columnId: string, input: unknown): ColumnPermissionInfo {
  const d = parse(z.object({ edit: accessSchema.optional(), view: accessSchema.optional() }), input);
  const col = db.select().from(columns).where(eq(columns.id, columnId)).get();
  if (!col) throw new NotFoundError("Column");
  const b = getBoardRow(col.boardId);
  assertCan(actor, "board:manage_members", { boardId: col.boardId });
  if (d.view?.mode === "assigned") throw new ValidationError("A column can be hidden for everyone but owners or specific people, not by assignment");
  const cur = db.select().from(columnPermissions).where(eq(columnPermissions.columnId, columnId)).get();
  const edit = d.edit ?? cur?.edit ?? EVERYONE;
  const view = d.view ?? cur?.view ?? EVERYONE;
  db.insert(columnPermissions).values({ columnId, boardId: col.boardId, edit, view })
    .onConflictDoUpdate({ target: columnPermissions.columnId, set: { edit, view } }).run();
  recordAudit(actor, "permission.column_changed", { targetType: "column", targetId: columnId, targetName: `${b.name} / ${col.title}`, boardId: col.boardId, edit: edit.mode, view: view.mode });
  emit({ type: "column.updated", boardId: col.boardId, columnId, actorId: actor.isSystem ? null : actor.id });
  return { columnId, title: col.title, type: col.type, edit, view };
}
