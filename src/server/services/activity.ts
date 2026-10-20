import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { db } from "../../db/client";
import { activityLog } from "../../db/schema/core";
import { getItemRow, parse, requireBoard } from "./_shared";

export { activityForItem } from "./updates";

/** Board-level activity log, newest first. */
export function activityForBoard(actor: Actor, boardId: string, limit = 200) {
  requireBoard(actor, boardId, "board:view");
  return db.select().from(activityLog).where(eq(activityLog.boardId, boardId)).orderBy(desc(activityLog.createdAt), desc(activityLog.id)).limit(limit).all();
}

const filterSchema = z.object({
  columnId: z.string().optional(),
  userId: z.string().optional(),
  event: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/** Item activity log with optional filters (column, person, event type). Newest first. */
export function listForItem(actor: Actor, itemId: string, raw: unknown = {}) {
  const f = parse(filterSchema, raw);
  const it = getItemRow(itemId);
  requireBoard(actor, it.boardId, "board:view");
  return db.select().from(activityLog).where(and(
    eq(activityLog.itemId, itemId),
    f.columnId ? eq(activityLog.columnId, f.columnId) : undefined,
    f.userId ? eq(activityLog.userId, f.userId) : undefined,
    f.event ? eq(activityLog.event, f.event) : undefined,
  )).orderBy(desc(activityLog.createdAt), desc(activityLog.id)).limit(f.limit).all();
}

/** Board activity with the same filters (plus itemId). */
export function listForBoard(actor: Actor, boardId: string, raw: unknown = {}) {
  const f = parse(filterSchema.extend({ itemId: z.string().optional() }), raw);
  requireBoard(actor, boardId, "board:view");
  return db.select().from(activityLog).where(and(
    eq(activityLog.boardId, boardId),
    f.itemId ? eq(activityLog.itemId, f.itemId) : undefined,
    f.columnId ? eq(activityLog.columnId, f.columnId) : undefined,
    f.userId ? eq(activityLog.userId, f.userId) : undefined,
    f.event ? eq(activityLog.event, f.event) : undefined,
  )).orderBy(desc(activityLog.createdAt), desc(activityLog.id)).limit(f.limit).all();
}
