/**
 * `items_page` machinery: query_params (rules / operator / order_by / groups / ids),
 * `items_page_by_column_values`, and opaque cursors. Everything runs in memory on top of the
 * items service (computed columns included); stable for boards up to a few thousand items.
 */
import { z } from "zod";
import type { Actor } from "@/lib/actor";
import { ValidationError } from "@/lib/errors";
import { getColumnLogic } from "@/server/columns/registry";
import type { FormatContext } from "@/server/columns/types";
import { formatContext, resolveColumn, type ColumnRow, type ItemRow } from "@/server/services/_shared";
import * as itemsService from "@/server/services/items";
import * as columnsService from "@/server/services/columns";
import * as groupsService from "@/server/services/groups";

export interface ItemsQueryParams {
  ids?: string[] | null;
  operator?: "and" | "or" | null;
  rules?: { column_id: string; compare_value: unknown; operator?: string | null; compare_attribute?: string | null }[] | null;
  order_by?: { column_id: string; direction?: "asc" | "desc" | null }[] | null;
  groups?: { group_ids?: string[] | null; column_id?: string | null; active?: boolean | null }[] | null;
}

/* ------------------------------------------------------------ dates */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Inclusive [from, to] ISO range for date tokens (TODAY, THIS_WEEK, ...). */
export function dateRange(token: string, exact?: string, now = new Date()): [string | null, string | null] | null {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monday = addDays(today, -((today.getUTCDay() + 6) % 7));
  const month = (offset: number): [string, string] => {
    const s = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
    const e = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset + 1, 0));
    return [iso(s), iso(e)];
  };
  switch (token.toUpperCase()) {
    case "TODAY": return [iso(today), iso(today)];
    case "YESTERDAY": return [iso(addDays(today, -1)), iso(addDays(today, -1))];
    case "TOMORROW": return [iso(addDays(today, 1)), iso(addDays(today, 1))];
    case "THIS_WEEK": return [iso(monday), iso(addDays(monday, 6))];
    case "LAST_WEEK": return [iso(addDays(monday, -7)), iso(addDays(monday, -1))];
    case "NEXT_WEEK": return [iso(addDays(monday, 7)), iso(addDays(monday, 13))];
    case "THIS_MONTH": return month(0);
    case "LAST_MONTH": return month(-1);
    case "NEXT_MONTH": return month(1);
    case "PAST_DATETIME": return [null, iso(addDays(today, -1))];
    case "FUTURE_DATETIME": return [iso(addDays(today, 1)), null];
    case "EXACT": return exact ? [exact.slice(0, 10), exact.slice(0, 10)] : null;
    default: return /^\d{4}-\d{2}-\d{2}/.test(token) ? [token.slice(0, 10), token.slice(0, 10)] : null;
  }
}

/* ------------------------------------------------------------ cell access */

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const lower = (v: unknown) => String(v ?? "").toLowerCase();

function cellDate(col: ColumnRow, v: unknown, attr?: string | null): string | null {
  if (!v || typeof v !== "object") return typeof v === "string" ? v.slice(0, 10) : null;
  const o = v as Record<string, unknown>;
  if (col.type === "timeline") return String((attr?.toUpperCase() === "END_DATE" ? o.to : o.from) ?? "").slice(0, 10) || null;
  if (col.type === "week") return String(o.startDate ?? o.start_date ?? "").slice(0, 10) || null;
  return typeof o.date === "string" ? o.date.slice(0, 10) : null;
}

function cellNumber(col: ColumnRow, v: unknown, text: string): number | null {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && typeof (v as { rating?: unknown }).rating === "number") return (v as { rating: number }).rating;
  const n = Number(text.replace(",", "."));
  return text !== "" && Number.isFinite(n) ? n : null;
}

/** identifiers of the "members" of a set-like cell, used by any_of / not_any_of */
function cellIds(col: ColumnRow, v: unknown, text: string): string[] {
  const o = (v ?? {}) as Record<string, unknown>;
  switch (col.type) {
    case "status": return v ? [String(o.index), lower(text)] : [];
    case "dropdown": return v ? [...asArray(o.ids).map(String), ...text.split(",").map((t) => lower(t.trim()))] : [];
    case "people": return asArray(o.personsAndTeams).flatMap((p) => { const q = p as { id: unknown; kind?: string }; return [String(q.id), `${q.kind === "team" ? "team" : "person"}-${q.id}`]; });
    case "tags": return asArray(o.tag_ids ?? o.ids).map(String);
    case "board_relation": return asArray(o.item_ids ?? o.linkedPulseIds).map((x) => String(typeof x === "object" && x ? (x as { linkedPulseId?: unknown }).linkedPulseId : x));
    case "checkbox": return [o.checked ? "true" : "false"];
    default: return text === "" ? [] : [lower(text)];
  }
}

function ruleMatches(col: ColumnRow, item: ItemRow, rule: NonNullable<ItemsQueryParams["rules"]>[number], fmt: FormatContext, actor: Actor): boolean {
  const isName = col.type === "name";
  const v = isName ? item.name : (item.values[col.id] ?? null);
  const logic = getColumnLogic(col.type);
  const text = isName ? item.name : logic.format(v as never, col, fmt);
  const op = rule.operator ?? "any_of";
  const cmp = asArray(rule.compare_value);
  const empty = !isName && (v === null || v === undefined || text === "");

  switch (op) {
    case "is_empty": return empty;
    case "is_not_empty": return !empty;
    case "any_of":
    case "not_any_of": {
      let hit: boolean;
      const dateTokens = col.type === "date" || col.type === "timeline" || col.type === "week" || col.type === "creation_log" || col.type === "last_updated";
      if (dateTokens && cmp.some((c) => typeof c === "string" && /^[A-Z_]+$|^\d{4}-/.test(c))) {
        const exactIdx = cmp.findIndex((c) => String(c).toUpperCase() === "EXACT");
        const r = exactIdx >= 0 ? dateRange("EXACT", String(cmp[exactIdx + 1] ?? "")) : cmp.map((c) => dateRange(String(c))).find(Boolean) ?? null;
        const d = cellDate(col, v, rule.compare_attribute);
        hit = !!r && !!d && (r[0] === null || d >= r[0]) && (r[1] === null || d <= r[1]);
      } else {
        const ids = cellIds(col, v, text);
        hit = cmp.some((c) => {
          if (c === null || c === "") return empty;
          if (c === "assigned_to_me") return ids.includes(`person-${actor.id}`);
          return ids.includes(lower(c)) || ids.includes(String(c));
        });
      }
      return op === "any_of" ? hit : !hit;
    }
    case "greater_than":
    case "greater_than_or_equals":
    case "lower_than":
    case "lower_than_or_equal":
    case "between": {
      const isDate = ["date", "timeline", "week", "creation_log", "last_updated"].includes(col.type);
      const a = isDate ? cellDate(col, v, rule.compare_attribute) : cellNumber(col, v, text);
      if (a === null) return false;
      const conv = (x: unknown) => (isDate ? String(x).slice(0, 10) : Number(x));
      const x = conv(cmp[0]);
      if (op === "between") return a >= x && a <= conv(cmp[1]);
      if (op === "greater_than") return a > x;
      if (op === "greater_than_or_equals") return a >= x;
      if (op === "lower_than") return a < x;
      return a <= x;
    }
    case "contains_text": return cmp.some((c) => lower(text).includes(lower(c)));
    case "not_contains_text": return !cmp.some((c) => lower(text).includes(lower(c)));
    case "contains_terms": return cmp.every((c) => lower(text).includes(lower(c)));
    case "starts_with": return cmp.some((c) => lower(text).startsWith(lower(c)));
    case "ends_with": return cmp.some((c) => lower(text).endsWith(lower(c)));
    case "within_the_next":
    case "within_the_last": {
      const d = cellDate(col, v, rule.compare_attribute);
      if (!d) return false;
      const n = Number(cmp[0] ?? 0);
      const unit = String(cmp[1] ?? "DAYS").toUpperCase();
      const days = unit.startsWith("WEEK") ? n * 7 : unit.startsWith("MONTH") ? n * 30 : n;
      const today = iso(new Date());
      return op === "within_the_next" ? d >= today && d <= iso(addDays(new Date(), days)) : d <= today && d >= iso(addDays(new Date(), -days));
    }
    default: throw new ValidationError(`Unsupported rule operator "${op}"`);
  }
}

/* ------------------------------------------------------------ query */

function sortValue(col: ColumnRow, item: ItemRow, fmt: FormatContext): string | number | null {
  if (col.type === "name") return item.name.toLowerCase();
  const v = item.values[col.id] ?? null;
  const logic = getColumnLogic(col.type);
  if (logic.sortKey) return logic.sortKey(v as never, col, fmt);
  const t = logic.format(v as never, col, fmt);
  return t === "" ? null : t.toLowerCase();
}

export interface QueryResult { items: ItemRow[]; total: number }

/** Load every active top-level item of a board, apply query_params, return the full ordered list. */
export function queryBoardItems(actor: Actor, boardId: string, params: ItemsQueryParams | null | undefined, opts: { onlyGroupId?: string } = {}): ItemRow[] {
  const all: ItemRow[] = itemsService.list(actor, { boardId, limit: 5000 });
  const cols = columnsService.list(actor, boardId, "item");
  const fmt = formatContext(actor.accountId);
  // monday order: group order first, then position inside the group
  const groupOrder = new Map(groupsService.list(actor, boardId).map((g, i) => [g.id, i]));
  let rows = [...all].sort((a, b) => (groupOrder.get(a.groupId ?? "") ?? 1e9) - (groupOrder.get(b.groupId ?? "") ?? 1e9) || a.position - b.position);
  if (opts.onlyGroupId) rows = rows.filter((i) => i.groupId === opts.onlyGroupId);
  const p = params ?? {};
  if (p.ids?.length) {
    const want = new Set(p.ids.map(String));
    rows = rows.filter((i) => want.has(i.id));
  }
  const groupIds = (p.groups ?? []).flatMap((g) => g.group_ids ?? []).map(String);
  if (groupIds.length) rows = rows.filter((i) => i.groupId && groupIds.includes(i.groupId));
  if (p.rules?.length) {
    const compiled = p.rules.map((r) => ({ r, col: resolveColumn(boardId, r.column_id, "item") }));
    const useOr = p.operator === "or";
    rows = rows.filter((it) => {
      const results = compiled.map(({ r, col }) => ruleMatches(col, it, r, fmt, actor));
      return useOr ? results.some(Boolean) : results.every(Boolean);
    });
  }
  if (p.order_by?.length) {
    const orders = p.order_by.map((o) => ({ col: resolveColumn(boardId, o.column_id, "item"), dir: o.direction === "desc" ? -1 : 1 }));
    const keyed = rows.map((it) => ({ it, keys: orders.map((o) => sortValue(o.col, it, fmt)) }));
    keyed.sort((a, b) => {
      for (let i = 0; i < orders.length; i++) {
        const x = a.keys[i]; const y = b.keys[i];
        if (x === y) continue;
        if (x === null) return 1; // empty values always last
        if (y === null) return -1;
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
        if (c !== 0) return c * orders[i].dir;
      }
      return 0;
    });
    rows = keyed.map((k) => k.it);
  }
  void cols;
  return rows;
}

/** items_page_by_column_values: each entry matches when the cell text/ids equal one of the values. */
export function queryByColumnValues(actor: Actor, boardId: string, filters: { column_id: string; column_values: (string | null)[] }[]): ItemRow[] {
  const rules = filters.map((f) => ({ column_id: f.column_id, compare_value: f.column_values, operator: "any_of" as const }));
  return queryBoardItems(actor, boardId, { rules, operator: "and" });
}

/* ------------------------------------------------------------ cursors */

const cursorSchema = z.object({ v: z.literal(1), b: z.string(), o: z.number().int().min(0), q: z.any(), exp: z.number(), g: z.string().optional() });
export type CursorState = { boardId: string; offset: number; params: ItemsQueryParams | null; byValues?: { column_id: string; column_values: (string | null)[] }[]; groupId?: string };

const ttlMs = () => (Number(process.env.API_CURSOR_TTL_MINUTES) > 0 ? Number(process.env.API_CURSOR_TTL_MINUTES) : 60) * 60_000;

export function encodeCursor(s: CursorState): string {
  return Buffer.from(JSON.stringify({ v: 1, b: s.boardId, o: s.offset, q: { p: s.params, bv: s.byValues }, g: s.groupId, exp: Date.now() + ttlMs() })).toString("base64url");
}

export function decodeCursor(cursor: string): CursorState {
  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (parsed.exp < Date.now()) throw new ValidationError("Cursor has expired, start a new items_page query");
    return { boardId: parsed.b, offset: parsed.o, params: parsed.q?.p ?? null, byValues: parsed.q?.bv, groupId: parsed.g };
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError("Invalid cursor");
  }
}

export interface Page { cursor: string | null; items: ItemRow[] }

/** One page of a query; `cursor` is null when there is nothing more. */
export function pageItems(actor: Actor, state: CursorState, limit: number): Page {
  const size = Math.max(1, Math.min(limit, 500));
  const rows = state.byValues ? queryByColumnValues(actor, state.boardId, state.byValues) : queryBoardItems(actor, state.boardId, state.params, { onlyGroupId: state.groupId });
  const slice = rows.slice(state.offset, state.offset + size);
  const next = state.offset + size;
  return { items: slice, cursor: next < rows.length ? encodeCursor({ ...state, offset: next }) : null };
}
