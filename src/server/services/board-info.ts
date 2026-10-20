/** Read model for the board info panel. */
import { and, eq } from "drizzle-orm";
import type { Actor } from "../../lib/actor";
import { db } from "../../db/client";
import { boardMembers, folders, items, users, views, workspaces } from "../../db/schema/core";
import { activeGroups } from "./groups";
import { boardColumns, requireBoard } from "./_shared";

export function info(actor: Actor, boardId: string) {
  const b = requireBoard(actor, boardId, "board:view");
  const owner = b.ownerId ? db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, b.ownerId)).get() ?? null : null;
  const rows = db.select({ parentItemId: items.parentItemId }).from(items).where(and(eq(items.boardId, boardId), eq(items.state, "active"))).all();
  return {
    id: b.id, name: b.name, description: b.description, kind: b.kind, visibility: b.visibility, createdAt: b.createdAt, updatedAt: b.updatedAt,
    workspace: db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(eq(workspaces.id, b.workspaceId)).get() ?? null,
    folder: b.folderId ? db.select({ id: folders.id, name: folders.name }).from(folders).where(eq(folders.id, b.folderId)).get() ?? null : null,
    owner,
    counts: {
      items: rows.filter((r) => !r.parentItemId).length,
      subitems: rows.filter((r) => r.parentItemId).length,
      groups: activeGroups(boardId).length,
      columns: boardColumns(boardId, "item").filter((c) => !c.archived).length,
      members: db.select({ u: boardMembers.userId }).from(boardMembers).where(eq(boardMembers.boardId, boardId)).all().length,
      views: db.select({ id: views.id }).from(views).where(eq(views.boardId, boardId)).all().length,
    },
  };
}
