/** Item search for the board-relation / dependency picker dialog. */
import { and, asc, eq, inArray, like, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { can } from "../../lib/permissions";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { boards, groups, items } from "../../db/schema/core";
import { parse } from "./_shared";

const input = z.object({ boardIds: z.array(idSchema).min(1).max(20), q: z.string().max(200).optional(), limit: z.number().int().min(1).max(200).default(50), excludeItemId: idSchema.optional() });

export interface ItemHit { id: string; name: string; boardId: string; boardName: string; groupTitle: string | null; groupColor: string | null }

export function searchItems(actor: Actor, query: unknown): ItemHit[] {
  const d = parse(input, query);
  const allowed = d.boardIds.filter((b) => can(actor, "board:view", { boardId: b }));
  if (!allowed.length) return [];
  const q = (d.q ?? "").trim().toLowerCase().replace(/[%_]/g, "");
  const rows = db.select({ id: items.id, name: items.name, boardId: items.boardId, boardName: boards.name, groupTitle: groups.title, groupColor: groups.color })
    .from(items).innerJoin(boards, eq(boards.id, items.boardId)).leftJoin(groups, eq(groups.id, items.groupId))
    .where(and(inArray(items.boardId, allowed), eq(items.state, "active"), isNull(items.parentItemId), q ? like(sql`lower(${items.name})`, `%${q}%`) : undefined))
    .orderBy(asc(items.boardId), asc(groups.position), asc(items.position)).limit(d.limit + 1).all();
  return rows.filter((r) => r.id !== d.excludeItemId).slice(0, d.limit);
}
