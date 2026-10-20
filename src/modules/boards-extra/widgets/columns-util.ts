/**
 * Cross-board helpers: find the "same" column on another board, translate filter operands,
 * derive group keys, read dates. Pure.
 */
import { getColumnLogic } from "@/server/columns/registry";
import type { FormatContext } from "@/server/columns/types";
import type { FilterRuleLite, WBoard, WColumn, WItem, WidgetContext } from "./types";

export const PALETTE = ["#579bfc", "#00c875", "#fdab3d", "#e2445c", "#a25ddc", "#037f4c", "#ff158a", "#66ccff", "#cab641", "#7f5347", "#9cd326", "#784bd1"];
export const EMPTY_KEY = "__empty";
export const NAME_COL = "__name";

export const asRef = (c: WColumn) => ({ id: c.id, key: c.key, title: c.title, type: c.type, settings: c.settings });
export const fmtCtx = (ctx: WidgetContext): FormatContext => ({ userNames: ctx.userNames, teamNames: ctx.teamNames });

export function findColumnAnywhere(ctx: WidgetContext, columnId: string | undefined | null): WColumn | undefined {
  if (!columnId) return undefined;
  for (const b of ctx.boards) {
    const c = b.columns.find((x) => x.id === columnId);
    if (c) return c;
  }
  return undefined;
}

/** The column on `board` that corresponds to reference column `ref` (same id, else same type + title, else same type + key). */
export function columnFor(board: WBoard, ref: WColumn | undefined): WColumn | undefined {
  if (!ref) return undefined;
  const items = board.columns.filter((c) => c.type === ref.type);
  return items.find((c) => c.id === ref.id) ?? items.find((c) => c.title.trim().toLowerCase() === ref.title.trim().toLowerCase()) ?? items.find((c) => c.key === ref.key);
}

const labelsOf = (c: WColumn): { id: number; text: string }[] => (Array.isArray(c.settings.labels) ? (c.settings.labels as { id: number; text: string }[]) : []);

/** Status/dropdown filter operands hold label ids: translate them by label text to the target board's column. */
export function translateOperand(ref: WColumn, target: WColumn, operand: unknown): unknown {
  if ((ref.type !== "status" && ref.type !== "dropdown") || ref.id === target.id || !Array.isArray(operand)) return operand;
  const from = labelsOf(ref);
  const to = labelsOf(target);
  return operand.map((o) => {
    const text = from.find((l) => String(l.id) === String(o))?.text.toLowerCase();
    const hit = text === undefined ? undefined : to.find((l) => l.text.toLowerCase() === text);
    return hit ? String(hit.id) : String(o);
  });
}

export function applyFilters(ctx: WidgetContext, board: WBoard, items: WItem[], rules: FilterRuleLite[]): WItem[] {
  if (!rules.length) return items;
  return items.filter((item) => rules.every((r) => {
    if (r.columnId === NAME_COL) {
      const o = String(r.operand ?? "").toLowerCase();
      return r.op !== "contains" || item.name.toLowerCase().includes(o);
    }
    const ref = findColumnAnywhere(ctx, r.columnId);
    if (!ref) return true; // rule refers to a deleted column: ignore
    const col = columnFor(board, ref);
    const logic = getColumnLogic(ref.type);
    // a half-configured rule (operator needs a value, none chosen yet) does not filter
    const empty = r.operand === undefined || r.operand === null || r.operand === "" || (Array.isArray(r.operand) && r.operand.length === 0);
    if (empty && logic.filter.operators.find((o) => o.id === r.op)?.needsOperand) return true;
    const value = col ? (item.values[col.id] ?? null) : null;
    const operand = col ? translateOperand(ref, col, r.operand) : r.operand;
    return logic.filter.test(value as never, r.op, operand, asRef(col ?? ref));
  }));
}

export interface Entry { board: WBoard; item: WItem }

/** All (board, item) pairs a widget works on: selected boards, dashboard filters, then widget filters. */
export function collectEntries(ctx: WidgetContext, settings: { boardIds?: string[]; filters?: FilterRuleLite[] }): Entry[] {
  const only = settings.boardIds?.length ? new Set(settings.boardIds) : null;
  const out: Entry[] = [];
  for (const board of ctx.boards) {
    if (only && !only.has(board.id)) continue;
    let items = board.items;
    items = applyFilters(ctx, board, items, ctx.filters);
    items = applyFilters(ctx, board, items, settings.filters ?? []);
    for (const item of items) out.push({ board, item });
  }
  return out;
}

export interface GroupKey { key: string; label: string; color: string; order?: number }

export function dateBucket(date: string, bucket: "day" | "week" | "month" | "year"): string {
  if (bucket === "day") return date;
  if (bucket === "month") return date.slice(0, 7);
  if (bucket === "year") return date.slice(0, 4);
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** Tolerant date reader: date {date}, timeline {from,to}, strings. */
export function readDateRange(value: unknown): { start: string; end: string } | null {
  if (!value) return null;
  const iso = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
  if (typeof value === "string") { const d = iso(value); return d ? { start: d, end: d } : null; }
  if (typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const start = iso(o.from) ?? iso(o.startDate) ?? iso(o.start) ?? iso(o.date);
  const end = iso(o.to) ?? iso(o.endDate) ?? iso(o.end) ?? iso(o.date) ?? start;
  if (!start && !end) return null;
  return { start: (start ?? end)!, end: (end ?? start)! };
}

export function groupKeys(ctx: WidgetContext, entry: Entry, ref: WColumn | string | undefined, bucket: "day" | "week" | "month" | "year" = "month"): GroupKey[] {
  const { board, item } = entry;
  const empty: GroupKey = { key: EMPTY_KEY, label: "", color: "#c4c4c4", order: 9999 };
  if (ref === "__board") return [{ key: board.id, label: board.name, color: PALETTE[ctx.boards.indexOf(board) % PALETTE.length] }];
  if (ref === "__group") {
    const g = board.groups.find((x) => x.id === item.groupId);
    return g ? [{ key: g.title.toLowerCase(), label: g.title, color: g.color, order: board.groups.indexOf(g) }] : [empty];
  }
  if (!ref || typeof ref === "string") return [empty];
  const col = columnFor(board, ref);
  const v = col ? item.values[col.id] : undefined;
  if (!col || v === undefined || v === null) return [empty];
  switch (ref.type) {
    case "status": {
      const l = labelsOf(col).find((x) => x.id === (v as { index?: number }).index) as { id: number; text: string; color?: string; index?: number } | undefined;
      return l ? [{ key: l.text.toLowerCase() || `#${l.id}`, label: l.text, color: l.color ?? "#c4c4c4", order: l.index ?? l.id }] : [empty];
    }
    case "dropdown": {
      const ids = (v as { ids?: number[] }).ids ?? [];
      const out = ids.map((id) => labelsOf(col).find((l) => l.id === id)).filter(Boolean).map((l, i) => ({ key: l!.text.toLowerCase(), label: l!.text, color: PALETTE[i % PALETTE.length] }));
      return out.length ? out : [empty];
    }
    case "people": {
      const p = ((v as { personsAndTeams?: { id: string; kind: string }[] }).personsAndTeams ?? []);
      const out = p.map((x) => ({ key: `${x.kind}:${x.id}`, label: (x.kind === "team" ? ctx.teamNames.get(x.id) : ctx.userNames.get(x.id)) ?? x.id, color: PALETTE[Number(x.id.slice(-2)) % PALETTE.length] }));
      return out.length ? out : [empty];
    }
    case "date": case "timeline": case "week": {
      const r = readDateRange(v);
      if (!r) return [empty];
      const key = dateBucket(r.start, bucket);
      return [{ key, label: key, color: "#579bfc", order: 0 }];
    }
    case "checkbox": {
      const on = !!(v as { checked?: boolean }).checked;
      return [{ key: on ? "yes" : "no", label: on ? "Ja" : "Nee", color: on ? "#00c875" : "#c4c4c4" }];
    }
    default: {
      const text = getColumnLogic(ref.type).format(v as never, asRef(col), fmtCtx(ctx));
      return text ? [{ key: text.toLowerCase(), label: text, color: "#579bfc" }] : [empty];
    }
  }
}

export type Aggregation = "count" | "sum" | "avg" | "min" | "max" | "median";
export function aggregate(nums: number[], agg: Aggregation, count: number): number {
  if (agg === "count") return count;
  if (!nums.length) return 0;
  switch (agg) {
    case "sum": return nums.reduce((a, b) => a + b, 0);
    case "avg": return nums.reduce((a, b) => a + b, 0) / nums.length;
    case "min": return Math.min(...nums);
    case "max": return Math.max(...nums);
    case "median": { const s = [...nums].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  }
}

/** Numeric value of an item's column (numbers columns; also formula/progress results when stored as numbers). */
export function numberOf(entry: Entry, ref: WColumn | undefined): number | null {
  if (!ref) return null;
  const col = columnFor(entry.board, ref);
  const v = col ? entry.item.values[col.id] : undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && typeof (v as { value?: unknown }).value === "number") return (v as { value: number }).value;
  return null;
}

export const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Is this item "done" according to its status columns (label.isDone or label text Done/Afgerond)? */
export function isDone(board: WBoard, item: WItem, statusRef?: WColumn): boolean {
  const cols = statusRef ? [columnFor(board, statusRef)].filter(Boolean) as WColumn[] : board.columns.filter((c) => c.type === "status").slice(0, 1);
  for (const c of cols) {
    const idx = (item.values[c.id] as { index?: number } | undefined)?.index;
    if (idx === undefined) continue;
    const l = labelsOf(c).find((x) => x.id === idx) as { text: string; isDone?: boolean } | undefined;
    if (l && (l.isDone || /^(done|afgerond|behaald|completed|klaar)$/i.test(l.text.trim()))) return true;
  }
  return false;
}
