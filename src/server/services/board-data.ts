/** Read models used by the UI: whole board in one call, and the navigation tree. */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Actor } from "../../lib/actor";
import type { BoardFull, NavData } from "../../lib/board-types";
import { db } from "../../db/client";
import { favorites, folders, items, teams, updates, users } from "../../db/schema/core";
import { activeGroups } from "./groups";
import { decorateItems } from "./computed";
import { can } from "../../lib/permissions";
import { hiddenColumnIds } from "../../lib/permissions-data";
import * as boards from "./boards";
import { boardColumns, requireBoard } from "./_shared";
import * as viewsService from "./views";
import * as workspaces from "./workspaces";

export function getBoardFull(actor: Actor, boardId: string): BoardFull {
  const board = requireBoard(actor, boardId, "board:view");
  const rows = decorateItems(actor, db.select().from(items).where(and(eq(items.boardId, boardId), eq(items.state, "active"))).orderBy(asc(items.position)).all());
  const hiddenCols = hiddenColumnIds(actor, boardId);
  const ids = rows.map((r) => r.id);
  const subCount = new Map<string, number>();
  for (const r of rows) if (r.parentItemId) subCount.set(r.parentItemId, (subCount.get(r.parentItemId) ?? 0) + 1);
  const updateCounts = new Map<string, number>();
  if (ids.length) {
    for (const u of db.select({ itemId: updates.itemId }).from(updates).where(eq(updates.boardId, boardId)).all()) {
      updateCounts.set(u.itemId, (updateCounts.get(u.itemId) ?? 0) + 1);
    }
  }
  const accountUsers = db.select({ id: users.id, name: users.name, email: users.email, photoUrl: users.photoUrl, title: users.title, isAiAgent: users.isAiAgent })
    .from(users).where(and(eq(users.accountId, actor.accountId), eq(users.isActive, true))).orderBy(asc(users.name)).all();
  const accountTeams = db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.accountId, actor.accountId)).orderBy(asc(teams.name)).all();
  return {
    board: {
      id: board.id, workspaceId: board.workspaceId, folderId: board.folderId, name: board.name, description: board.description, kind: board.kind,
      visibility: board.visibility, ownerId: board.ownerId, settings: board.settings,
      isFavorite: !!db.select().from(favorites).where(and(eq(favorites.userId, actor.id), eq(favorites.boardId, boardId))).get(),
    },
    groups: activeGroups(boardId).map((g) => ({ id: g.id, boardId, title: g.title, color: g.color, position: g.position })),
    columns: boardColumns(boardId).filter((c) => !c.archived && !hiddenCols.has(c.id)).map((c) => ({ id: c.id, boardId, key: c.key, title: c.title, type: c.type, scope: c.scope, description: c.description, settings: c.settings, position: c.position, width: c.width, canEdit: can(actor, "column:edit", { boardId, columnId: c.id }) })),
    items: rows.map((r) => ({
      id: r.id, boardId, groupId: r.groupId, parentItemId: r.parentItemId, name: r.name, values: r.values, position: r.position, creatorId: r.creatorId,
      createdAt: r.createdAt, updatedAt: r.updatedAt, subitemCount: subCount.get(r.id) ?? 0, updateCount: updateCounts.get(r.id) ?? 0,
    })),
    views: viewsService.list(actor, boardId).map((v) => ({ id: v.id, boardId, name: v.name, type: v.type, settings: v.settings, filters: v.filters, sort: v.sort, position: v.position, ownerId: v.ownerId })),
    users: accountUsers,
    teams: accountTeams,
    permissions: (() => { const c = boards.canEdit(actor, boardId); return { editItems: c.items, editStructure: c.structure, comment: c.comment }; })(),
  };
}

/** Everything the sidebar needs, already permission filtered. */
export function getNavData(actor: Actor): NavData {
  const ws = workspaces.list(actor);
  const wsIds = ws.map((w) => w.id);
  const fl = wsIds.length ? db.select().from(folders).where(inArray(folders.workspaceId, wsIds)).orderBy(asc(folders.position)).all() : [];
  const bs = boards.list(actor);
  return {
    workspaces: ws.map((w) => ({ id: w.id, name: w.name, kind: w.kind, color: w.color, icon: w.icon })),
    folders: fl.map((f) => ({ id: f.id, workspaceId: f.workspaceId, parentFolderId: f.parentFolderId, name: f.name })),
    boards: bs.map((b) => ({ id: b.id, name: b.name, workspaceId: b.workspaceId, folderId: b.folderId, kind: b.kind })),
    favorites: boards.listFavorites(actor).map((b) => b.id),
  };
}

