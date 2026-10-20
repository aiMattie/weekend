/** Recently visited boards per user (home page and sidebar). */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Actor } from "../../lib/actor";
import { boardVisibilityFilter } from "../../lib/permissions";
import { nowIso } from "../../lib/time";
import { db } from "../../db/client";
import { boards } from "../../db/schema/core";
import { recentBoards } from "../../db/schema/table-ux";
import { requireBoard } from "./_shared";

export function visit(actor: Actor, boardId: string): void {
  if (actor.isSystem) return;
  requireBoard(actor, boardId, "board:view");
  db.insert(recentBoards).values({ userId: actor.id, boardId, visitedAt: nowIso() })
    .onConflictDoUpdate({ target: [recentBoards.userId, recentBoards.boardId], set: { visitedAt: nowIso() } }).run();
}

/** Most recently visited active boards the actor can still see. */
export function list(actor: Actor, limit = 10) {
  if (actor.isSystem) return [];
  const rows = db.select().from(recentBoards).where(eq(recentBoards.userId, actor.id)).orderBy(desc(recentBoards.visitedAt)).limit(Math.max(limit * 3, 30)).all();
  if (!rows.length) return [];
  const visible = boardVisibilityFilter(actor);
  const bs = db.select().from(boards).where(and(inArray(boards.id, rows.map((r) => r.boardId)), eq(boards.state, "active"))).all().filter((b) => visible(b));
  const byId = new Map(bs.map((b) => [b.id, b]));
  return rows.map((r) => ({ board: byId.get(r.boardId), visitedAt: r.visitedAt })).filter((r): r is { board: (typeof bs)[number]; visitedAt: string } => !!r.board).slice(0, limit);
}
