/**
 * Date and range math for the calendar, timeline, gantt and workload views.
 * All math is done on integer "day numbers" (days since 1970-01-01, UTC based) so DST never
 * shifts a bar by one day. Strings are always `YYYY-MM-DD`.
 */

export const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** `YYYY-MM-DD` (or ISO datetime) -> day number; null for anything unparseable. */
export function parseDay(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(ms) ? null : Math.round(ms / DAY_MS);
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function formatDay(n: number): string {
  const d = new Date(n * DAY_MS);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Local "today" as day number. */
export function todayDay(now: Date = new Date()): number {
  return Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);
}

export const addDays = (s: string, n: number): string => formatDay((parseDay(s) ?? 0) + n);

/** 0 = Monday ... 6 = Sunday. */
export const weekdayOf = (day: number): number => (((day + 3) % 7) + 7) % 7;
export const isWeekend = (day: number): boolean => weekdayOf(day) >= 5;
export const startOfWeek = (day: number): number => day - weekdayOf(day);

export interface YMD { year: number; month: number; day: number }
export function ymdOf(day: number): YMD {
  const d = new Date(day * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}
export const dayOfYmd = (year: number, month: number, day = 1): number => Math.round(Date.UTC(year, month, day) / DAY_MS);
export const startOfMonth = (day: number): number => { const { year, month } = ymdOf(day); return dayOfYmd(year, month, 1); };
export const endOfMonth = (day: number): number => { const { year, month } = ymdOf(day); return dayOfYmd(year, month + 1, 1) - 1; };
export const addMonths = (day: number, n: number): number => { const { year, month } = ymdOf(day); return dayOfYmd(year, month + n, 1); };
export const startOfQuarter = (day: number): number => { const { year, month } = ymdOf(day); return dayOfYmd(year, month - (month % 3), 1); };

/** Weeks (arrays of 7 day numbers, Monday first) that cover the month containing `anchor`. */
export function monthGrid(anchor: number): number[][] {
  const first = startOfMonth(anchor);
  const last = endOfMonth(anchor);
  const weeks: number[][] = [];
  for (let w = startOfWeek(first); w <= last; w += 7) weeks.push(Array.from({ length: 7 }, (_, i) => w + i));
  return weeks;
}

/** Inclusive day range. A single day has start === end. */
export interface DayRange { start: number; end: number }

export const rangeLength = (r: DayRange): number => r.end - r.start + 1;
export const rangesOverlap = (a: DayRange, b: DayRange): boolean => a.start <= b.end && b.start <= a.end;
export const normalizeRange = (r: DayRange): DayRange => (r.end < r.start ? { start: r.end, end: r.start } : r);
export const moveRange = (r: DayRange, delta: number): DayRange => ({ start: r.start + delta, end: r.end + delta });

/** Drag one edge of a range by `delta` days; the range never collapses below one day. */
export function resizeRange(r: DayRange, edge: "start" | "end", delta: number): DayRange {
  if (edge === "start") return { start: Math.min(r.start + delta, r.end), end: r.end };
  return { start: r.start, end: Math.max(r.end + delta, r.start) };
}

/** Working days (Mon-Fri) inside a range. */
export function workingDays(r: DayRange): number {
  let n = 0;
  for (let d = r.start; d <= r.end; d++) if (!isWeekend(d)) n++;
  return n;
}

/** Day range stored in a date or timeline column value (API shapes), else null. */
export function rangeFromValue(type: string, value: unknown): DayRange | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (type === "date" || type === "creation_log" || type === "last_updated") {
    const d = parseDay(v.date);
    return d === null ? null : { start: d, end: d };
  }
  if (type === "timeline") {
    const a = parseDay(v.from);
    const b = parseDay(v.to);
    if (a === null && b === null) return null;
    return normalizeRange({ start: a ?? (b as number), end: b ?? (a as number) });
  }
  return null;
}

/** Raw input for `actions.setValue` that writes `range` into a date or timeline column. */
export function valueFromRange(type: string, range: DayRange, previous?: unknown): unknown {
  if (type === "timeline") return { from: formatDay(range.start), to: formatDay(range.end) };
  const prev = previous && typeof previous === "object" ? (previous as { time?: string }) : null;
  return prev?.time ? { date: formatDay(range.start), time: prev.time } : { date: formatDay(range.start) };
}

export const isRangeColumn = (type: string): boolean => type === "date" || type === "timeline";

/** Calendar entry: one item on one date/timeline column. */
export interface CalEvent { id: string; itemId: string; columnId: string; range: DayRange; resizable: boolean }

export interface PlacedEvent<T extends { range: DayRange }> { event: T; startCol: number; endCol: number; lane: number; clippedStart: boolean; clippedEnd: boolean }

/**
 * Lay out events inside one week row (7 columns): clip to the week and give every event the first
 * free lane so overlapping events stack instead of overlap.
 */
export function layoutWeek<T extends { range: DayRange }>(events: T[], weekStart: number, cols = 7): PlacedEvent<T>[] {
  const weekEnd = weekStart + cols - 1;
  const inWeek = events
    .filter((e) => e.range.start <= weekEnd && e.range.end >= weekStart)
    .sort((a, b) => a.range.start - b.range.start || rangeLength(b.range) - rangeLength(a.range));
  const laneEnds: number[] = [];
  return inWeek.map((event) => {
    const startCol = Math.max(event.range.start, weekStart) - weekStart;
    const endCol = Math.min(event.range.end, weekEnd) - weekStart;
    let lane = laneEnds.findIndex((end) => end < startCol);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(endCol); } else laneEnds[lane] = endCol;
    return { event, startCol, endCol, lane, clippedStart: event.range.start < weekStart, clippedEnd: event.range.end > weekEnd };
  });
}

/** Lane (row) assignment for bars that share one row, e.g. timeline items of one group. */
export function packLanes<T extends { range: DayRange }>(items: T[]): { item: T; lane: number }[] {
  const sorted = [...items].sort((a, b) => a.range.start - b.range.start || a.range.end - b.range.end);
  const laneEnds: number[] = [];
  return sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end < item.range.start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(item.range.end); } else laneEnds[lane] = item.range.end;
    return { item, lane };
  });
}

/** Zoom levels of the timeline / gantt: pixels per day and the header unit. */
export type Zoom = "day" | "week" | "month" | "quarter";
export const ZOOM_PX_PER_DAY: Record<Zoom, number> = { day: 40, week: 14, month: 5, quarter: 2 };

export interface HeaderCell { label: string; start: number; end: number }

/** Top row (months/quarters) and bottom row (days/weeks/months) of a time axis. */
export function axisHeaders(range: DayRange, zoom: Zoom, monthNames: string[], weekLabel = "W"): { top: HeaderCell[]; bottom: HeaderCell[] } {
  const top: HeaderCell[] = [];
  const bottom: HeaderCell[] = [];
  const clamp = (s: number, e: number) => ({ start: Math.max(s, range.start), end: Math.min(e, range.end) });
  const monthLabel = (d: number, withYear: boolean) => { const y = ymdOf(d); return `${monthNames[y.month]}${withYear ? ` ${y.year}` : ""}`; };

  if (zoom === "quarter") {
    for (let q = startOfQuarter(range.start); q <= range.end; q = addMonths(q, 3)) {
      const c = clamp(q, addMonths(q, 3) - 1);
      const y = ymdOf(q);
      top.push({ label: String(y.year), ...c });
      bottom.push({ label: `Q${Math.floor(y.month / 3) + 1}`, ...c });
    }
    // collapse the year labels
    const merged: HeaderCell[] = [];
    for (const h of top) { const last = merged[merged.length - 1]; if (last && last.label === h.label) last.end = h.end; else merged.push({ ...h }); }
    return { top: merged, bottom };
  }
  for (let m = startOfMonth(range.start); m <= range.end; m = addMonths(m, 1)) top.push({ label: monthLabel(m, true), ...clamp(m, endOfMonth(m)) });
  if (zoom === "month") {
    for (let m = startOfMonth(range.start); m <= range.end; m = addMonths(m, 1)) bottom.push({ label: monthNames[ymdOf(m).month], ...clamp(m, endOfMonth(m)) });
    const years: HeaderCell[] = [];
    for (const h of top) { const label = h.label.slice(-4); const last = years[years.length - 1]; if (last && last.label === label) last.end = h.end; else years.push({ ...h, label }); }
    return { top: years, bottom };
  } else if (zoom === "week") {
    for (let w = startOfWeek(range.start); w <= range.end; w += 7) bottom.push({ label: `${weekLabel}${isoWeek(w + 3)}`, ...clamp(w, w + 6) });
  } else {
    for (let d = range.start; d <= range.end; d++) bottom.push({ label: String(ymdOf(d).day), start: d, end: d });
  }
  return { top, bottom };
}

/** ISO week number of a day. */
export function isoWeek(day: number): number {
  const thursday = day - weekdayOf(day) + 3;
  const jan1 = dayOfYmd(ymdOf(thursday).year, 0, 1);
  return Math.floor((thursday - jan1) / 7) + 1;
}

/** x offset in px of `day` on an axis starting at `origin`. */
export const dayToX = (day: number, origin: number, pxPerDay: number): number => (day - origin) * pxPerDay;
export const xToDay = (x: number, origin: number, pxPerDay: number): number => origin + Math.floor(x / pxPerDay);

/** Axis range that fits all ranges (plus padding) and always contains today. */
export function fitAxis(ranges: DayRange[], today: number, padDays = 14, minDays = 60): DayRange {
  let start = today - padDays;
  let end = today + minDays;
  for (const r of ranges) { start = Math.min(start, r.start - padDays); end = Math.max(end, r.end + padDays); }
  return { start, end };
}
