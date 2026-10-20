import { DAY_MS, ymdOf } from "./dates";

const fmt = (locale: string, opts: Intl.DateTimeFormatOptions, day: number) => new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(new Date(day * DAY_MS));

/** 12 month names (short or long) for a locale. */
export const monthNames = (locale: string, style: "short" | "long" = "short"): string[] => Array.from({ length: 12 }, (_, m) => fmt(locale, { month: style }, Math.round(Date.UTC(2024, m, 1) / DAY_MS)));
/** Monday-first weekday names. */
export const weekdayNames = (locale: string, style: "short" | "long" = "short"): string[] => Array.from({ length: 7 }, (_, i) => fmt(locale, { weekday: style }, Math.round(Date.UTC(2024, 0, 1 + i) / DAY_MS))); // 2024-01-01 is a Monday

export const formatMonthTitle = (locale: string, day: number): string => fmt(locale, { month: "long", year: "numeric" }, day);
export const formatDayTitle = (locale: string, day: number): string => fmt(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, day);
export const formatShort = (locale: string, day: number): string => fmt(locale, { day: "numeric", month: "short" }, day);
export function formatWeekTitle(locale: string, first: number, last: number): string {
  const a = ymdOf(first); const b = ymdOf(last);
  return a.month === b.month ? `${a.day} – ${fmt(locale, { day: "numeric", month: "long", year: "numeric" }, last)}` : `${formatShort(locale, first)} – ${fmt(locale, { day: "numeric", month: "short", year: "numeric" }, last)}`;
}
