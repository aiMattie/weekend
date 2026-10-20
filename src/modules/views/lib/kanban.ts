/** Kanban grouping: items -> lanes by a status, dropdown or people column. Pure, unit-tested. */
import type { ColumnDto, ItemDto, UserLite } from "@/lib/board-types";

export const NO_VALUE_LANE = "__none";
export const KANBAN_TYPES = ["status", "dropdown", "people"] as const;
export const isKanbanColumn = (c: ColumnDto): boolean => (KANBAN_TYPES as readonly string[]).includes(c.type) && c.scope === "item";

export interface LaneDef { key: string; title: string; color: string }
export interface Lane extends LaneDef { items: ItemDto[]; isNoValue: boolean }

const PALETTE = ["#579bfc", "#a25ddc", "#fdab3d", "#00c875", "#ff158a", "#66ccff", "#cab641", "#7f5347"];

interface StatusLabelLite { id: number; text: string; color: string; index?: number }
interface DropdownLabelLite { id: number; text: string }

/** The lane definitions (without items) a column can produce, in display order. */
export function laneDefs(column: ColumnDto, users: UserLite[]): LaneDef[] {
  if (column.type === "status") {
    const labels = ((column.settings.labels as StatusLabelLite[] | undefined) ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return labels.map((l) => ({ key: String(l.id), title: l.text || "-", color: l.color }));
  }
  if (column.type === "dropdown") {
    const labels = (column.settings.labels as DropdownLabelLite[] | undefined) ?? [];
    return labels.map((l, i) => ({ key: String(l.id), title: l.text, color: PALETTE[i % PALETTE.length] }));
  }
  if (column.type === "people") return users.map((u, i) => ({ key: u.id, title: u.name, color: PALETTE[i % PALETTE.length] }));
  return [];
}

/** Lane keys an item belongs to for this column (several for multi dropdown / people). */
export function itemLaneKeys(column: ColumnDto, item: ItemDto): string[] {
  const v = item.values[column.id] as Record<string, unknown> | null | undefined;
  if (!v) return [];
  if (column.type === "status") return typeof v.index === "number" ? [String(v.index)] : [];
  if (column.type === "dropdown") return Array.isArray(v.ids) ? (v.ids as unknown[]).map(String) : [];
  if (column.type === "people") return ((v.personsAndTeams as { id: string; kind?: string }[] | undefined) ?? []).filter((p) => p.kind !== "team").map((p) => p.id);
  return [];
}

export interface BuildLanesOptions {
  /** show people lanes only for users that actually have items (people column on large accounts) */
  hideEmptyPeopleLanes?: boolean;
  /** lane keys the user hid */
  hiddenLanes?: string[];
}

/** Group items into lanes. Unknown values land in the "no value" lane (always last). */
export function buildLanes(column: ColumnDto, items: ItemDto[], users: UserLite[], opts: BuildLanesOptions = {}): Lane[] {
  const defs = laneDefs(column, users);
  const lanes = new Map<string, Lane>(defs.map((d) => [d.key, { ...d, items: [], isNoValue: false }]));
  const none: Lane = { key: NO_VALUE_LANE, title: "", color: "#c4c4c4", items: [], isNoValue: true };
  for (const it of items) {
    const keys = itemLaneKeys(column, it).filter((k) => lanes.has(k));
    if (!keys.length) none.items.push(it);
    else for (const k of keys) lanes.get(k)!.items.push(it);
  }
  let out = [...lanes.values()];
  if (column.type === "people" && opts.hideEmptyPeopleLanes !== false) out = out.filter((l) => l.items.length > 0);
  out.push(none);
  const hidden = new Set(opts.hiddenLanes ?? []);
  return out.filter((l) => !hidden.has(l.key));
}

/**
 * Raw input for `setValue` after dragging an item from lane `from` to lane `to`.
 * Single-value columns (status) just take the target; multi-value columns swap the source lane's
 * value for the target's. `to === NO_VALUE_LANE` clears the column (or removes the source value).
 */
export function inputAfterLaneMove(column: ColumnDto, item: ItemDto, from: string, to: string): unknown {
  if (column.type === "status") return to === NO_VALUE_LANE ? null : { index: Number(to) };
  const current = itemLaneKeys(column, item);
  const next = current.filter((k) => k !== from);
  if (to !== NO_VALUE_LANE && !next.includes(to)) next.push(to);
  if (column.type === "dropdown") return next.length ? { ids: next.map(Number) } : null;
  if (column.type === "people") {
    const teams = ((item.values[column.id] as { personsAndTeams?: { id: string; kind: string }[] } | undefined)?.personsAndTeams ?? []).filter((p) => p.kind === "team");
    const all = [...next.map((id) => ({ id, kind: "person" })), ...teams];
    return all.length ? { personsAndTeams: all } : null;
  }
  return null;
}

/** Default kanban column: first status column, then dropdown, then people. */
export function defaultKanbanColumn(columns: ColumnDto[]): ColumnDto | undefined {
  const cands = columns.filter(isKanbanColumn);
  return cands.find((c) => c.type === "status") ?? cands.find((c) => c.type === "dropdown") ?? cands.find((c) => c.type === "people");
}
