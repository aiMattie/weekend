/**
 * Sprint reports: dashboard (burndown, velocity, scope change, cycle time, workload), sprint summary,
 * sprint metadata (MCP) and the AI-less daily standup text. Read-only; used by REST, UI and MCP.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Actor } from "../../lib/actor";
import { NotFoundError } from "../../lib/errors";
import { nowIso } from "../../lib/time";
import { db } from "../../db/client";
import { columns, users } from "../../db/schema/core";
import { sprints } from "../../db/schema/sprints";
import { requireBoard } from "./_shared";
import { devColumns, loadTasks, sourceBoardsOf, sprintsBoardFor, type Task } from "./dev-config";
import { listSprints, toDtoLite, type SprintDto } from "./sprint-read";
import {
  addDays, average, burndownSeries, cycleTimes, dayOf, isWeekday, round, scopeChange, totals, workload,
  type BurndownPoint, type CycleStats, type HistRow, type ScopeChange, type Totals, type Unit, type VelocityPoint, type WorkloadRow,
} from "./sprint-metrics";
import { getSprintRow, histRows, reconcile } from "./sprint-sync";

export interface ReportOptions { sprintId?: string | null; klant?: string | null; unit?: Unit }

const unitOf = (_boardId: string, unit?: Unit): Unit => unit ?? "estimate";

/** Rows for the burndown: carried-over rows stay in scope until the end of the sprint (like Jira). */
const burnRows = (rows: HistRow[]): HistRow[] => rows.map((r) => (r.outcome === "carried" ? { ...r, removedAt: null } : r));

/** Velocity of the last `limit` completed sprints of a sprints board (committed / completed / added / carried). */
export function velocity(actor: Actor, boardId: string, opts: { limit?: number; klant?: string | null; unit?: Unit } = {}): { sprints: VelocityPoint[]; average: number | null; averageCommitted: number | null } {
  requireBoard(actor, boardId, "board:view");
  const sb = sprintsBoardFor(boardId) ?? boardId;
  const unit = unitOf(sb, opts.unit);
  const w = (r: HistRow) => (unit === "count" ? 1 : r.points);
  const done = db.select().from(sprints).where(and(eq(sprints.boardId, sb), eq(sprints.state, "completed"))).orderBy(asc(sprints.position)).all();
  const pts: VelocityPoint[] = done.slice(-(opts.limit ?? 8)).map((s) => {
    const rows = histRows(s.id, { klant: opts.klant });
    const sum = (xs: HistRow[]) => round(xs.reduce((a, r) => a + w(r), 0));
    return {
      sprintId: s.id, name: toDtoLite(s),
      committed: sum(rows.filter((r) => !r.addedAfterStart)), completed: sum(rows.filter((r) => r.doneAt && r.outcome !== "removed")),
      added: sum(rows.filter((r) => r.addedAfterStart)), carried: sum(rows.filter((r) => r.outcome === "carried")),
    };
  });
  return { sprints: pts, average: average(pts.map((p) => p.completed)), averageCommitted: average(pts.map((p) => p.committed)) };
}

export interface StandupPerson { userId: string | null; name: string; yesterday: string[]; today: string[]; blocked: string[] }
export interface Standup { date: string; sprint: { id: string; name: string } | null; people: StandupPerson[]; text: string }

const userNames = (accountId: string, ids: string[]): Map<string, string> =>
  new Map(ids.length ? db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.accountId, accountId), inArray(users.id, ids))).all().map((u) => [u.id, u.name]) : []);

function previousWorkday(date: string): string {
  let d = addDays(date, -1);
  while (!isWeekday(d)) d = addDays(d, -1);
  return d;
}

/** Daily standup per person: done on the previous workday, in progress today, blocked/waiting. */
export function standup(actor: Actor, boardId: string, opts: { date?: string } = {}): Standup {
  requireBoard(actor, boardId, "board:view");
  const sb = sprintsBoardFor(boardId) ?? boardId;
  const date = opts.date ?? dayOf(nowIso());
  const sp = db.select().from(sprints).where(and(eq(sprints.boardId, sb), eq(sprints.state, "active"))).get();
  const empty: Standup = { date, sprint: null, people: [], text: `Daily standup ${date}\nGeen actieve sprint.` };
  if (!sp) return empty;
  reconcile(sb);
  const prev = previousWorkday(date);
  const tasks = new Map(loadTasks(sourceBoardsOf(sb)).map((t) => [t.id, t]));
  const rows = histRows(sp.id).filter((r) => !r.removedAt);
  const byUser = new Map<string | null, StandupPerson>();
  const person = (id: string | null): StandupPerson => {
    let p = byUser.get(id);
    if (!p) { p = { userId: id, name: id ?? "Niemand toegewezen", yesterday: [], today: [], blocked: [] }; byUser.set(id, p); }
    return p;
  };
  for (const r of rows) {
    const t = tasks.get(r.itemId);
    if (!t) continue;
    const owners = r.assignees?.length ? r.assignees : [null];
    for (const u of owners) {
      const p = person(u);
      if (r.doneAt && dayOf(r.doneAt) === prev) p.yesterday.push(t.name);
      const st = t.status.toLowerCase();
      if (st === "blocked" || st === "wacht op klant") p.blocked.push(`${t.name} (${t.status})`);
      else if (t.isStarted) p.today.push(t.name);
    }
  }
  const names = userNames(actor.accountId, [...byUser.keys()].filter((k): k is string => !!k));
  const people = [...byUser.values()].map((p) => ({ ...p, name: p.userId ? names.get(p.userId) ?? p.userId : p.name })).filter((p) => p.yesterday.length || p.today.length || p.blocked.length).sort((a, b) => a.name.localeCompare(b.name));
  const sprintName = toDtoLite(sp);
  const lines = [`Daily standup ${date} - ${sprintName}`];
  for (const p of people) {
    lines.push("", p.name);
    lines.push(`  Gisteren afgerond: ${p.yesterday.join(", ") || "-"}`);
    lines.push(`  Vandaag bezig met: ${p.today.join(", ") || "-"}`);
    if (p.blocked.length) lines.push(`  Blokkades: ${p.blocked.join(", ")}`);
  }
  if (!people.length) lines.push("Nog niets te melden.");
  return { date, sprint: { id: sp.id, name: sprintName }, people, text: lines.join("\n") };
}

export interface Dashboard {
  sprintsBoardId: string;
  unit: Unit;
  sprints: SprintDto[];
  sprint: SprintDto | null;
  today: string;
  burndown: BurndownPoint[];
  scope: ScopeChange | null;
  totals: Totals | null;
  cycle: CycleStats | null;
  workload: (WorkloadRow & { name: string })[];
  velocity: ReturnType<typeof velocity>;
  klanten: string[];
  standup: Standup;
}

export function klantOptions(boardId: string): string[] {
  const out = new Set<string>();
  for (const id of sourceBoardsOf(boardId)) {
    const c = devColumns(id).klant;
    for (const l of ((c?.settings.labels as { text: string }[] | undefined) ?? [])) out.add(l.text);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

/** Everything the sprint dashboard shows. `sprintId` defaults to the active sprint, else the last completed one. */
export function dashboard(actor: Actor, boardId: string, opts: ReportOptions = {}): Dashboard {
  requireBoard(actor, boardId, "board:view");
  const sb = sprintsBoardFor(boardId);
  if (!sb) throw new NotFoundError("Sprint board");
  const unit = opts.unit ?? "estimate";
  const all = listSprints(actor, sb);
  const sprint = (opts.sprintId ? all.find((s) => s.id === opts.sprintId) : undefined)
    ?? all.find((s) => s.state === "active") ?? [...all].reverse().find((s) => s.state === "completed") ?? all[0] ?? null;
  const today = dayOf(nowIso());
  const base: Dashboard = {
    sprintsBoardId: sb, unit, sprints: all, sprint, today, burndown: [], scope: null, totals: null, cycle: null, workload: [],
    velocity: velocity(actor, sb, { klant: opts.klant, unit }), klanten: klantOptions(sb), standup: standup(actor, sb),
  };
  if (!sprint || !sprint.startsOn || !sprint.endsOn) return base;
  const rows = histRows(sprint.id, { klant: opts.klant });
  const ref = sprint.state === "completed" ? sprint.endsOn : today;
  const names = userNames(actor.accountId, [...new Set(rows.flatMap((r) => r.assignees ?? []))]);
  return {
    ...base,
    burndown: burndownSeries({ startsOn: sprint.startsOn, endsOn: sprint.endsOn, today: ref, rows: burnRows(rows), unit }),
    scope: scopeChange(rows, sprint.startedAt),
    totals: totals(rows),
    cycle: cycleTimes(rows),
    workload: workload(rows).map((w) => ({ ...w, name: w.userId ? names.get(w.userId) ?? w.userId : "Niet toegewezen" })),
  };
}

export interface SprintSummary {
  sprint: SprintDto;
  totals: Totals;
  byStatus: { status: string; count: number; points: number }[];
  byAssignee: (WorkloadRow & { name: string })[];
  byKlant: { klant: string; count: number; points: number; doneCount: number }[];
  scope: ScopeChange;
  burndown: BurndownPoint[];
  completedItems: { id: string; name: string }[];
  unfinishedItems: { id: string; name: string; status: string }[];
  text: string;
}

export function summary(actor: Actor, sprintId: string): SprintSummary {
  const s = getSprintRow(sprintId);
  requireBoard(actor, s.boardId, "board:view");
  reconcile(s.boardId);
  const dto = listSprints(actor, s.boardId).find((x) => x.id === sprintId)!;
  const rows = histRows(sprintId);
  const tasks = loadTasks(sourceBoardsOf(s.boardId));
  const inSprint = tasks.filter((t) => t.sprintId === sprintId);
  const byTask = new Map(tasks.map((t) => [t.id, t]));
  const group = <K extends string>(key: (t: Task) => K) => {
    const m = new Map<K, { count: number; points: number; doneCount: number }>();
    for (const t of inSprint) { const g = m.get(key(t)) ?? { count: 0, points: 0, doneCount: 0 }; g.count++; g.points = round(g.points + t.points); if (t.isDone) g.doneCount++; m.set(key(t), g); }
    return m;
  };
  const names = userNames(actor.accountId, [...new Set(rows.flatMap((r) => r.assignees ?? []))]);
  const today = dayOf(nowIso());
  const tot = totals(rows);
  const open = rows.filter((r) => !r.doneAt && (!r.removedAt || r.outcome === "carried"));
  const sc = scopeChange(rows, s.startedAt);
  const unit = "estimate";
  const completedItems = rows.filter((r) => r.doneAt).map((r) => ({ id: r.itemId, name: byTask.get(r.itemId)?.name ?? r.itemId }));
  const unfinishedItems = open.map((r) => ({ id: r.itemId, name: byTask.get(r.itemId)?.name ?? r.itemId, status: byTask.get(r.itemId)?.status ?? "" }));
  const text = [
    `${dto.name} (${dto.state === "active" ? "actief" : dto.state === "completed" ? "afgerond" : "gepland"}${dto.startsOn ? `, ${dto.startsOn} t/m ${dto.endsOn}` : ""})`,
    dto.goal ? `Doel: ${dto.goal}` : "",
    `Voortgang: ${tot.doneCount} van ${tot.count} taken af, ${tot.donePoints} van ${tot.points} punten/uren.`,
    `Scope: ${sc.initialCount} taken bij de start, ${sc.addedCount} toegevoegd, ${sc.removedCount} verwijderd.`,
    unfinishedItems.length ? `Nog open: ${unfinishedItems.map((u) => u.name).join(", ")}` : "Alles is afgerond.",
  ].filter(Boolean).join("\n");
  return {
    sprint: dto, totals: tot,
    byStatus: [...group((t) => (t.status || "Geen status") as string)].map(([status, g]) => ({ status, count: g.count, points: g.points })),
    byAssignee: workload(rows).map((w) => ({ ...w, name: w.userId ? names.get(w.userId) ?? w.userId : "Niet toegewezen" })),
    byKlant: [...group((t) => t.klant ?? "Geen klant")].map(([klant, g]) => ({ klant, ...g })),
    scope: sc,
    burndown: s.startsOn && s.endsOn ? burndownSeries({ startsOn: s.startsOn, endsOn: s.endsOn, today: s.state === "completed" ? s.endsOn : today, rows: burnRows(rows), unit }) : [],
    completedItems, unfinishedItems, text,
  };
}

/** MCP `get_sprints_metadata`: the sprints of a board with counts, plus its column ids. */
export function sprintsMetadata(actor: Actor, boardId: string) {
  requireBoard(actor, boardId, "board:view");
  const sb = sprintsBoardFor(boardId) ?? boardId;
  const list = listSprints(actor, sb);
  return {
    boardId: sb,
    activeSprintId: list.find((s) => s.state === "active")?.id ?? null,
    sprints: list.map((s) => ({ id: s.id, name: s.name, state: s.state, startsOn: s.startsOn, endsOn: s.endsOn, goal: s.goal, taskCount: s.counts.count, doneCount: s.counts.doneCount, totalPoints: s.counts.points, donePoints: s.counts.donePoints })),
    columns: db.select({ id: columns.id, key: columns.key, title: columns.title, type: columns.type }).from(columns).where(eq(columns.boardId, sb)).all(),
  };
}
