/**
 * Worklog per item (time entries). Shown in the item panel tab "Uren"; the Urenregistratie sync
 * (later) reads unsynced entries through `listUnsynced` and marks them with `markSynced`.
 */
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { nowIso } from "../../lib/time";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { users } from "../../db/schema/core";
import { timeEntries } from "../../db/schema/time-entries";
import { getItemRow, parse, requireBoard } from "./_shared";
import { dayOf } from "./sprint-metrics";

export type TimeEntry = typeof timeEntries.$inferSelect;
export interface TimeEntryDto extends TimeEntry { userName: string | null }

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const createInput = z.object({
  itemId: idSchema,
  date: dateStr.optional(),
  /** either minutes or hours */
  minutes: z.number().int().min(1).max(24 * 60).optional(),
  hours: z.number().positive().max(24).optional(),
  description: z.string().trim().max(1000).nullish(),
  billable: z.boolean().default(true),
  source: z.enum(["manual", "timer", "jip"]).default("manual"),
  /** system actors (importers, integrations) write on behalf of a user */
  userId: idSchema.optional(),
});

export function create(actor: Actor, input: unknown): TimeEntryDto {
  const d = parse(createInput, input);
  const item = getItemRow(d.itemId);
  requireBoard(actor, item.boardId, "board:edit_items");
  const minutes = d.minutes ?? (d.hours ? Math.round(d.hours * 60) : undefined);
  if (!minutes) throw new ValidationError("Geef minuten of uren op");
  const userId = actor.isSystem ? d.userId ?? null : actor.id;
  const row = db.insert(timeEntries).values({
    itemId: d.itemId, boardId: item.boardId, userId, date: d.date ?? dayOf(nowIso()), minutes, description: d.description ?? null, billable: d.billable, source: d.source,
  }).returning().get();
  return withName(actor, [row])[0];
}

function withName(actor: Actor, rows: TimeEntry[]): TimeEntryDto[] {
  const names = new Map(db.select({ id: users.id, name: users.name }).from(users).where(eq(users.accountId, actor.accountId)).all().map((u) => [u.id, u.name]));
  return rows.map((r) => ({ ...r, userName: r.userId ? names.get(r.userId) ?? null : null }));
}

export function list(actor: Actor, itemId: string): { entries: TimeEntryDto[]; totalMinutes: number; billableMinutes: number } {
  const item = getItemRow(itemId);
  requireBoard(actor, item.boardId, "board:view");
  const rows = db.select().from(timeEntries).where(eq(timeEntries.itemId, itemId)).orderBy(desc(timeEntries.date), desc(timeEntries.createdAt)).all();
  return { entries: withName(actor, rows), totalMinutes: rows.reduce((s, r) => s + r.minutes, 0), billableMinutes: rows.filter((r) => r.billable).reduce((s, r) => s + r.minutes, 0) };
}

export function remove(actor: Actor, entryId: string): void {
  const e = db.select().from(timeEntries).where(eq(timeEntries.id, entryId)).get();
  if (!e) throw new NotFoundError("Time entry");
  requireBoard(actor, e.boardId, "board:edit_items");
  if (!actor.isSystem && actor.role !== "admin" && e.userId !== actor.id) throw new ForbiddenError("Je kunt alleen je eigen uren verwijderen");
  if (e.syncedAt) throw new ValidationError("Deze uren zijn al doorgezet naar Urenregistratie");
  db.delete(timeEntries).where(eq(timeEntries.id, entryId)).run();
}

/** Entries not yet synced to the Urenregistratie board, optionally for a period / user. */
export function listUnsynced(actor: Actor, opts: { from?: string; to?: string; userId?: string } = {}): TimeEntryDto[] {
  const rows = db.select().from(timeEntries).where(and(
    isNull(timeEntries.syncedAt), opts.from ? gte(timeEntries.date, opts.from) : undefined, opts.to ? lte(timeEntries.date, opts.to) : undefined,
    opts.userId ? eq(timeEntries.userId, opts.userId) : undefined,
  )).orderBy(asc(timeEntries.date)).all();
  return withName(actor, rows.filter((r) => { try { requireBoard(actor, r.boardId, "board:view"); return true; } catch { return false; } }));
}

export function markSynced(actor: Actor, entryIds: string[], syncedItemId: string): void {
  if (!actor.isSystem && actor.role !== "admin") throw new ForbiddenError();
  for (const id of entryIds) db.update(timeEntries).set({ syncedItemId, syncedAt: nowIso() }).where(eq(timeEntries.id, id)).run();
}
