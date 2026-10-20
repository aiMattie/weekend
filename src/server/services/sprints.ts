/**
 * Sprint lifecycle (module D / dev): one sprint board per team, tasks carry Klant + Epic + Sprint.
 *   create -> (assign tasks) -> start -> (work, scope changes) -> complete (carry over unfinished work)
 * A sprint is a row in `sprints` AND an item on the dev_sprints board (status + timeline kept in sync),
 * so tables, automations and the API see sprints as normal items.
 * Reports (burndown, velocity, summary, standup) live in ./sprint-reports and are re-exported here.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors";
import { nowIso } from "../../lib/time";
import { idSchema, nameSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { items } from "../../db/schema/core";
import { sprintItems, sprints, type SprintResult, type SprintState } from "../../db/schema/sprints";
import { activeGroups } from "./groups";
import * as itemsSvc from "./items";
import { boardColumns, parse, record, requireBoard } from "./_shared";
import { devColumns, loadTasks, sourceBoardsOf, sprintsBoardFor, type Task } from "./dev-config";
import { addDays, dayOf, nextSprintDates, scopeChange } from "./sprint-metrics";
import { adoptSprintItems, sprintsBoard, toDto, toDtoLite, type SprintDto } from "./sprint-read";
import { syncEpicsOfSprintsBoard } from "./epic-lifecycle";
import { ensureDevHooks, getSprintRow, histRows, reconcile, syncItem, withoutHooks, type SprintRow } from "./sprint-sync";

ensureDevHooks();
export { getSprintRow, reconcile, syncItem } from "./sprint-sync";
export * from "./sprint-reports";
export * from "./sprint-read";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const createInput = z.object({ boardId: idSchema, name: nameSchema.optional(), goal: z.string().max(2000).nullish(), startsOn: dateStr.optional(), endsOn: dateStr.optional() });
const updateInput = z.object({ name: nameSchema.optional(), goal: z.string().max(2000).nullish(), startsOn: dateStr.optional(), endsOn: dateStr.optional() });
const completeInput = z.object({ carryOver: z.enum(["next", "backlog"]).default("next"), nextSprintId: idSchema.nullish() });

const STATUS_FOR: Record<SprintState, string> = { planned: "Gepland", active: "Actief", completed: "Afgerond" };

/* ------------------------------------------------------------------ sprint item upkeep */

/** Mirror state/dates/goal onto the sprint's item on the sprints board (best effort). */
function syncSprintItem(actor: Actor, s: SprintRow): void {
  if (!s.itemId) return;
  try {
    const cols = boardColumns(s.boardId, "item");
    const values: Record<string, unknown> = {};
    const status = cols.find((c) => c.key === "status");
    const tl = cols.find((c) => c.key === "tijdlijn" || c.type === "timeline");
    const doel = cols.find((c) => c.key === "doel");
    if (status) values[status.id] = STATUS_FOR[s.state];
    if (tl && s.startsOn && s.endsOn) values[tl.id] = { from: s.startsOn, to: s.endsOn };
    if (doel) values[doel.id] = s.goal ?? null;
    itemsSvc.changeMultipleColumnValues(actor, s.itemId, values);
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
  }
}

/* ------------------------------------------------------------------ lifecycle */

export function createSprint(actor: Actor, input: unknown): SprintDto {
  const d = parse(createInput, input);
  const board = sprintsBoard(actor, d.boardId, "board:edit_items");
  adoptSprintItems(board.id);
  const existing = db.select().from(sprints).where(eq(sprints.boardId, board.id)).orderBy(asc(sprints.position)).all();
  const last = existing[existing.length - 1];
  const dates = d.startsOn && d.endsOn ? { startsOn: d.startsOn, endsOn: d.endsOn } : d.startsOn ? { startsOn: d.startsOn, endsOn: addDays(d.startsOn, 11) } : nextSprintDates(last?.endsOn ?? null, dayOf(nowIso()));
  if (dates.endsOn < dates.startsOn) throw new ValidationError("Einddatum ligt voor de startdatum");
  const nums = existing.map((s) => Number(/(\d+)\s*$/.exec(s.name)?.[1] ?? 0));
  const name = d.name ?? `Sprint ${Math.max(0, ...nums, existing.length) + 1}`;
  const group = activeGroups(board.id)[0];
  if (!group) throw new ValidationError("Sprint board has no group");
  const item = itemsSvc.create(actor, { boardId: board.id, groupId: group.id, name });
  const row = db.insert(sprints).values({ boardId: board.id, itemId: item.id, name, goal: d.goal ?? null, state: "planned", startsOn: dates.startsOn, endsOn: dates.endsOn, position: (last?.position ?? 0) + 1000 }).returning().get();
  syncSprintItem(actor, row);
  return toDto(row);
}

export function updateSprint(actor: Actor, sprintId: string, input: unknown): SprintDto {
  const d = parse(updateInput, input);
  const cur = getSprintRow(sprintId);
  requireBoard(actor, cur.boardId, "board:edit_items");
  if (cur.state === "completed") throw new ConflictError("Een afgeronde sprint kan niet meer worden aangepast");
  const startsOn = d.startsOn ?? cur.startsOn;
  const endsOn = d.endsOn ?? cur.endsOn;
  if (startsOn && endsOn && endsOn < startsOn) throw new ValidationError("Einddatum ligt voor de startdatum");
  const row = db.update(sprints).set({ name: d.name ?? cur.name, goal: d.goal === undefined ? cur.goal : d.goal, startsOn, endsOn }).where(eq(sprints.id, sprintId)).returning().get();
  if (d.name && cur.itemId) itemsSvc.update(actor, cur.itemId, { name: d.name });
  syncSprintItem(actor, row);
  return toDto(row);
}

export function deleteSprint(actor: Actor, sprintId: string): void {
  const cur = getSprintRow(sprintId);
  requireBoard(actor, cur.boardId, "board:edit_items");
  if (cur.state !== "planned") throw new ConflictError("Alleen geplande sprints kunnen worden verwijderd");
  for (const r of db.select().from(sprintItems).where(and(eq(sprintItems.sprintId, sprintId), isNull(sprintItems.removedAt))).all()) assignItem(actor, r.itemId, null);
  db.delete(sprints).where(eq(sprints.id, sprintId)).run();
  if (cur.itemId) itemsSvc.remove(actor, cur.itemId);
}

export function startSprint(actor: Actor, sprintId: string): SprintDto {
  const cur = getSprintRow(sprintId);
  requireBoard(actor, cur.boardId, "board:edit_items");
  if (cur.state !== "planned") throw new ConflictError("Alleen een geplande sprint kan worden gestart");
  if (db.select().from(sprints).where(and(eq(sprints.boardId, cur.boardId), eq(sprints.state, "active"))).get()) throw new ConflictError("Er is al een actieve sprint: sluit die eerst af");
  reconcile(cur.boardId);
  const now = nowIso();
  const today = dayOf(now);
  const startsOn = !cur.startsOn || cur.startsOn > today ? today : cur.startsOn;
  const endsOn = !cur.endsOn || cur.endsOn < today ? addDays(today, 11) : cur.endsOn;
  const rows = histRows(sprintId);
  const committed = { count: rows.length, points: Math.round(rows.reduce((s, r) => s + r.points, 0) * 10) / 10 };
  const row = db.update(sprints).set({ state: "active", startedAt: now, startsOn, endsOn, committed }).where(eq(sprints.id, sprintId)).returning().get();
  db.update(sprintItems).set({ addedAfterStart: false }).where(and(eq(sprintItems.sprintId, sprintId), isNull(sprintItems.removedAt))).run();
  syncSprintItem(actor, row);
  syncEpicsOfSprintsBoard(row.boardId);
  record(actor, { type: "sprint.started", boardId: row.boardId, sprintId }, { event: "start_sprint", itemId: row.itemId, data: { name: toDtoLite(row), committed } });
  return toDto(row);
}

export interface CompleteResult { sprint: SprintDto; result: SprintResult; carried: { id: string; name: string }[]; done: { id: string; name: string }[]; nextSprint: SprintDto | null }

export function completeSprint(actor: Actor, sprintId: string, input: unknown = {}): CompleteResult {
  const d = parse(completeInput, input ?? {});
  const cur = getSprintRow(sprintId);
  requireBoard(actor, cur.boardId, "board:edit_items");
  if (cur.state !== "active") throw new ConflictError("Alleen een actieve sprint kan worden afgesloten");
  reconcile(cur.boardId);
  const now = nowIso();
  const open = db.select().from(sprintItems).where(and(eq(sprintItems.sprintId, sprintId), isNull(sprintItems.removedAt))).all();
  const tasks = new Map(loadTasks(sourceBoardsOf(cur.boardId)).map((t) => [t.id, t]));
  const unfinished = open.filter((r) => !r.doneAt);
  const doneRows = open.filter((r) => r.doneAt);

  // target of the unfinished work
  let next: SprintRow | null = null;
  if (d.carryOver === "next" && unfinished.length) {
    if (d.nextSprintId) {
      next = getSprintRow(d.nextSprintId);
      if (next.boardId !== cur.boardId || next.state !== "planned" || next.id === cur.id) throw new ValidationError("De volgende sprint moet een geplande sprint van hetzelfde bord zijn");
    } else {
      next = db.select().from(sprints).where(and(eq(sprints.boardId, cur.boardId), eq(sprints.state, "planned"))).orderBy(asc(sprints.position)).get() ?? null;
      if (!next) {
        const dates = nextSprintDates(cur.endsOn, dayOf(now));
        const created = createSprint(actor, { boardId: cur.boardId, ...dates });
        next = getSprintRow(created.id);
      }
    }
  }

  const rows = histRows(sprintId);
  const sc = scopeChange(rows, cur.startedAt);
  const sum = (rs: { points: number }[]) => Math.round(rs.reduce((s, r) => s + r.points, 0) * 10) / 10;
  const result: SprintResult = {
    committedCount: sc.initialCount, committedPoints: sc.initialPoints, addedCount: sc.addedCount, addedPoints: sc.addedPoints,
    removedCount: sc.removedCount, removedPoints: sc.removedPoints, doneCount: doneRows.length, donePoints: sum(doneRows),
    carriedCount: unfinished.length, carriedPoints: sum(unfinished), carriedTo: unfinished.length ? d.carryOver : null, nextSprintId: next?.id ?? null,
  };

  const nextName = next ? toDtoLite(next) : null;
  withoutHooks(() => {
    for (const r of unfinished) {
      db.update(sprintItems).set({ removedAt: now, outcome: "carried" }).where(eq(sprintItems.id, r.id)).run();
      const cols = devColumns(r.boardId);
      if (cols.sprint) itemsSvc.changeColumnValue(actor, r.itemId, cols.sprint.id, next ? { sprintId: next.id, name: nextName } : null);
      if (next) db.insert(sprintItems).values({ sprintId: next.id, itemId: r.itemId, boardId: r.boardId, addedAt: now, addedAfterStart: false, points: r.points, startedAt: r.startedAt }).run();
    }
    for (const r of doneRows) db.update(sprintItems).set({ outcome: "done" }).where(eq(sprintItems.id, r.id)).run();
  });

  const row = db.update(sprints).set({ state: "completed", completedAt: now, result }).where(eq(sprints.id, sprintId)).returning().get();
  syncSprintItem(actor, row);
  syncEpicsOfSprintsBoard(row.boardId);
  record(actor, { type: "sprint.completed", boardId: row.boardId, sprintId }, { event: "complete_sprint", itemId: row.itemId, data: { name: toDtoLite(row), ...result } });
  const pick = (r: { itemId: string }) => ({ id: r.itemId, name: tasks.get(r.itemId)?.name ?? r.itemId });
  return { sprint: toDto(row), result, carried: unfinished.map(pick), done: doneRows.map(pick), nextSprint: next ? toDto(getSprintRow(next.id)) : null };
}

/* ------------------------------------------------------------------ tasks <-> sprints */

/** Put a task in a sprint (or back in the backlog with null). */
export function assignItem(actor: Actor, itemId: string, sprintId: string | null): Task {
  const it = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!it || it.state !== "active") throw new NotFoundError("Item");
  requireBoard(actor, it.boardId, "board:edit_items");
  const cols = devColumns(it.boardId);
  if (!cols.sprint) throw new ValidationError("Dit board heeft geen Sprint-kolom");
  let value: { sprintId: string; name: string } | null = null;
  if (sprintId) {
    const s = getSprintRow(sprintId);
    if (sprintsBoardFor(it.boardId) !== s.boardId) throw new ValidationError("Sprint hoort niet bij dit board");
    if (s.state === "completed") throw new ConflictError("Taken kunnen niet meer aan een afgeronde sprint worden toegevoegd");
    value = { sprintId: s.id, name: toDtoLite(s) };
  }
  itemsSvc.changeColumnValue(actor, itemId, cols.sprint.id, value);
  syncItem(itemId);
  return loadTasks([it.boardId]).find((t) => t.id === itemId)!;
}

export const addItem = (actor: Actor, sprintId: string, itemId: string): Task => assignItem(actor, itemId, sprintId);
export const removeItem = (actor: Actor, _sprintId: string, itemId: string): Task => assignItem(actor, itemId, null);


/** Change the status of a task by label text (sprint board / planning drag and drop). */
export function setStatus(actor: Actor, itemId: string, status: string): Task {
  const it = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!it || it.state !== "active") throw new NotFoundError("Item");
  itemsSvc.changeColumnValue(actor, itemId, "status", status);
  syncItem(itemId);
  return loadTasks([it.boardId]).find((t) => t.id === itemId)!;
}
