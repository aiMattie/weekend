/**
 * Epic status follows its tasks (docs/decisions/0002-epic-levenscyclus.md):
 *  - every linked task done                      -> Afgerond
 *  - an open linked task in the active sprint    -> Actief
 *  - otherwise, when the epic was Actief/Afgerond -> Gepland (work left, nothing in the sprint)
 * Geparkeerd epics and epics without tasks are never touched. Called by the dev bus hook
 * (task changes) and after a sprint starts or completes.
 */
import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { db } from "../../db/client";
import { boards, items, workspaces } from "../../db/schema/core";
import { sprints } from "../../db/schema/sprints";
import { systemActor } from "../../lib/actor";
import { statusLabels } from "../columns/labels";
import { devColumns, getDevSettings, readTask, relationItemIds, sourceBoardsOf } from "./dev-config";
import * as itemsSvc from "./items";

export const EPIC_STATUS = { planned: "Gepland", active: "Actief", done: "Afgerond", parked: "Geparkeerd" } as const;

/** The status an epic should get, or null to leave it as is. Pure so it can be tested on its own. */
export function nextEpicStatus(current: string | null, tasks: { isDone: boolean; inActiveSprint: boolean }[]): string | null {
  if (current === EPIC_STATUS.parked || !tasks.length) return null;
  const want = tasks.every((t) => t.isDone) ? EPIC_STATUS.done
    : tasks.some((t) => !t.isDone && t.inActiveSprint) ? EPIC_STATUS.active
    : current === EPIC_STATUS.active || current === EPIC_STATUS.done ? EPIC_STATUS.planned
    : null;
  return want && want !== current ? want : null;
}

/** Recompute the status of the given epic items. Returns the epics that changed. */
export function syncEpics(epicIds: Iterable<string>): { id: string; from: string | null; to: string }[] {
  const ids = [...new Set(epicIds)];
  if (!ids.length) return [];
  const changed: { id: string; from: string | null; to: string }[] = [];
  for (const epic of db.select().from(items).where(and(inArray(items.id, ids), eq(items.state, "active"))).all()) {
    const board = db.select().from(boards).where(eq(boards.id, epic.boardId)).get();
    const dev = board ? getDevSettings(board) : undefined;
    if (!board || dev?.role !== "epics" || !dev.sprintsBoardId) continue;
    const status = devColumns(board.id).status;
    if (!status) continue;
    const idx = (epic.values[status.id] as { index?: number } | undefined)?.index;
    const current = statusLabels(status.settings).find((l) => l.id === idx)?.text ?? null;
    const active = db.select({ id: sprints.id }).from(sprints).where(and(eq(sprints.boardId, dev.sprintsBoardId), eq(sprints.state, "active"))).get()?.id;
    const tasks = linkedTasks(epic.id, sourceBoardsOf(dev.sprintsBoardId)).map((t) => ({ isDone: t.isDone, inActiveSprint: !!active && t.sprintId === active }));
    const to = nextEpicStatus(current, tasks);
    if (!to || !statusLabels(status.settings).some((l) => l.text === to)) continue;
    const accountId = db.select({ a: workspaces.accountId }).from(workspaces).where(eq(workspaces.id, board.workspaceId)).get()!.a;
    itemsSvc.changeColumnValue(systemActor(accountId), epic.id, status.id, to);
    changed.push({ id: epic.id, from: current, to });
  }
  return changed;
}

/** Active top-level tasks on the source boards whose Epic column links to `epicId`. */
function linkedTasks(epicId: string, sourceBoardIds: string[]) {
  if (!sourceBoardIds.length) return [];
  const rows = db.select().from(items).where(and(inArray(items.boardId, sourceBoardIds), eq(items.state, "active"), isNull(items.parentItemId), like(items.values, `%${epicId}%`))).all();
  const cols = new Map(sourceBoardIds.map((b) => [b, devColumns(b)]));
  return rows.map((r) => readTask(r, cols.get(r.boardId)!, new Map())).filter((t) => t.epicIds.includes(epicId));
}

/** Epic ids a task item links to (also for archived/deleted items, from their stored values). */
export function epicIdsOfItem(itemId: string): string[] {
  const it = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!it) return [];
  const col = devColumns(it.boardId).epic;
  return col ? relationItemIds(it.values[col.id]) : [];
}

/** Recompute every epic of the epics board behind a sprints board (after a sprint starts or completes). */
export function syncEpicsOfSprintsBoard(sprintsBoardId: string): void {
  const b = db.select().from(boards).where(eq(boards.id, sprintsBoardId)).get();
  const epicsBoardId = b ? getDevSettings(b)?.epicsBoardId : undefined;
  if (!epicsBoardId) return;
  syncEpics(db.select({ id: items.id }).from(items).where(and(eq(items.boardId, epicsBoardId), eq(items.state, "active"))).all().map((r) => r.id));
}
