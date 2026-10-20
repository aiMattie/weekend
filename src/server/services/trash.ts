/**
 * Archive and trash: list archived/deleted boards, groups, items and workspaces and restore or
 * permanently delete them. Soft delete everywhere else is `state = archived | deleted`.
 */
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { boardVisibilityFilter, can } from "../../lib/permissions";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { boardMembers, boards, groups, items, workspaceMembers, workspaces } from "../../db/schema/core";
import * as groupsSvc from "./groups";
import { activeGroups } from "./groups";
import * as itemsSvc from "./items";
import { parse, record } from "./_shared";

type State = "archived" | "deleted";
const stateSchema = z.enum(["archived", "deleted"]);

export interface TrashBoard { id: string; name: string; workspaceId: string; workspaceName: string; kind: string; state: State; updatedAt: string }
export interface TrashGroup { id: string; title: string; color: string; boardId: string; boardName: string; state: State }
export interface TrashItem { id: string; name: string; boardId: string; boardName: string; groupId: string | null; groupTitle: string | null; parentItemId: string | null; state: State; updatedAt: string }
export interface TrashWorkspace { id: string; name: string; state: State }
export interface TrashList { boards: TrashBoard[]; groups: TrashGroup[]; items: TrashItem[]; workspaces: TrashWorkspace[] }

const isAdmin = (a: Actor) => !!a.isSystem || a.role === "admin";

function ownsBoard(actor: Actor, b: { id: string; ownerId: string | null }): boolean {
  if (isAdmin(actor) || b.ownerId === actor.id) return true;
  return !!db.select().from(boardMembers).where(and(eq(boardMembers.boardId, b.id), eq(boardMembers.userId, actor.id), eq(boardMembers.role, "owner"))).get();
}

function ownsWorkspace(actor: Actor, w: { id: string; createdBy: string | null }): boolean {
  if (isAdmin(actor) || w.createdBy === actor.id) return true;
  return !!db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, w.id), eq(workspaceMembers.userId, actor.id), eq(workspaceMembers.role, "owner"))).get();
}

/** Can the actor see the board while ignoring its soft-delete state? */
function seesBoard(actor: Actor) {
  const visible = boardVisibilityFilter(actor);
  return (b: { id: string; workspaceId: string; visibility: "public" | "private" | "share"; ownerId: string | null; state: string }) => visible({ ...b, state: "active" });
}

export function list(actor: Actor, input: unknown): TrashList {
  const { state } = parse(z.object({ state: stateSchema }), input);
  const sees = seesBoard(actor);
  const wsRows = db.select().from(workspaces).where(eq(workspaces.accountId, actor.accountId)).all();
  const wsName = new Map(wsRows.map((w) => [w.id, w.name]));
  const wsOut = wsRows.filter((w) => w.state === state && ownsWorkspace(actor, w)).map((w) => ({ id: w.id, name: w.name, state }));
  const activeWs = new Set(wsRows.filter((w) => w.state === "active").map((w) => w.id));
  const allBoards = db.select().from(boards).where(inArray(boards.workspaceId, [...wsName.keys()].length ? [...wsName.keys()] : ["-"])).all();
  const boardOut = allBoards
    .filter((b) => b.state === state && sees(b) && ownsBoard(actor, b))
    .map((b) => ({ id: b.id, name: b.name, workspaceId: b.workspaceId, workspaceName: wsName.get(b.workspaceId) ?? "", kind: b.kind, state, updatedAt: b.updatedAt }));
  const activeBoards = new Map(allBoards.filter((b) => b.state === "active" && activeWs.has(b.workspaceId) && sees(b)).map((b) => [b.id, b]));
  const ids = [...activeBoards.keys()];
  const groupRows = ids.length ? db.select().from(groups).where(and(inArray(groups.boardId, ids), eq(groups.state, state))).all() : [];
  const itemRows = ids.length ? db.select().from(items).where(and(inArray(items.boardId, ids), eq(items.state, state))).orderBy(desc(items.updatedAt)).limit(1000).all() : [];
  const groupTitles = new Map(db.select({ id: groups.id, title: groups.title }).from(groups).where(ids.length ? inArray(groups.boardId, ids) : eq(groups.id, "-")).all().map((g) => [g.id, g.title]));
  const canEditBoard = new Map<string, boolean>();
  const editable = (boardId: string) => { if (!canEditBoard.has(boardId)) canEditBoard.set(boardId, can(actor, "board:edit_items", { boardId })); return canEditBoard.get(boardId)!; };
  // items hidden because their whole group is archived/deleted are restored with the group
  const hiddenGroups = new Set(groupRows.map((g) => g.id));
  return {
    boards: boardOut,
    workspaces: wsOut,
    groups: groupRows.filter((g) => editable(g.boardId)).map((g) => ({ id: g.id, title: g.title, color: g.color, boardId: g.boardId, boardName: activeBoards.get(g.boardId)?.name ?? "", state })),
    items: itemRows.filter((i) => editable(i.boardId) && !(i.groupId && hiddenGroups.has(i.groupId)) && !(i.parentItemId && db.select({ s: items.state }).from(items).where(eq(items.id, i.parentItemId)).get()?.s === state))
      .map((i) => ({ id: i.id, name: i.name, boardId: i.boardId, boardName: activeBoards.get(i.boardId)?.name ?? "", groupId: i.groupId, groupTitle: i.groupId ? groupTitles.get(i.groupId) ?? null : null, parentItemId: i.parentItemId, state, updatedAt: i.updatedAt })),
  };
}

const targetSchema = z.object({ kind: z.enum(["board", "group", "item", "workspace"]), id: idSchema });

export function restore(actor: Actor, input: unknown): { kind: string; id: string } {
  const d = parse(targetSchema, input);
  if (d.kind === "board") {
    const b = db.select().from(boards).where(eq(boards.id, d.id)).get();
    if (!b || !seesBoard(actor)(b) || !ownsBoard(actor, b)) throw new NotFoundError("Board");
    const ws = db.select().from(workspaces).where(eq(workspaces.id, b.workspaceId)).get();
    if (!ws || ws.state !== "active") throw new ValidationError("Restore the workspace first");
    db.update(boards).set({ state: "active" }).where(eq(boards.id, d.id)).run();
    record(actor, { type: "board.created", boardId: d.id }, { event: "restore_board", data: { name: b.name } });
  } else if (d.kind === "workspace") {
    const w = db.select().from(workspaces).where(and(eq(workspaces.id, d.id), eq(workspaces.accountId, actor.accountId))).get();
    if (!w || !ownsWorkspace(actor, w)) throw new NotFoundError("Workspace");
    db.transaction((tx) => {
      tx.update(workspaces).set({ state: "active" }).where(eq(workspaces.id, d.id)).run();
      // boards deleted together with the workspace come back with it
      if (w.state === "deleted") tx.update(boards).set({ state: "active" }).where(and(eq(boards.workspaceId, d.id), eq(boards.state, "deleted"))).run();
    });
  } else if (d.kind === "group") {
    const g = db.select().from(groups).where(eq(groups.id, d.id)).get();
    if (!g) throw new NotFoundError("Group");
    // setState checks board:edit_structure
    groupsSvc.setState(actor, d.id, "active");
  } else {
    const it = db.select().from(items).where(eq(items.id, d.id)).get();
    if (!it) throw new NotFoundError("Item");
    itemsSvc.restore(actor, d.id);
    const parent = it.parentItemId ? db.select().from(items).where(eq(items.id, it.parentItemId)).get() : null;
    if (parent && parent.state !== "active") itemsSvc.restore(actor, parent.id);
    const g = it.groupId ? db.select().from(groups).where(eq(groups.id, it.groupId)).get() : null;
    if (!g || g.state !== "active") {
      const first = activeGroups(it.boardId)[0];
      if (first) db.update(items).set({ groupId: first.id }).where(or(eq(items.id, d.id), eq(items.parentItemId, d.id))).run();
    }
  }
  return d;
}

/** Permanent delete of something that is already archived or in the trash. */
export function purge(actor: Actor, input: unknown): { kind: string; id: string } {
  const d = parse(targetSchema, input);
  if (d.kind === "board") {
    const b = db.select().from(boards).where(eq(boards.id, d.id)).get();
    if (!b || b.state === "active" || !seesBoard(actor)(b) || !ownsBoard(actor, b)) throw new NotFoundError("Board");
    db.delete(boards).where(eq(boards.id, d.id)).run();
  } else if (d.kind === "workspace") {
    const w = db.select().from(workspaces).where(and(eq(workspaces.id, d.id), eq(workspaces.accountId, actor.accountId))).get();
    if (!w || w.state === "active" || !ownsWorkspace(actor, w)) throw new NotFoundError("Workspace");
    db.delete(workspaces).where(eq(workspaces.id, d.id)).run();
  } else if (d.kind === "group") {
    const g = db.select().from(groups).where(eq(groups.id, d.id)).get();
    if (!g || g.state === "active") throw new NotFoundError("Group");
    if (!can(actor, "board:edit_structure", { boardId: g.boardId })) throw new ForbiddenError();
    db.transaction((tx) => {
      tx.delete(items).where(eq(items.groupId, d.id)).run();
      tx.delete(groups).where(eq(groups.id, d.id)).run();
    });
  } else {
    const it = db.select().from(items).where(eq(items.id, d.id)).get();
    if (!it || it.state === "active") throw new NotFoundError("Item");
    if (!can(actor, "board:edit_items", { boardId: it.boardId, itemId: it.id })) throw new ForbiddenError();
    db.transaction((tx) => {
      tx.delete(items).where(eq(items.parentItemId, d.id)).run();
      tx.delete(items).where(eq(items.id, d.id)).run();
    });
  }
  return d;
}

/** Permanently delete everything in the actor's trash (or archive). */
export function empty(actor: Actor, input: unknown): number {
  const { state } = parse(z.object({ state: stateSchema }), input);
  const l = list(actor, { state });
  let n = 0;
  for (const it of l.items.filter((i) => !i.parentItemId)) { purge(actor, { kind: "item", id: it.id }); n++; }
  for (const g of l.groups) { purge(actor, { kind: "group", id: g.id }); n++; }
  for (const b of l.boards) { purge(actor, { kind: "board", id: b.id }); n++; }
  return n;
}

