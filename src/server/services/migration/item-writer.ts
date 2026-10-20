/**
 * Bulk item insertion for the Jira migration: validates values through the column registry
 * (items.normalizeValues) but inserts rows directly, so history keeps its dates and the migration does
 * not fire assignment notifications or automations for thousands of rows.
 */
import { and, asc, eq } from "drizzle-orm";
import type { Actor } from "../../../lib/actor";
import { db } from "../../../db/client";
import { columns, groups, items } from "../../../db/schema/core";
import { makeRelationValue, relationIds, type RelationValue } from "../../columns/relation-base";
import { ensureSubitemColumns, normalizeValues } from "../items";
import { resolveColumn } from "../_shared";

export interface NewItem {
  boardId: string; groupId?: string | null; parentItemId?: string | null; name: string;
  /** values keyed by column key or id (validated by the column logic) */
  raw?: Record<string, unknown>;
  createdAt?: string; updatedAt?: string; creatorId?: string | null; state?: "active" | "archived";
}

function lastPosition(boardId: string, groupId: string | null, parentItemId: string | null): number {
  const rows = db.select({ p: items.position }).from(items).where(and(eq(items.boardId, boardId), parentItemId ? eq(items.parentItemId, parentItemId) : groupId ? eq(items.groupId, groupId) : undefined)).orderBy(asc(items.position)).all();
  return rows.length ? rows[rows.length - 1].p + 1000 : 1000;
}

export function firstActiveGroup(boardId: string): string | null {
  return db.select({ id: groups.id }).from(groups).where(and(eq(groups.boardId, boardId), eq(groups.state, "active"))).orderBy(asc(groups.position)).get()?.id ?? null;
}

/**
 * Direct inserts bypass the two-way relation sync of items.changeColumnValue, so mirror the links on
 * the peer side here (needed for the hours roll-up). `before` = previous values (updates), to drop stale back-links.
 */
export function syncPeers(itemId: string, before: Record<string, unknown> = {}): void {
  const it = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!it) return;
  for (const col of db.select().from(columns).where(and(eq(columns.boardId, it.boardId), eq(columns.type, "board_relation"))).all()) {
    const peerId = col.settings.peerColumnId as string | undefined;
    if (!peerId) continue;
    const now = relationIds(it.values[col.id] as RelationValue | undefined);
    const prev = relationIds(before[col.id] as RelationValue | undefined);
    const touch = (targetId: string, add: boolean) => {
      const t = db.select().from(items).where(eq(items.id, targetId)).get();
      if (!t) return;
      const cur = relationIds(t.values[peerId] as RelationValue | undefined);
      const next = add ? (cur.includes(itemId) ? cur : [...cur, itemId]) : cur.filter((x) => x !== itemId);
      if (next.length === cur.length) return;
      const values = { ...t.values };
      const v = makeRelationValue(next);
      if (v) values[peerId] = v; else delete values[peerId];
      db.update(items).set({ values }).where(eq(items.id, targetId)).run();
    };
    for (const id of now) touch(id, true);
    for (const id of prev.filter((x) => !now.includes(x))) touch(id, false);
  }
}

export function createItemRow(_actor: Actor, n: NewItem): typeof items.$inferSelect {
  const scope = n.parentItemId ? "subitem" : "item";
  if (n.parentItemId) ensureSubitemColumns(n.boardId);
  const groupId = n.groupId ?? (n.parentItemId ? db.select().from(items).where(eq(items.id, n.parentItemId)).get()?.groupId ?? null : firstActiveGroup(n.boardId));
  const { values } = normalizeValues(n.boardId, scope, n.raw ?? {});
  const row = db.insert(items).values({
    boardId: n.boardId, groupId, parentItemId: n.parentItemId ?? null, name: n.name, values, position: lastPosition(n.boardId, groupId, n.parentItemId ?? null),
    state: n.state ?? "active", creatorId: n.creatorId ?? null, ...(n.createdAt ? { createdAt: n.createdAt } : {}), updatedAt: n.updatedAt ?? n.createdAt ?? new Date().toISOString(),
  }).returning().get();
  syncPeers(row.id);
  return row;
}

/** Merge raw values (validated) into an existing row without touching other columns. */
export function patchItemRow(id: string, patch: { name?: string; groupId?: string | null; raw?: Record<string, unknown>; updatedAt?: string; state?: "active" | "archived" }): void {
  const cur = db.select().from(items).where(eq(items.id, id)).get();
  if (!cur) return;
  const scope = cur.parentItemId ? "subitem" : "item";
  const { values } = normalizeValues(cur.boardId, scope, patch.raw ?? {});
  const merged = { ...cur.values, ...values };
  // explicit nulls clear the column
  for (const [k, v] of Object.entries(patch.raw ?? {})) if (v === null || v === "") delete merged[resolveColumn(cur.boardId, k, scope).id];
  db.update(items).set({ name: patch.name ?? cur.name, groupId: patch.groupId === undefined ? cur.groupId : patch.groupId, values: merged, updatedAt: patch.updatedAt ?? new Date().toISOString(), ...(patch.state ? { state: patch.state } : {}) }).where(eq(items.id, id)).run();
  syncPeers(id, cur.values);
}
