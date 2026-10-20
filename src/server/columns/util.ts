/** Small pure helpers shared by the column types (no db, no React). */
import { ValidationError } from "../../lib/errors";

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** `YYYY-MM-DD` when it is a real calendar date, else null. */
export function isoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export const todayIso = (): string => new Date().toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const p = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86_400_000);
}

/** ISO week (Monday based): number + year + the Monday/Sunday of that week. */
export function isoWeekOf(date: string): { year: number; week: number; start: string; end: string } {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // 0 = Monday
  const start = addDays(date, -dow);
  const thursday = new Date(Date.UTC(y, m - 1, d - dow + 3));
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1;
  return { year, week, start, end: addDays(start, 6) };
}

/** Monday of ISO week `week` of `year`. */
export function isoWeekStart(year: number, week: number): string {
  const jan4 = `${year}-01-04`;
  return addDays(isoWeekOf(jan4).start, (week - 1) * 7);
}

/** Item ids from every shape the API/UI uses: array, `{item_ids}`, `{linkedPulseIds}`, `{linkedItemIds}`. */
export function idList(input: unknown): string[] {
  const out: string[] = [];
  const push = (e: unknown) => {
    let id: unknown = e;
    if (isObj(e)) id = e.linkedPulseId ?? e.linkedItemId ?? e.id ?? e.item_id ?? e.itemId;
    if (id === undefined || id === null || id === "") return;
    const s = String(id);
    if (!/^\d+$/.test(s)) throw new ValidationError(`Invalid item id: ${JSON.stringify(e)}`);
    if (!out.includes(s)) out.push(s);
  };
  if (Array.isArray(input)) input.forEach(push);
  else if (isObj(input)) {
    const list = input.linkedPulseIds ?? input.item_ids ?? input.itemIds ?? input.linkedItemIds ?? input.ids;
    if (Array.isArray(list)) list.forEach(push);
    else if (list !== undefined && list !== null) push(list);
    else if (input.linkedPulseId !== undefined || input.id !== undefined) push(input);
  } else if (typeof input === "string" || typeof input === "number") push(input);
  return out;
}

export function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "string" ? Number(raw.trim().replace(",", ".")) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export const median = (nums: number[]): number => {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export type AggregateFn = "none" | "sum" | "avg" | "min" | "max" | "median" | "count";
export const AGGREGATE_FNS: AggregateFn[] = ["none", "sum", "avg", "min", "max", "median", "count"];

export function aggregate(nums: number[], fn: AggregateFn): number | null {
  if (fn === "count") return nums.length;
  if (!nums.length || fn === "none") return null;
  switch (fn) {
    case "sum": return round6(nums.reduce((a, b) => a + b, 0));
    case "avg": return round6(nums.reduce((a, b) => a + b, 0) / nums.length);
    case "min": return Math.min(...nums);
    case "max": return Math.max(...nums);
    case "median": return round6(median(nums));
    default: return null;
  }
}
export const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
