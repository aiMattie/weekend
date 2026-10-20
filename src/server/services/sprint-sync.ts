/**
 * Keeps `sprint_items` (history) in line with the `sprint` + status columns of the task boards.
 * The task board columns are the source of truth; this module records WHEN things changed.
 *  - `syncItem` is called by the bus hook below (accurate timestamps) and by `reconcile`
 *    (catches changes made while no hook was running, e.g. imports; timestamps = now).
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { subscribe } from "../../lib/events";
import { NotFoundError } from "../../lib/errors";
import { nowIso } from "../../lib/time";
import { boards, items } from "../../db/schema/core";
import { sprintItems, sprints, type SprintResult } from "../../db/schema/sprints";
import { devColumns, getDevSettings, loadTasks, readTask, relationItemIds, sourceBoardsOf, type DevColumns, type Task } from "./dev-config";
import { syncBug } from "./bugs";
import { epicIdsOfItem, syncEpics } from "./epic-lifecycle";
import type { HistRow } from "./sprint-metrics";

export type SprintRow = typeof sprints.$inferSelect;
export type SprintItemRow = typeof sprintItems.$inferSelect;

export function getSprintRow(sprintId: string): SprintRow {
  const s = db.select().from(sprints).where(eq(sprints.id, sprintId)).get();
  if (!s) throw new NotFoundError("Sprint");
  return s;
}

/** Remove everything that is not in a sprint "now" so `completed` rows stay frozen. */
const liveRowsOfItem = (itemId: string) =>
  db.select({ row: sprintItems, state: sprints.state }).from(sprintItems).innerJoin(sprints, eq(sprints.id, sprintItems.sprintId))
    .where(and(eq(sprintItems.itemId, itemId), isNull(sprintItems.removedAt))).all().filter((r) => r.state !== "completed").map((r) => r.row);

export function syncItem(itemId: string, at: string = nowIso()): void {
  const it = db.select().from(items).where(eq(items.id, itemId)).get();
  const open = liveRowsOfItem(itemId);
  if (!it || it.state !== "active" || it.parentItemId) {
    for (const r of open) db.update(sprintItems).set({ removedAt: at, outcome: "removed" }).where(eq(sprintItems.id, r.id)).run();
    return;
  }
  const cols = devColumns(it.boardId);
  if (!cols.sprint) return;
  const task = readTask(it, cols);
  closeLeftBehind(itemId, task.sprintId, at);
  let target = task.sprintId ? db.select().from(sprints).where(eq(sprints.id, task.sprintId)).get() : undefined;
  if (target?.state === "completed") target = undefined;
  for (const r of open) if (r.sprintId !== target?.id) db.update(sprintItems).set({ removedAt: at, outcome: "removed" }).where(eq(sprintItems.id, r.id)).run();
  if (!target) return;
  let row = open.find((r) => r.sprintId === target!.id);
  if (!row) {
    row = db.insert(sprintItems).values({ sprintId: target.id, itemId, boardId: it.boardId, addedAt: at, addedAfterStart: target.state === "active", points: task.points }).returning().get();
  }
  const patch: Partial<SprintItemRow> = {};
  if (row.points !== task.points) patch.points = task.points;
  if ((task.isStarted || task.isDone) && !row.startedAt) patch.startedAt = at;
  if (task.isDone && !row.doneAt) patch.doneAt = at;
  if (!task.isDone && row.doneAt) patch.doneAt = null;
  if (Object.keys(patch).length) db.update(sprintItems).set(patch).where(eq(sprintItems.id, row.id)).run();
}

/**
 * Rows still open in a COMPLETED sprint (imports, sprints closed without the complete dialog) are closed once
 * the task moves on: done work counts as done there, anything else as carried over. Keeps the sprint history
 * of a task complete (docs/decisions/0003-sprint-historie.md).
 */
function closeLeftBehind(itemId: string, currentSprintId: string | null, at: string): void {
  const rows = db.select({ row: sprintItems, state: sprints.state }).from(sprintItems).innerJoin(sprints, eq(sprints.id, sprintItems.sprintId))
    .where(and(eq(sprintItems.itemId, itemId), isNull(sprintItems.removedAt), isNull(sprintItems.outcome), eq(sprints.state, "completed"))).all();
  for (const { row } of rows) {
    if (row.sprintId === currentSprintId) continue;
    db.update(sprintItems).set({ removedAt: at, outcome: row.doneAt ? "done" : "carried" }).where(eq(sprintItems.id, row.id)).run();
  }
}

/**
 * Record that a task was in these (completed) sprints before, e.g. the earlier Jira sprints of an imported
 * issue. Idempotent: sprints that already have a row for the task, and sprints that are not completed, are skipped.
 */
export function recordPastSprints(itemId: string, sprintIds: Iterable<string>, points = 0): number {
  const ids = [...new Set(sprintIds)];
  if (!ids.length) return 0;
  const it = db.select({ boardId: items.boardId }).from(items).where(eq(items.id, itemId)).get();
  if (!it) return 0;
  const have = new Set(db.select({ s: sprintItems.sprintId }).from(sprintItems).where(eq(sprintItems.itemId, itemId)).all().map((r) => r.s));
  let n = 0;
  for (const s of db.select().from(sprints).where(and(inArray(sprints.id, ids), eq(sprints.state, "completed"))).all()) {
    if (have.has(s.id)) continue;
    const from = s.startedAt ?? (s.startsOn ? `${s.startsOn}T00:00:00.000Z` : nowIso());
    const to = s.completedAt ?? (s.endsOn ? `${s.endsOn}T23:59:59.000Z` : from);
    db.insert(sprintItems).values({ sprintId: s.id, itemId, boardId: it.boardId, addedAt: from, removedAt: to, outcome: "carried", points }).run();
    n++;
  }
  return n;
}

/** Re-sync every task of a sprints board (idempotent). */
export function reconcile(sprintsBoardId: string): void {
  const sources = sourceBoardsOf(sprintsBoardId);
  const ids = new Set<string>();
  for (const t of loadTasks(sources)) if (t.sprintId) ids.add(t.id);
  const sprintIds = db.select({ id: sprints.id }).from(sprints).where(and(eq(sprints.boardId, sprintsBoardId))).all().map((s) => s.id);
  if (sprintIds.length) for (const r of db.select({ itemId: sprintItems.itemId }).from(sprintItems).where(and(inArray(sprintItems.sprintId, sprintIds), isNull(sprintItems.removedAt))).all()) ids.add(r.itemId);
  for (const id of ids) syncItem(id);
}

/** History rows of a sprint enriched with the CURRENT assignees and klant of each item. */
export function histRows(sprintId: string, opts: { klant?: string | null } = {}): HistRow[] {
  const rows = db.select().from(sprintItems).where(eq(sprintItems.sprintId, sprintId)).orderBy(asc(sprintItems.addedAt)).all();
  if (!rows.length) return [];
  const its = new Map(db.select().from(items).where(inArray(items.id, rows.map((r) => r.itemId))).all().map((i) => [i.id, i]));
  const colCache = new Map<string, DevColumns>();
  const out: HistRow[] = [];
  for (const r of rows) {
    const it = its.get(r.itemId);
    if (!it) continue;
    const cols = colCache.get(it.boardId) ?? devColumns(it.boardId);
    colCache.set(it.boardId, cols);
    const t: Task = readTask(it, cols);
    if (opts.klant && t.klant !== opts.klant) continue;
    out.push({ itemId: r.itemId, addedAt: r.addedAt, removedAt: r.removedAt, addedAfterStart: r.addedAfterStart, points: r.points, startedAt: r.startedAt, doneAt: r.doneAt, outcome: r.outcome, assignees: t.assigneeIds, klant: t.klant });
  }
  return out;
}

export type { SprintResult };

/* ------------------------------------------------------------------ bus hook */

const g = globalThis as unknown as { __devHooks?: boolean; __devSync?: (itemId: string) => void; __devSuspend?: number };
g.__devSync = (id) => { syncItem(id); syncBug(id); };

/** Run `fn` without the bus hook (the caller does its own bookkeeping). */
export function withoutHooks<T>(fn: () => T): T {
  g.__devSuspend = (g.__devSuspend ?? 0) + 1;
  try { return fn(); } finally { g.__devSuspend = (g.__devSuspend ?? 1) - 1; }
}

const isSourceBoard = (boardId: string): boolean => {
  const b = db.select().from(boards).where(eq(boards.id, boardId)).get();
  const role = b ? getDevSettings(b)?.role : undefined;
  return role === "tasks" || role === "bugs";
};

export function ensureDevHooks(): void {
  if (g.__devHooks) return;
  g.__devHooks = true;
  subscribe((e) => {
    if (g.__devSuspend) return;
    if (!e.boardId || !("itemId" in e)) return;
    if (!["column_value.changed", "item.created", "item.deleted", "item.archived", "item.moved"].includes(e.type)) return;
    if (!isSourceBoard(e.boardId) && e.type !== "item.deleted") return;
    try { g.__devSync?.((e as { itemId: string }).itemId); } catch (err) { console.error("[dev] sprint sync failed", err); }
    try {
      const epics = epicIdsOfItem(e.itemId);
      // an unlinked epic also needs a recompute: take the previous value of the Epic column
      if (e.type === "column_value.changed" && e.columnId === devColumns(e.boardId).epic?.id) epics.push(...relationItemIds(e.from));
      syncEpics(epics);
    } catch (err) { console.error("[dev] epic sync failed", err); }
  });
}
ensureDevHooks();
