/** Pure date math for the scheduler (timezone aware, no db). */

export const DEFAULT_TZ = "Europe/Amsterdam";

export interface LocalParts { y: number; m: number; d: number; hh: number; mm: number; weekday: number /* Mon=1..Sun=7 */ }

export function localParts(at: Date, tz = DEFAULT_TZ): LocalParts {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday as string) + 1;
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, weekday: wd };
}

function tzOffsetMs(at: Date, tz: string): number {
  const p = localParts(at, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - Math.floor(at.getTime() / 60000) * 60000;
}

/** Local wall clock time in `tz` -> UTC instant. */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz = DEFAULT_TZ): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - tzOffsetMs(new Date(guess), tz);
  t = guess - tzOffsetMs(new Date(t), tz); // second pass handles DST edges
  return new Date(t);
}

export function parseHm(time: string | undefined, fallback = "09:00"): { hh: number; mm: number } {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? fallback) ?? /^(\d{1,2}):(\d{2})/.exec(fallback)!;
  return { hh: Math.min(23, +m[1]), mm: Math.min(59, +m[2]) };
}

export interface DateArrivesConfig {
  /** "before" | "after" | "at" the date */
  direction?: string;
  offsetValue?: number;
  offsetUnit?: string; // minutes | hours | days
  /** time of day for date-only values, HH:mm */
  time?: string;
}

const UNIT_MS: Record<string, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };

/** The instant a "date arrives" automation should fire for a stored date value, or null when invalid. */
export function dateArrivesAt(cfg: DateArrivesConfig, value: { date: string; time?: string } | null | undefined, tz = DEFAULT_TZ): Date | null {
  if (!value?.date || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return null;
  const [y, m, d] = value.date.split("-").map(Number);
  // stored times are UTC; date-only values use the configured time of day in tz
  let base: Date;
  if (value.time) {
    const [hh, mi, ss] = value.time.split(":").map(Number);
    base = new Date(Date.UTC(y, m - 1, d, hh, mi, ss || 0));
  } else {
    const { hh, mm } = parseHm(cfg.time);
    base = zonedToUtc(y, m, d, hh, mm, tz);
  }
  const n = Math.max(0, Number(cfg.offsetValue ?? 0));
  const ms = n * (UNIT_MS[cfg.offsetUnit ?? "days"] ?? UNIT_MS.days);
  const dir = cfg.direction ?? "at";
  if (dir === "before") return new Date(base.getTime() - ms);
  if (dir === "after") return new Date(base.getTime() + ms);
  return base;
}

export interface RecurringConfig {
  every?: string; // day | weekday | week | month
  weekday?: number | string; // 1..7 for "week"
  dayOfMonth?: number | string; // 1..31 for "month" (clamped)
  time?: string;
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Most recent scheduled occurrence at or before `now` (searches up to 70 days back). */
export function latestOccurrence(cfg: RecurringConfig, now: Date, tz = DEFAULT_TZ): Date | null {
  const { hh, mm } = parseHm(cfg.time);
  const today = localParts(now, tz);
  for (let back = 0; back <= 70; back++) {
    const probe = new Date(Date.UTC(today.y, today.m - 1, today.d - back, 12));
    const y = probe.getUTCFullYear(), m = probe.getUTCMonth() + 1, d = probe.getUTCDate();
    const wd = ((probe.getUTCDay() + 6) % 7) + 1;
    const every = cfg.every ?? "day";
    const ok =
      every === "day" ? true
      : every === "weekday" ? wd <= 5
      : every === "week" ? wd === Number(cfg.weekday ?? 1)
      : every === "month" ? d === Math.min(Number(cfg.dayOfMonth ?? 1), daysInMonth(y, m))
      : false;
    if (!ok) continue;
    const at = zonedToUtc(y, m, d, hh, mm, tz);
    if (at.getTime() <= now.getTime()) return at;
  }
  return null;
}
