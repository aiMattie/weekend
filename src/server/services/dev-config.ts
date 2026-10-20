/**
 * Shared helpers of the dev module: how boards are wired together (boards.settings.dev),
 * which columns carry what (by key, with type fallback) and a normalised read model of a task.
 * No permission checks here: callers (sprints, reports, git, retros) check them first.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { boards, columns, items, type BoardKind } from "../../db/schema/core";
import type { StatusLabel } from "../columns/labels";
import { statusLabels } from "../columns/labels";
import type { ColumnRow, ItemRow } from "./_shared";

export type DevRole = "sprints" | "tasks" | "epics" | "bugs" | "retros";

/** boards.settings.dev */
export interface DevSettings {
  role: DevRole;
  /** the team's sprint board (set on source boards, epics, retros) */
  sprintsBoardId?: string;
  /** boards whose tasks can be planned in sprints (set on the sprints board) */
  sourceBoardIds?: string[];
  epicsBoardId?: string;
  retroBoardId?: string;
  bugsBoardId?: string;
  tasksBoardId?: string;
  estimateUnit?: "hours" | "points";
}

export const DONE_FALLBACK = ["done", "afgerond", "klaar", "gesloten"];
/** status labels that mean "work has not started yet" */
export const NOT_STARTED = ["backlog", "ready", "gepland", "to do", "todo", ""];

export function getDevSettings(board: { settings: Record<string, unknown> }): DevSettings | null {
  const d = board.settings?.dev as DevSettings | undefined;
  return d && typeof d === "object" && d.role ? d : null;
}

export function setDevSettings(boardId: string, patch: Partial<DevSettings>): void {
  const b = db.select().from(boards).where(eq(boards.id, boardId)).get();
  if (!b) return;
  const cur = getDevSettings(b) ?? ({} as DevSettings);
  db.update(boards).set({ settings: { ...b.settings, dev: { ...cur, ...patch } } }).where(eq(boards.id, boardId)).run();
}

export function boardKind(boardId: string): BoardKind | null {
  return db.select({ kind: boards.kind }).from(boards).where(eq(boards.id, boardId)).get()?.kind ?? null;
}

/** Source boards (tasks, bugs) of a sprints board. */
export function sourceBoardsOf(sprintsBoardId: string): string[] {
  const b = db.select().from(boards).where(eq(boards.id, sprintsBoardId)).get();
  const ids = b ? getDevSettings(b)?.sourceBoardIds ?? [] : [];
  return ids.filter((id) => db.select({ id: boards.id }).from(boards).where(and(eq(boards.id, id), eq(boards.state, "active"))).get());
}

/** The sprints board that governs `boardId` (itself, or via settings.dev.sprintsBoardId). */
export function sprintsBoardFor(boardId: string): string | null {
  const b = db.select().from(boards).where(eq(boards.id, boardId)).get();
  if (!b) return null;
  if (b.kind === "dev_sprints") return b.id;
  return getDevSettings(b)?.sprintsBoardId ?? null;
}

export interface DevColumns {
  status?: ColumnRow;
  sprint?: ColumnRow;
  estimate?: ColumnRow;
  klant?: ColumnRow;
  epic?: ColumnRow;
  assignee?: ColumnRow;
  type?: ColumnRow;
  prioriteit?: ColumnRow;
  jira?: ColumnRow;
}

export function devColumns(boardId: string): DevColumns {
  const cols = db.select().from(columns).where(and(eq(columns.boardId, boardId), eq(columns.scope, "item"), eq(columns.archived, false))).orderBy(asc(columns.position)).all();
  const key = (k: string) => cols.find((c) => c.key === k);
  const type = (t: string) => cols.find((c) => c.type === t);
  return {
    status: key("status") ?? type("status"),
    sprint: key("sprint") ?? type("sprint"),
    estimate: key("schatting") ?? key("estimate"),
    klant: key("klant"),
    epic: key("epic"),
    assignee: key("eigenaar") ?? key("people") ?? type("people"),
    type: key("type"),
    prioriteit: key("prioriteit"),
    jira: key("jira_key"),
  };
}

export const isDoneLabel = (l: StatusLabel | undefined): boolean => !!l && (l.isDone === true || (l.isDone === undefined && DONE_FALLBACK.includes(l.text.toLowerCase())));

export interface Task {
  id: string;
  boardId: string;
  name: string;
  groupId: string | null;
  position: number;
  createdAt: string;
  status: string;
  statusColor: string;
  isDone: boolean;
  isStarted: boolean;
  points: number;
  sprintId: string | null;
  assigneeIds: string[];
  klant: string | null;
  epicIds: string[];
  epicNames: string[];
  prioriteit: string | null;
  type: string | null;
  jiraKey: string | null;
}

const dropdownText = (col: ColumnRow | undefined, v: unknown): string | null => {
  if (!col || !v) return null;
  const ids = (v as { ids?: number[] }).ids ?? [];
  const labels = (col.settings.labels as { id: number; text: string }[] | undefined) ?? [];
  const t = ids.map((id) => labels.find((l) => l.id === id)?.text).filter(Boolean);
  return t.length ? t.join(", ") : null;
};

/** ids of linked items in a board_relation value (tolerant of the known shapes). */
export function relationItemIds(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(typeof x === "object" && x ? (x as { linkedPulseId?: unknown }).linkedPulseId ?? (x as { id?: unknown }).id : x));
  const o = v as { linkedPulseIds?: { linkedPulseId: string | number }[]; item_ids?: (string | number)[]; linkedItemIds?: (string | number)[] };
  return (o.linkedPulseIds?.map((x) => String(x.linkedPulseId)) ?? o.item_ids?.map(String) ?? o.linkedItemIds?.map(String) ?? []);
}

/** Name and client of an epic. The epic is the assignment (opdracht); its client wins over the task's own. */
export interface EpicInfo { name: string; klant: string | null; status: string | null }

/** Name, client and status of epic items, by item id or for whole epic boards, keyed by item id (board order). */
export function loadEpicInfo(where: { itemIds?: string[]; boardIds?: string[] }): Map<string, EpicInfo> {
  const out = new Map<string, EpicInfo>();
  const cond = where.itemIds?.length ? inArray(items.id, where.itemIds) : where.boardIds?.length ? inArray(items.boardId, where.boardIds) : null;
  if (!cond) return out;
  const colsOf = new Map<string, DevColumns>();
  for (const e of db.select().from(items).where(and(cond, eq(items.state, "active"))).orderBy(asc(items.position)).all()) {
    if (!colsOf.has(e.boardId)) colsOf.set(e.boardId, devColumns(e.boardId));
    const { klant, status } = colsOf.get(e.boardId)!;
    const idx = status ? (e.values[status.id] as { index?: number } | undefined)?.index : undefined;
    out.set(e.id, {
      name: e.name,
      klant: klant ? dropdownText(klant, e.values[klant.id]) : null,
      status: status && idx !== undefined ? statusLabels(status.settings).find((l) => l.id === idx)?.text ?? null : null,
    });
  }
  return out;
}

/**
 * Task view of an item. `klant` comes from the linked epic when that epic has a client, else from
 * the task's own Klant column (docs/decisions/0001-klant-opdracht-epic.md). Without an `epics` map
 * the linked epics are looked up.
 */
export function readTask(it: ItemRow, cols: DevColumns, epics?: Map<string, EpicInfo>): Task {
  const sv = cols.status ? (it.values[cols.status.id] as { index: number } | undefined) : undefined;
  const label = cols.status && sv ? statusLabels(cols.status.settings).find((l) => l.id === sv.index) : undefined;
  const text = label?.text ?? "";
  const done = isDoneLabel(label);
  const est = cols.estimate ? Number(it.values[cols.estimate.id]) : 0;
  const sp = cols.sprint ? (it.values[cols.sprint.id] as { sprintId?: string } | undefined) : undefined;
  const people = cols.assignee ? ((it.values[cols.assignee.id] as { personsAndTeams?: { id: string; kind: string }[] } | undefined)?.personsAndTeams ?? []) : [];
  const epicIds = cols.epic ? relationItemIds(it.values[cols.epic.id]) : [];
  const epicInfo = epics ?? loadEpicInfo({ itemIds: epicIds });
  const epicKlant = epicIds.map((id) => epicInfo.get(id)?.klant).find(Boolean) ?? null;
  const jira = cols.jira ? it.values[cols.jira.id] : null;
  const prio = cols.prioriteit ? (it.values[cols.prioriteit.id] as { index: number } | undefined) : undefined;
  return {
    id: it.id, boardId: it.boardId, name: it.name, groupId: it.groupId, position: it.position, createdAt: it.createdAt,
    status: text, statusColor: label?.color ?? "#c4c4c4", isDone: done,
    isStarted: !done && !NOT_STARTED.includes(text.toLowerCase()),
    points: Number.isFinite(est) ? est : 0,
    sprintId: sp?.sprintId ?? null,
    assigneeIds: people.filter((p) => p.kind === "person").map((p) => p.id),
    klant: epicKlant ?? dropdownText(cols.klant, cols.klant ? it.values[cols.klant.id] : null),
    epicIds, epicNames: epicIds.map((id) => epicInfo.get(id)?.name ?? id),
    prioriteit: prio && cols.prioriteit ? statusLabels(cols.prioriteit.settings).find((l) => l.id === prio.index)?.text ?? null : null,
    type: dropdownText(cols.type, cols.type ? it.values[cols.type.id] : null),
    jiraKey: typeof jira === "string" && jira ? jira : null,
  };
}

/** Active top-level items of the given boards as tasks (ordered by position). */
export function loadTasks(boardIds: string[]): Task[] {
  if (!boardIds.length) return [];
  const out: Task[] = [];
  const colsByBoard = new Map(boardIds.map((id) => [id, devColumns(id)]));
  const epicBoardIds = new Set<string>();
  for (const id of boardIds) {
    const b = db.select().from(boards).where(eq(boards.id, id)).get();
    const e = b ? getDevSettings(b)?.epicsBoardId : undefined;
    if (e) epicBoardIds.add(e);
  }
  const epics = loadEpicInfo({ boardIds: [...epicBoardIds] });
  const rows = db.select().from(items).where(and(inArray(items.boardId, boardIds), eq(items.state, "active"), isNull(items.parentItemId))).orderBy(asc(items.position)).all();
  for (const r of rows) out.push(readTask(r, colsByBoard.get(r.boardId)!, epics));
  return out;
}
