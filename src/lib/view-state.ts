/**
 * Client-side view state (toolbar): search, person filter, filter rules, sort, hidden columns,
 * group-by, pinned columns. Pure functions so they are unit-testable and reusable by every view type.
 * A saved view persists `filters`/`sort`/`settings.hiddenColumnIds|groupByColumnId|pinnedColumnIds`
 * (views table); search and person filter are ephemeral. See `savedPart` / `stateFromView`.
 */
import { getColumnLogic } from "@/server/columns/registry";
import { testText } from "@/server/columns/ops";
import type { FormatContext } from "@/server/columns/types";
import type { ColumnDto, GroupDto, ItemDto, UserLite, ViewDto } from "./board-types";

/** `join` = how this rule combines with the PREVIOUS one (default "and"; AND binds tighter than OR). */
export interface FilterRule { columnId: string; op: string; operand?: unknown; join?: "and" | "or" }
export interface SortRule { columnId: string; dir: "asc" | "desc" }

export interface ViewState {
  search: string;
  personIds: string[];
  filters: FilterRule[];
  sort: SortRule[];
  hiddenColumnIds: string[];
  groupByColumnId: string | null;
  /** columns pinned (sticky) next to the name column, in display order */
  pinnedColumnIds: string[];
}

export const emptyViewState = (): ViewState => ({ search: "", personIds: [], filters: [], sort: [], hiddenColumnIds: [], groupByColumnId: null, pinnedColumnIds: [] });

export const NAME_COLUMN_SORT = "__name";

/** The part of the state that a saved view stores. */
export interface SavedPart { filters: FilterRule[]; sort: SortRule[]; hiddenColumnIds: string[]; groupByColumnId: string | null; pinnedColumnIds: string[] }

export const savedPart = (s: ViewState): SavedPart => ({
  filters: s.filters, sort: s.sort, hiddenColumnIds: s.hiddenColumnIds, groupByColumnId: s.groupByColumnId, pinnedColumnIds: s.pinnedColumnIds,
});

/** Saved state of a view row (what is applied after a reload). Search and person filter start empty. */
export const stateFromView = (v: Pick<ViewDto, "filters" | "sort" | "settings">): ViewState => ({
  ...emptyViewState(),
  filters: ((v.filters ?? []) as FilterRule[]),
  sort: ((v.sort ?? []) as SortRule[]),
  hiddenColumnIds: (v.settings?.hiddenColumnIds as string[] | undefined) ?? [],
  groupByColumnId: (v.settings?.groupByColumnId as string | null | undefined) ?? null,
  pinnedColumnIds: (v.settings?.pinnedColumnIds as string[] | undefined) ?? [],
});

const norm = (p: SavedPart) => JSON.stringify({
  f: p.filters.map((r) => ({ c: r.columnId, o: r.op, v: r.operand ?? null, j: r.join ?? "and" })),
  s: p.sort.map((r) => [r.columnId, r.dir]),
  h: [...p.hiddenColumnIds].sort(),
  g: p.groupByColumnId ?? null,
  p: p.pinnedColumnIds,
});
/** True when two states have the same saveable part (search / person filter are ignored). */
export const sameSavedPart = (a: ViewState, b: ViewState): boolean => norm(savedPart(a)) === norm(savedPart(b));

export const hasActiveFilters = (s: ViewState): boolean => !!(s.search.trim() || s.personIds.length || s.filters.length);

export function formatContext(users: UserLite[], teams: { id: string; name: string }[] = []): FormatContext {
  return { userNames: new Map(users.map((u) => [u.id, u.name])), teamNames: new Map(teams.map((t) => [t.id, t.name])) };
}

const asRef = (c: ColumnDto) => ({ id: c.id, key: c.key, title: c.title, type: c.type, settings: c.settings });

/** True when `item` is assigned (in any people column) to one of `personIds`; "none" matches unassigned. */
function matchesPerson(item: ItemDto, peopleCols: ColumnDto[], personIds: string[]): boolean {
  const assigned = new Set<string>();
  for (const c of peopleCols) for (const p of ((item.values[c.id] as { personsAndTeams?: { id: string }[] } | undefined)?.personsAndTeams ?? [])) assigned.add(p.id);
  if (personIds.includes("none") && assigned.size === 0) return true;
  return personIds.some((id) => assigned.has(id));
}

const NEEDS_OPERAND = new Set(["contains", "not_contains", "is", "is_not"]);

/** Evaluate one filter rule. Rules on unknown columns are ignored (return null). */
function testRule(item: ItemDto, columns: ColumnDto[], f: FilterRule): boolean | null {
  const incomplete = f.operand === undefined || f.operand === null || f.operand === "" || (Array.isArray(f.operand) && f.operand.length === 0);
  if (f.columnId === NAME_COLUMN_SORT) return incomplete && NEEDS_OPERAND.has(f.op) ? null : testText(item.name, f.op, f.operand);
  const col = columns.find((c) => c.id === f.columnId);
  if (!col) return null;
  // a rule whose value is not filled in yet is ignored instead of hiding everything
  if (incomplete && getColumnLogic(col.type).filter.operators.find((o) => o.id === f.op)?.needsOperand) return null;
  try {
    return getColumnLogic(col.type).filter.test((item.values[col.id] ?? null) as never, f.op, f.operand, asRef(col));
  } catch {
    return true; // a half-filled rule (operand of the wrong shape) must not hide everything
  }
}

/** Filters combine left to right: "and" binds tighter than "or" (a AND b OR c = (a AND b) OR c). */
export function matchesFilters(item: ItemDto, columns: ColumnDto[], rules: FilterRule[]): boolean {
  const chains: boolean[][] = [];
  let first = true;
  for (const r of rules) {
    const res = testRule(item, columns, r);
    if (res === null) continue;
    if (first || r.join === "or") chains.push([res]);
    else chains[chains.length - 1].push(res);
    first = false;
  }
  if (!chains.length) return true;
  return chains.some((ch) => ch.every(Boolean));
}

/**
 * Values a new item needs so it stays visible under the view's filters: for each status/dropdown column
 * with an "any of" rule in a pure AND chain, the first chosen option. Anything else is left empty.
 */
export function valuesFromFilters(columns: ColumnDto[], rules: FilterRule[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (rules.some((r) => r.join === "or")) return out;
  for (const r of rules) {
    if (r.op !== "any_of" || !Array.isArray(r.operand) || !r.operand.length || r.columnId in out) continue;
    const col = columns.find((c) => c.id === r.columnId);
    if (col?.type === "status") out[col.id] = { index: Number(r.operand[0]) };
    else if (col?.type === "dropdown") out[col.id] = { ids: [Number(r.operand[0])] };
  }
  return out;
}

export function itemMatches(item: ItemDto, columns: ColumnDto[], state: ViewState, ctx: FormatContext, subitems: ItemDto[] = []): boolean {
  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    const hay = [item.name, ...columns.map((c) => getColumnLogic(c.type).format((item.values[c.id] ?? null) as never, asRef(c), ctx)), ...subitems.map((s) => s.name)].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (state.personIds.length && !matchesPerson(item, columns.filter((c) => c.type === "people"), state.personIds)) return false;
  return matchesFilters(item, columns, state.filters);
}

export function sortItems(items: ItemDto[], columns: ColumnDto[], sort: SortRule[], ctx: FormatContext): ItemDto[] {
  if (!sort.length) return items;
  const keyOf = (item: ItemDto, rule: SortRule): string | number | null => {
    if (rule.columnId === NAME_COLUMN_SORT) return item.name.toLowerCase();
    const col = columns.find((c) => c.id === rule.columnId);
    if (!col) return null;
    const logic = getColumnLogic(col.type);
    return logic.sortKey ? logic.sortKey((item.values[col.id] ?? null) as never, asRef(col), ctx) : null;
  };
  return [...items].sort((a, b) => {
    for (const rule of sort) {
      const ka = keyOf(a, rule);
      const kb = keyOf(b, rule);
      if (ka === kb) continue;
      if (ka === null) return 1; // empties last, regardless of direction
      if (kb === null) return -1;
      const cmp = typeof ka === "string" && typeof kb === "string" ? ka.localeCompare(kb, undefined, { numeric: true }) : ka < kb ? -1 : 1;
      if (cmp === 0) continue;
      return rule.dir === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

export interface RenderGroup { group: GroupDto; items: ItemDto[]; virtual?: boolean; /** bucket key for virtual (group-by) groups */ key?: string }

/* ------------------------------------------------------------------ group by */

const BUCKET_COLORS = ["#579bfc", "#00c875", "#a25ddc", "#fdab3d", "#ff158a", "#037f4c", "#66ccff", "#cab641", "#df2f4a", "#7f5347"];
const EMPTY_KEY = "__empty";

interface Bucket { key: string; label: string; color?: string; order: number | string | null }

/** The buckets (virtual groups) an item belongs to for a group-by column. Multi-value types return several. */
export function bucketsFor(col: ColumnDto, item: ItemDto, ctx: FormatContext): Bucket[] {
  const logic = getColumnLogic(col.type);
  const ref = asRef(col);
  const v = (item.values[col.id] ?? null) as Record<string, unknown> | null;
  const empty: Bucket = { key: EMPTY_KEY, label: "-", order: null };
  if (col.type === "status") {
    const labels = (col.settings.labels as { id: number; text: string; color: string; index: number }[] | undefined) ?? [];
    const l = v ? labels.find((x) => x.id === (v as { index?: number }).index) : undefined;
    return l && l.text ? [{ key: `s:${l.id}`, label: l.text, color: l.color, order: l.index }] : [empty];
  }
  if (col.type === "people") {
    const refs = ((v as { personsAndTeams?: { id: string; kind: string }[] } | null)?.personsAndTeams ?? []);
    const out = refs.map((p) => {
      const name = (p.kind === "team" ? ctx.teamNames?.get(p.id) : ctx.userNames?.get(p.id)) ?? p.id;
      return { key: `p:${p.id}`, label: name, order: name.toLowerCase() } as Bucket;
    });
    return out.length ? out : [empty];
  }
  if (col.type === "dropdown") {
    const labels = (col.settings.labels as { id: number; text: string }[] | undefined) ?? [];
    const ids = ((v as { ids?: (number | string)[] } | null)?.ids ?? []).map(Number);
    const out = ids.map((id, i) => {
      const idx = labels.findIndex((l) => l.id === id);
      return { key: `d:${id}`, label: labels[idx]?.text ?? String(id), order: idx >= 0 ? idx : 1000 + i } as Bucket;
    });
    return out.length ? out : [empty];
  }
  if (col.type === "tags") {
    const names = logic.format(v as never, ref, ctx).split(", ").map((s) => s.trim()).filter(Boolean);
    return names.length ? names.map((n) => ({ key: `t:${n}`, label: n, order: n.toLowerCase() })) : [empty];
  }
  const text = logic.format(v as never, ref, ctx);
  if (!text) return [empty];
  const sk = logic.sortKey ? logic.sortKey(v as never, ref, ctx) : null;
  return [{ key: `v:${text}`, label: text, order: sk ?? text.toLowerCase() }];
}

const cmpOrder = (a: Bucket, b: Bucket): number => {
  if (a.key === EMPTY_KEY) return 1;
  if (b.key === EMPTY_KEY) return -1;
  if (a.order === b.order) return 0;
  if (a.order === null) return 1;
  if (b.order === null) return -1;
  if (typeof a.order === "number" && typeof b.order === "number") return a.order - b.order;
  return String(a.order).localeCompare(String(b.order), undefined, { numeric: true });
};

/** Split items into the groups to render, applying filters/sort and optional virtual group-by. */
export function buildRenderGroups(
  groups: GroupDto[], allItems: ItemDto[], columns: ColumnDto[], state: ViewState, users: UserLite[], teams: { id: string; name: string }[] = [],
): RenderGroup[] {
  const ctx = formatContext(users, teams);
  const topLevel = allItems.filter((i) => !i.parentItemId);
  const subsOf = new Map<string, ItemDto[]>();
  if (state.search.trim()) for (const i of allItems) if (i.parentItemId) subsOf.set(i.parentItemId, [...(subsOf.get(i.parentItemId) ?? []), i]);
  const visible = sortItems(topLevel.filter((i) => itemMatches(i, columns, state, ctx, subsOf.get(i.id))), columns, state.sort, ctx);
  const filtering = hasActiveFilters(state);

  const gb = state.groupByColumnId ? columns.find((c) => c.id === state.groupByColumnId) : null;
  if (gb) {
    const buckets = new Map<string, { b: Bucket; items: ItemDto[] }>();
    for (const it of visible) {
      for (const b of bucketsFor(gb, it, ctx)) {
        if (!buckets.has(b.key)) buckets.set(b.key, { b, items: [] });
        buckets.get(b.key)!.items.push(it);
      }
    }
    return [...buckets.values()].sort((x, y) => cmpOrder(x.b, y.b)).map(({ b, items }, i) => ({
      group: { id: `virtual:${b.key}`, boardId: gb.boardId, title: b.label, color: b.color ?? (b.key === EMPTY_KEY ? "#c4c4c4" : BUCKET_COLORS[i % BUCKET_COLORS.length]), position: i },
      items, virtual: true, key: b.key,
    }));
  }

  return groups.map((g) => ({ group: g, items: visible.filter((i) => i.groupId === g.id) })).filter((rg) => !filtering || rg.items.length > 0);
}
