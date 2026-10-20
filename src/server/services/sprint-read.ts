/**
 * Read side of the sprint service: DTOs, sprint lists, sprint boards, options for the Sprint column.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Actor } from "../../lib/actor";
import { NotFoundError, ValidationError } from "../../lib/errors";
import { db } from "../../db/client";
import { boards, items } from "../../db/schema/core";
import { sprintItems, sprints, type SprintState } from "../../db/schema/sprints";
import { statusLabels } from "../columns/labels";
import { boardColumns, requireBoard } from "./_shared";
import { activeGroups } from "./groups";
import { devColumns, getDevSettings, loadEpicInfo, loadTasks, sourceBoardsOf, sprintsBoardFor, type EpicInfo, type Task } from "./dev-config";
import { getSprintRow, histRows, reconcile, type SprintRow } from "./sprint-sync";

export interface SprintDto {
  id: string;
  boardId: string;
  itemId: string | null;
  name: string;
  goal: string | null;
  state: SprintState;
  startsOn: string | null;
  endsOn: string | null;
  startedAt: string | null;
  completedAt: string | null;
  position: number;
  committed: SprintRow["committed"];
  result: SprintRow["result"];
  counts: { count: number; points: number; doneCount: number; donePoints: number };
}

/* ------------------------------------------------------------------ reading */

export function toDto(row: SprintRow): SprintDto {
  const it = row.itemId ? db.select({ name: items.name, state: items.state }).from(items).where(eq(items.id, row.itemId)).get() : undefined;
  const rows = histRows(row.id).filter((r) => r.outcome !== "removed");
  const done = rows.filter((r) => r.doneAt);
  const sum = (xs: { points: number }[]) => Math.round(xs.reduce((s, r) => s + r.points, 0) * 10) / 10;
  return {
    id: row.id, boardId: row.boardId, itemId: row.itemId, name: it?.name ?? row.name, goal: row.goal, state: row.state, startsOn: row.startsOn, endsOn: row.endsOn,
    startedAt: row.startedAt, completedAt: row.completedAt, position: row.position, committed: row.committed, result: row.result,
    counts: { count: rows.length, points: sum(rows), doneCount: done.length, donePoints: sum(done) },
  };
}

export function sprintsBoard(actor: Actor, boardId: string, action: "board:view" | "board:edit_items") {
  const b = requireBoard(actor, boardId, action);
  if (b.kind !== "dev_sprints") throw new ValidationError("Board is not a sprint board");
  return b;
}

/** Sprints board items without a sprint row (created through the table / importer) get one. */
export function adoptSprintItems(boardId: string): void {
  const known = new Set(db.select({ itemId: sprints.itemId }).from(sprints).where(eq(sprints.boardId, boardId)).all().map((s) => s.itemId));
  const cols = devColumns(boardId);
  const tl = boardColumns(boardId, "item").find((c) => c.key === "tijdlijn" || c.type === "timeline");
  let pos = db.select({ p: sprints.position }).from(sprints).where(eq(sprints.boardId, boardId)).all().reduce((m, r) => Math.max(m, r.p), 0);
  for (const it of db.select().from(items).where(and(eq(items.boardId, boardId), eq(items.state, "active"), isNull(items.parentItemId))).orderBy(asc(items.position)).all()) {
    if (known.has(it.id)) continue;
    const sv = cols.status ? (it.values[cols.status.id] as { index: number } | undefined) : undefined;
    const label = cols.status && sv ? statusLabels(cols.status.settings).find((l) => l.id === sv.index)?.text.toLowerCase() : "";
    const range = tl ? (it.values[tl.id] as { from?: string; to?: string } | undefined) : undefined;
    pos += 1000;
    db.insert(sprints).values({ boardId, itemId: it.id, name: it.name, state: label === "actief" ? "active" : label === "afgerond" ? "completed" : "planned", startsOn: range?.from ?? null, endsOn: range?.to ?? null, position: pos }).run();
  }
  // sprint items that were deleted/archived: drop planned sprints, keep history of the rest
  for (const s of db.select().from(sprints).where(eq(sprints.boardId, boardId)).all()) {
    if (!s.itemId) continue;
    const it = db.select({ state: items.state }).from(items).where(eq(items.id, s.itemId)).get();
    if ((!it || it.state === "deleted") && s.state === "planned") db.delete(sprints).where(eq(sprints.id, s.id)).run();
  }
}

export function listSprints(actor: Actor, boardId: string): SprintDto[] {
  sprintsBoard(actor, boardId, "board:view");
  adoptSprintItems(boardId);
  reconcile(boardId);
  return db.select().from(sprints).where(eq(sprints.boardId, boardId)).orderBy(asc(sprints.position), asc(sprints.createdAt)).all().map(toDto);
}

export function getSprint(actor: Actor, sprintId: string): SprintDto {
  const s = getSprintRow(sprintId);
  requireBoard(actor, s.boardId, "board:view");
  return toDto(s);
}

export function listSprintBoards(actor: Actor): { id: string; name: string; workspaceId: string; sourceBoardIds: string[] }[] {
  return db.select().from(boards).where(and(eq(boards.kind, "dev_sprints"), eq(boards.state, "active"))).all()
    .filter((b) => { try { requireBoard(actor, b.id, "board:view"); return true; } catch { return false; } })
    .map((b) => ({ id: b.id, name: b.name, workspaceId: b.workspaceId, sourceBoardIds: sourceBoardsOf(b.id) }));
}

export function activeSprint(actor: Actor, boardId: string): SprintDto | null {
  return listSprints(actor, boardId).find((s) => s.state === "active") ?? null;
}

/** Sprints a task of `boardId` (sprints board or source board) can be assigned to. */
export function sprintOptions(actor: Actor, boardId: string): { id: string; name: string; state: SprintState; startsOn: string | null; endsOn: string | null }[] {
  requireBoard(actor, boardId, "board:view");
  const sb = sprintsBoardFor(boardId);
  if (!sb) return [];
  adoptSprintItems(sb);
  return db.select().from(sprints).where(eq(sprints.boardId, sb)).orderBy(asc(sprints.position)).all().map((s) => {
    const d = toDtoLite(s);
    return { id: s.id, name: d, state: s.state, startsOn: s.startsOn, endsOn: s.endsOn };
  });
}
export const toDtoLite = (s: SprintRow): string => (s.itemId ? db.select({ name: items.name }).from(items).where(eq(items.id, s.itemId)).get()?.name : undefined) ?? s.name;


/* ------------------------------------------------------------------ planning read model */

const PRIO_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

export interface Planning {
  sprintsBoardId: string;
  sourceBoardIds: string[];
  /** where new tasks are created from the planning view */
  taskBoard: { id: string; groupId: string } | null;
  estimateUnit: "hours" | "points";
  sprints: (SprintDto & { tasks: Task[] })[];
  backlog: Task[];
  klanten: string[];
  /** every epic of the epics board; the UI hides Afgerond/Geparkeerd ones unless asked */
  epics: ({ id: string } & EpicInfo)[];
  /** item id -> number of completed sprints the task was in (only items with at least one) */
  pastSprints: Record<string, number>;
  statuses: { text: string; color: string; isDone: boolean }[];
}

/** Sprints (planned + active, with their tasks) and the backlog of the team's source boards. */
export function planning(actor: Actor, boardId: string): Planning {
  requireBoard(actor, boardId, "board:view");
  const sb = sprintsBoardFor(boardId);
  if (!sb) throw new ValidationError("Dit board hoort niet bij een sprintbord");
  const list = listSprints(actor, sb);
  const sources = sourceBoardsOf(sb);
  const tasks = loadTasks(sources);
  const settings = getDevSettings(db.select().from(boards).where(eq(boards.id, sb)).get()!);
  const tb = settings?.tasksBoardId ?? sources[0];
  const group = tb ? activeGroups(tb)[0] : undefined;
  const klanten = new Set<string>();
  for (const id of sources) for (const l of ((devColumns(id).klant?.settings.labels as { text: string }[] | undefined) ?? [])) klanten.add(l.text);
  const epicBoard = settings?.epicsBoardId;
  const epics = epicBoard ? [...loadEpicInfo({ boardIds: [epicBoard] })].map(([id, e]) => ({ id, ...e })) : [];
  const open = list.filter((s) => s.state !== "completed");
  const live = new Set(open.map((s) => s.id));
  return {
    sprintsBoardId: sb, sourceBoardIds: sources, taskBoard: tb && group ? { id: tb, groupId: group.id } : null,
    estimateUnit: settings?.estimateUnit ?? "hours",
    sprints: open.map((s) => ({ ...s, tasks: tasks.filter((t) => t.sprintId === s.id) })),
    // open work still pointing at a completed sprint would be invisible: it belongs in the backlog
    backlog: tasks.filter((t) => !t.isDone && (!t.sprintId || !live.has(t.sprintId))).sort((a, b) => (PRIO_RANK[a.prioriteit ?? ""] ?? 9) - (PRIO_RANK[b.prioriteit ?? ""] ?? 9) || a.position - b.position),
    klanten: [...klanten].sort((a, b) => a.localeCompare(b)), epics,
    pastSprints: pastSprintCounts(sb),
    statuses: (tb ? statusLabels(devColumns(tb).status?.settings ?? {}) : []).map((l) => ({ text: l.text, color: l.color, isDone: !!l.isDone })),
  };
}

/** Per item: in how many completed sprints of this sprints board it has been. */
function pastSprintCounts(sprintsBoardId: string): Record<string, number> {
  const out: Record<string, number> = {};
  const rows = db.select({ itemId: sprintItems.itemId, sprintId: sprintItems.sprintId }).from(sprintItems).innerJoin(sprints, eq(sprints.id, sprintItems.sprintId))
    .where(and(eq(sprints.boardId, sprintsBoardId), eq(sprints.state, "completed"))).all();
  const seen = new Set<string>();
  for (const r of rows) {
    const k = `${r.itemId}:${r.sprintId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out[r.itemId] = (out[r.itemId] ?? 0) + 1;
  }
  return out;
}

export type SprintStint = "done" | "carried" | "removed" | "current" | "open";
export interface SprintHistoryRow { sprintId: string; name: string; state: SprintState; startsOn: string | null; endsOn: string | null; addedAt: string; removedAt: string | null; points: number; result: SprintStint }

/**
 * Every sprint a task has been in, oldest first, with what happened there: done, carried over to a later sprint,
 * removed from the sprint, current (live sprint) or open (left in a completed sprint, not moved on yet).
 */
export function sprintHistory(actor: Actor, itemId: string): { itemId: string; sprints: SprintHistoryRow[]; carried: number } {
  const it = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!it) throw new NotFoundError("Item");
  requireBoard(actor, it.boardId, "board:view");
  const rows = db.select({ row: sprintItems, s: sprints }).from(sprintItems).innerJoin(sprints, eq(sprints.id, sprintItems.sprintId))
    .where(eq(sprintItems.itemId, itemId)).orderBy(asc(sprints.startsOn), asc(sprints.position), asc(sprintItems.addedAt)).all();
  const list: SprintHistoryRow[] = rows.map(({ row, s }) => ({
    sprintId: s.id, name: s.name, state: s.state, startsOn: s.startsOn, endsOn: s.endsOn, addedAt: row.addedAt, removedAt: row.removedAt, points: row.points,
    result: row.outcome ?? (s.state === "completed" ? (row.doneAt ? "done" : "open") : row.removedAt ? "removed" : row.doneAt ? "done" : "current"),
  }));
  return { itemId, sprints: list, carried: list.filter((r) => r.result === "carried").length };
}

export interface DevOverview {
  id: string;
  name: string;
  workspaceId: string;
  boards: { sprints: string; tasks?: string; bugs?: string; epics?: string; retros?: string };
  activeSprint: SprintDto | null;
  plannedCount: number;
  backlogCount: number;
}

/** One card per team sprint board for the /dev hub page. */
export function overview(actor: Actor): DevOverview[] {
  return listSprintBoards(actor).map((b) => {
    const s = getDevSettings(db.select().from(boards).where(eq(boards.id, b.id)).get()!);
    const list = listSprints(actor, b.id);
    const tasks = loadTasks(b.sourceBoardIds);
    return {
      id: b.id, name: b.name, workspaceId: b.workspaceId,
      boards: { sprints: b.id, tasks: s?.tasksBoardId, bugs: s?.bugsBoardId, epics: s?.epicsBoardId, retros: s?.retroBoardId },
      activeSprint: list.find((x) => x.state === "active") ?? null,
      plannedCount: list.filter((x) => x.state === "planned").length,
      backlogCount: tasks.filter((t) => !t.sprintId && !t.isDone).length,
    };
  });
}
