/**
 * Pure helpers for My Work: due date extraction and bucketing (no db, no React).
 * All dates are "YYYY-MM-DD" strings in the user's time zone; weeks start on Monday.
 */
export type Bucket = "overdue" | "today" | "this_week" | "next_week" | "later" | "no_date";
export const BUCKET_ORDER: Bucket[] = ["overdue", "today", "this_week", "next_week", "later", "no_date"];
export const DEFAULT_TZ = "Europe/Amsterdam";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** "YYYY-MM-DD" of `now` in `tz`. */
export function todayString(now: Date, tz: string = DEFAULT_TZ): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

const toUtcDay = (s: string): number => {
  const m = DATE_RE.exec(s)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
};
const fromUtcDay = (d: number): string => new Date(d * 86_400_000).toISOString().slice(0, 10);

/** Add days to a date string. */
export const addDays = (s: string, n: number): string => fromUtcDay(toUtcDay(s) + n);

/** Monday of the week containing `s`. */
export function weekStart(s: string): string {
  const dow = (new Date(toUtcDay(s) * 86_400_000).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(s, -dow);
}

const asDateString = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const m = DATE_RE.exec(v.trim());
  if (!m || Number.isNaN(Date.parse(m[0]))) return null;
  return m[0];
};

/**
 * Tolerant due date extraction from a date-ish column value:
 * date `{date}`, timeline `{from,to}` (uses `to`), week `{startDate,endDate}` / `{week:{...}}`, or a plain string.
 */
export function extractDueDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return asDateString(value);
  if (typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (o.week && typeof o.week === "object") return extractDueDate(o.week);
  for (const k of ["to", "endDate", "end", "date", "from", "startDate", "start"]) {
    const d = asDateString(o[k]);
    if (d) return d;
  }
  return null;
}

export function bucketFor(due: string | null | undefined, now: Date = new Date(), tz: string = DEFAULT_TZ): Bucket {
  const d = due ? asDateString(due) : null;
  if (!d) return "no_date";
  const today = todayString(now, tz);
  if (d < today) return "overdue";
  if (d === today) return "today";
  const ws = weekStart(today);
  if (d <= addDays(ws, 6)) return "this_week";
  if (d <= addDays(ws, 13)) return "next_week";
  return "later";
}

export interface Section<T> { bucket: Bucket; rows: T[] }

/** Group rows into the six sections (always all six, in order); rows sorted by due date then name. */
export function groupIntoSections<T extends { dueDate: string | null; name: string }>(rows: T[], now: Date = new Date(), tz: string = DEFAULT_TZ): Section<T>[] {
  const map = new Map<Bucket, T[]>(BUCKET_ORDER.map((b) => [b, []]));
  for (const r of rows) map.get(bucketFor(r.dueDate, now, tz))!.push(r);
  return BUCKET_ORDER.map((bucket) => ({
    bucket,
    rows: map.get(bucket)!.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.name.localeCompare(b.name)),
  }));
}
