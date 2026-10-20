/** Chart view aggregation: group items by a column (optionally stacked) and count/sum/average. */
import type { ColumnDto, GroupDto, ItemDto, UserLite } from "@/lib/board-types";
import { getColumnLogic } from "@/server/columns/registry";
import { formatContext } from "@/lib/view-state";
import { formatDay, parseDay, rangeFromValue, startOfMonth, ymdOf } from "./dates";

export const GROUP_AXIS = "__group";
export type ChartType = "bar" | "stacked" | "line" | "pie";
export type Metric = "count" | "sum" | "avg";
export interface ChartConfig {
  xColumnId: string;
  stackColumnId?: string | null;
  metric: Metric;
  yColumnId?: string | null;
  /** date columns: bucket by month or day */
  dateBucket?: "day" | "month";
}
export interface Bucket { key: string; label: string; color: string }
export interface ChartData { buckets: Bucket[]; series: Bucket[]; rows: Record<string, string | number>[] }

const PALETTE = ["#579bfc", "#00c875", "#fdab3d", "#a25ddc", "#df2f4a", "#66ccff", "#ff158a", "#cab641", "#037f4c", "#7f5347"];
const NONE = "__none";
const colorAt = (i: number) => PALETTE[i % PALETTE.length];

interface Ctx { columns: ColumnDto[]; groups: GroupDto[]; users: UserLite[]; dateBucket: "day" | "month" }

/** Bucket key + display label (+ optional fixed color) per item for an axis column; several for multi-value columns. */
function keysFor(item: ItemDto, axis: string, ctx: Ctx): { key: string; label: string; color?: string }[] {
  if (axis === GROUP_AXIS) {
    const g = ctx.groups.find((x) => x.id === item.groupId);
    return g ? [{ key: g.id, label: g.title, color: g.color }] : [];
  }
  const col = ctx.columns.find((c) => c.id === axis);
  if (!col) return [];
  const v = item.values[col.id] as Record<string, unknown> | null | undefined;
  if (col.type === "status") {
    const labels = (col.settings.labels as { id: number; text: string; color: string }[] | undefined) ?? [];
    const l = labels.find((x) => x.id === (v as { index?: number } | null)?.index);
    return l ? [{ key: String(l.id), label: l.text || "-", color: l.color }] : [];
  }
  if (col.type === "dropdown") {
    const labels = (col.settings.labels as { id: number; text: string }[] | undefined) ?? [];
    return ((v?.ids as number[] | undefined) ?? []).map((id) => ({ key: String(id), label: labels.find((l) => l.id === id)?.text ?? String(id) }));
  }
  if (col.type === "people") {
    return ((v?.personsAndTeams as { id: string }[] | undefined) ?? []).map((p) => ({ key: p.id, label: ctx.users.find((u) => u.id === p.id)?.name ?? p.id }));
  }
  if (col.type === "date" || col.type === "timeline") {
    const r = rangeFromValue(col.type, v);
    if (!r) return [];
    if (ctx.dateBucket === "day") return [{ key: formatDay(r.start), label: formatDay(r.start) }];
    const m = formatDay(startOfMonth(r.start)).slice(0, 7);
    return [{ key: m, label: m }];
  }
  if (col.type === "checkbox") return [{ key: v?.checked ? "1" : "0", label: v?.checked ? "✓" : "–" }];
  const text = getColumnLogic(col.type).format((v ?? null) as never, { id: col.id, key: col.key, title: col.title, type: col.type, settings: col.settings }, formatContext(ctx.users));
  return text ? [{ key: text, label: text }] : [];
}

const numberOf = (item: ItemDto, columnId?: string | null): number | null => {
  if (!columnId) return null;
  const v = item.values[columnId];
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** Aggregate items into chart rows `{ key, label, <seriesKey>: value, total }`. */
export function buildChart(items: ItemDto[], columns: ColumnDto[], groups: GroupDto[], users: UserLite[], cfg: ChartConfig, emptyLabel = "-"): ChartData {
  const ctx: Ctx = { columns, groups, users, dateBucket: cfg.dateBucket ?? "month" };
  const top = items.filter((i) => !i.parentItemId);
  const bucketMeta = new Map<string, Bucket>();
  const seriesMeta = new Map<string, Bucket>();
  const cells = new Map<string, Map<string, { sum: number; n: number }>>();
  const add = (bk: { key: string; label: string; color?: string }, sk: string, v: number | null) => {
    if (!bucketMeta.has(bk.key)) bucketMeta.set(bk.key, { key: bk.key, label: bk.label, color: bk.color ?? "" });
    const row = cells.get(bk.key) ?? new Map();
    cells.set(bk.key, row);
    const c = row.get(sk) ?? { sum: 0, n: 0 };
    c.n += cfg.metric === "count" ? 1 : v === null ? 0 : 1;
    c.sum += cfg.metric === "count" ? 1 : v ?? 0;
    row.set(sk, c);
  };
  for (const item of top) {
    const xs = keysFor(item, cfg.xColumnId, ctx);
    const bks = xs.length ? xs : [{ key: NONE, label: emptyLabel }];
    const ss = cfg.stackColumnId ? keysFor(item, cfg.stackColumnId, ctx) : [{ key: "all", label: "" }];
    const sks = ss.length ? ss : [{ key: NONE, label: emptyLabel }];
    const v = numberOf(item, cfg.yColumnId);
    for (const bk of bks) for (const sk of sks) {
      if (!seriesMeta.has(sk.key)) seriesMeta.set(sk.key, { key: sk.key, label: sk.label, color: (sk as { color?: string }).color ?? "" });
      add(bk, sk.key, v);
    }
  }
  const isDate = columns.find((c) => c.id === cfg.xColumnId && (c.type === "date" || c.type === "timeline"));
  let buckets = [...bucketMeta.values()];
  if (isDate) buckets.sort((a, b) => (a.key === NONE ? 1 : b.key === NONE ? -1 : (parseDay(a.key.length === 7 ? `${a.key}-01` : a.key) ?? 0) - (parseDay(b.key.length === 7 ? `${b.key}-01` : b.key) ?? 0)));
  else buckets = orderBuckets(buckets, columns.find((c) => c.id === cfg.xColumnId), groups);
  buckets = buckets.map((b, i) => ({ ...b, color: b.color || colorAt(i) }));
  const series = [...seriesMeta.values()].map((s, i) => ({ ...s, color: s.color || colorAt(i) }));
  const value = (c: { sum: number; n: number } | undefined): number => {
    if (!c) return 0;
    if (cfg.metric === "avg") return c.n ? Math.round((c.sum / c.n) * 100) / 100 : 0;
    return Math.round(c.sum * 100) / 100;
  };
  const rows = buckets.map((b) => {
    const row: Record<string, string | number> = { key: b.key, label: b.label, color: b.color };
    let total = 0;
    for (const s of series) { const val = value(cells.get(b.key)?.get(s.key)); row[s.key] = val; total += val; }
    row.total = Math.round(total * 100) / 100;
    return row;
  });
  return { buckets, series, rows };
}

function orderBuckets(buckets: Bucket[], col: ColumnDto | undefined, groups: GroupDto[]): Bucket[] {
  const rank = new Map<string, number>();
  if (col?.type === "status") ((col.settings.labels as { id: number; index?: number }[] | undefined) ?? []).forEach((l, i) => rank.set(String(l.id), l.index ?? i));
  else if (col?.type === "dropdown") ((col.settings.labels as { id: number }[] | undefined) ?? []).forEach((l, i) => rank.set(String(l.id), i));
  else if (!col) groups.forEach((g, i) => rank.set(g.id, i));
  const r = (b: Bucket) => (b.key === NONE ? 1e9 : rank.get(b.key) ?? 1e6);
  return [...buckets].sort((a, b) => r(a) - r(b) || a.label.localeCompare(b.label));
}

export const monthOfDay = (day: number) => { const y = ymdOf(day); return `${y.year}-${String(y.month + 1).padStart(2, "0")}`; };
