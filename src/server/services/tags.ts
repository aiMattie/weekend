/** Account-level tags for the `tags` column (table `tags`). */
import { and, asc, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError } from "../../lib/errors";
import { db } from "../../db/client";
import { tags } from "../../db/schema/columns";
import { HEX } from "../columns/labels";
import { parse } from "./_shared";

export type Tag = typeof tags.$inferSelect;
const PALETTE = ["#579bfc", "#00c875", "#fdab3d", "#a25ddc", "#ff158a", "#66ccff", "#cab641", "#df2f4a"];

const createInput = z.object({ name: z.string().trim().min(1).max(60), color: z.string().regex(HEX).optional() });
const updateInput = z.object({ name: z.string().trim().min(1).max(60).optional(), color: z.string().regex(HEX).optional() });

function requireWriter(actor: Actor): void {
  if (!actor.isSystem && (actor.role === "viewer" || actor.role === "guest")) throw new ForbiddenError("Not allowed to manage tags");
}

export function list(actor: Actor, query: { q?: string } = {}): Tag[] {
  const q = (query.q ?? "").trim().toLowerCase();
  return db.select().from(tags).where(and(eq(tags.accountId, actor.accountId), q ? like(sql`lower(${tags.name})`, `%${q.replace(/[%_]/g, "")}%`) : undefined)).orderBy(asc(tags.name)).all();
}

/** create_or_get_tag. */
export function createOrGet(actor: Actor, input: unknown): Tag {
  const d = parse(createInput, input);
  requireWriter(actor);
  const found = db.select().from(tags).where(and(eq(tags.accountId, actor.accountId), eq(sql`lower(${tags.name})`, d.name.toLowerCase()))).get();
  if (found) return found;
  const count = db.select({ n: sql<number>`count(*)` }).from(tags).where(eq(tags.accountId, actor.accountId)).get()?.n ?? 0;
  return db.insert(tags).values({ accountId: actor.accountId, name: d.name, color: d.color ?? PALETTE[count % PALETTE.length] }).returning().get();
}

export function update(actor: Actor, id: string, input: unknown): Tag {
  const d = parse(updateInput, input);
  requireWriter(actor);
  const cur = db.select().from(tags).where(and(eq(tags.id, id), eq(tags.accountId, actor.accountId))).get();
  if (!cur) throw new NotFoundError("Tag");
  return db.update(tags).set(d).where(eq(tags.id, id)).returning().get();
}

export function remove(actor: Actor, id: string): void {
  requireWriter(actor);
  const cur = db.select().from(tags).where(and(eq(tags.id, id), eq(tags.accountId, actor.accountId))).get();
  if (!cur) throw new NotFoundError("Tag");
  db.delete(tags).where(eq(tags.id, id)).run(); // values keep dangling ids; the read path drops unknown tags
}
