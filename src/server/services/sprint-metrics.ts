/**
 * Pure sprint maths (no db, no clock): burndown series, scope change, velocity, cycle time,
 * workload. Fed with history rows (`sprint_items`) so it is trivial to unit test.
 * Days are local calendar days (Europe/Amsterdam) as "YYYY-MM-DD".
 */

export type Unit = "estimate" | "count";

export interface HistRow {
  itemId: string;
  addedAt: string;
  removedAt: string | null;
  addedAfterStart: boolean;
  points: number;
  startedAt: string | null;
  doneAt: string | null;
  outcome: "done" | "carried" | "removed" | null;
  assignees?: string[];
  klant?: string | null;
}

const dayFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" });
export const dayOf = (iso: string): string => dayFmt.format(new Date(iso));

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const isWeekday = (date: string): boolean => { const w = new Date(`${date}T12:00:00Z`).getUTCDay(); return w !== 0 && w !== 6; };

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Monday on or after `date`. */
export function nextMonday(date: string): string {
  let d = date;
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  return d;
}

/** Default dates of the sprint after one ending on `prevEndsOn`: Monday to Friday of the week after (2 weeks). */
export function nextSprintDates(prevEndsOn: string | null, today: string): { startsOn: string; endsOn: string } {
  const startsOn = nextMonday(addDays(prevEndsOn ?? addDays(today, -1), 1));
  return { startsOn, endsOn: addDays(startsOn, 11) };
}

const weight = (r: HistRow, unit: Unit): number => (unit === "count" ? 1 : r.points);

export interface BurndownPoint {
  date: string;
  /** null for days after `today` */
  remaining: number | null;
  ideal: number;
  scope: number;
  done: number;
}

export interface BurndownInput {
  startsOn: string;
  endsOn: string;
  today: string;
  rows: HistRow[];
  unit?: Unit;
}

export function burndownSeries({ startsOn, endsOn, today, rows, unit = "estimate" }: BurndownInput): BurndownPoint[] {
  const days = daysBetween(startsOn, endsOn);
  const work = days.filter(isWeekday);
  const n = Math.max(1, work.length);
  const initial = rows.filter((r) => !r.addedAfterStart).reduce((s, r) => s + weight(r, unit), 0);
  return days.map((date) => {
    const k = days.filter((d) => d <= date && isWeekday(d)).length;
    let scope = 0;
    let done = 0;
    for (const r of rows) {
      const added = r.addedAfterStart ? dayOf(r.addedAt) : (dayOf(r.addedAt) < startsOn ? dayOf(r.addedAt) : startsOn);
      if (added > date) continue;
      if (r.removedAt && dayOf(r.removedAt) <= date) continue;
      scope += weight(r, unit);
      if (r.doneAt && dayOf(r.doneAt) <= date) done += weight(r, unit);
    }
    const future = date > today;
    return { date, remaining: future ? null : round(scope - done), ideal: round(Math.max(0, initial * (1 - k / n))), scope: round(scope), done: round(done) };
  });
}

export const round = (n: number, d = 1): number => Math.round(n * 10 ** d) / 10 ** d;

export interface ScopeChange { initialCount: number; initialPoints: number; addedCount: number; addedPoints: number; removedCount: number; removedPoints: number }

/** Work present at the start versus added/removed after `startedAt` (ISO). */
export function scopeChange(rows: HistRow[], startedAt: string | null): ScopeChange {
  const s: ScopeChange = { initialCount: 0, initialPoints: 0, addedCount: 0, addedPoints: 0, removedCount: 0, removedPoints: 0 };
  for (const r of rows) {
    if (r.addedAfterStart) { s.addedCount++; s.addedPoints += r.points; }
    else { s.initialCount++; s.initialPoints += r.points; }
    if (r.removedAt && r.outcome === "removed" && startedAt && r.removedAt >= startedAt) { s.removedCount++; s.removedPoints += r.points; }
  }
  s.initialPoints = round(s.initialPoints); s.addedPoints = round(s.addedPoints); s.removedPoints = round(s.removedPoints);
  return s;
}

export interface Totals { count: number; points: number; doneCount: number; donePoints: number }

/** Totals of the items in the sprint (everything that was not removed; carried-over work still counts as part of that sprint). */
export function totals(rows: HistRow[]): Totals {
  const live = rows.filter((r) => r.outcome !== "removed");
  return {
    count: live.length, points: round(live.reduce((s, r) => s + r.points, 0)),
    doneCount: live.filter((r) => r.doneAt).length, donePoints: round(live.filter((r) => r.doneAt).reduce((s, r) => s + r.points, 0)),
  };
}

export interface CycleStats { averageDays: number | null; medianDays: number | null; items: { itemId: string; days: number }[] }

/** Cycle time = first started -> done, in days (1 decimal). Items never started use the time since added. */
export function cycleTimes(rows: HistRow[]): CycleStats {
  const items = rows.filter((r) => r.doneAt).map((r) => {
    const from = Date.parse(r.startedAt ?? r.addedAt);
    return { itemId: r.itemId, days: round(Math.max(0, Date.parse(r.doneAt!) - from) / 86_400_000) };
  });
  if (!items.length) return { averageDays: null, medianDays: null, items };
  const sorted = items.map((i) => i.days).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    averageDays: round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    medianDays: sorted.length % 2 ? sorted[mid] : round((sorted[mid - 1] + sorted[mid]) / 2),
    items,
  };
}

export interface WorkloadRow { userId: string | null; count: number; points: number; doneCount: number; donePoints: number }

/** Workload per assignee (an item with several assignees counts for each; no assignee -> userId null). */
export function workload(rows: HistRow[]): WorkloadRow[] {
  const m = new Map<string | null, WorkloadRow>();
  for (const r of rows.filter((x) => x.outcome !== "removed")) {
    for (const u of r.assignees?.length ? r.assignees : [null]) {
      const w = m.get(u) ?? { userId: u, count: 0, points: 0, doneCount: 0, donePoints: 0 };
      w.count++; w.points += r.points;
      if (r.doneAt) { w.doneCount++; w.donePoints += r.points; }
      m.set(u, w);
    }
  }
  return [...m.values()].map((w) => ({ ...w, points: round(w.points), donePoints: round(w.donePoints) })).sort((a, b) => b.points - a.points);
}

export interface VelocityPoint {
  sprintId: string;
  name: string;
  committed: number;
  completed: number;
  added: number;
  carried: number;
}

export const average = (xs: number[]): number | null => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
