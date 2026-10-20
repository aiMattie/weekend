/**
 * Column values in API shapes. Stored values (items.values) are already in that shape; this
 * layer adds the last bit of fidelity (numbers as strings, checkbox "true", numeric person ids),
 * builds `text`, and implements create_labels_if_missing for status/dropdown input.
 */
import { getColumnLogic } from "@/server/columns/registry";
import type { FormatContext } from "@/server/columns/types";
import type { ColumnRow, ItemRow } from "@/server/services/_shared";
import type { Actor } from "@/lib/actor";
import { ValidationError } from "@/lib/errors";
import { WEEKEND_COLORS } from "@/lib/colors";
import * as columnsService from "@/server/services/columns";

export interface ColumnValueDto {
  id: string;
  type: string;
  text: string;
  /** value in API shape (object/primitive) or null */
  raw: unknown;
  column: ColumnRow;
  item: ItemRow;
}

const numIfInt = (id: unknown): unknown => (typeof id === "string" && /^\d{1,15}$/.test(id) ? Number(id) : id);

/** stored/serialised value -> what the API returns in `value` (before JSON.stringify). */
export function toApiValue(col: ColumnRow, ser: unknown): unknown {
  if (ser === null || ser === undefined) return null;
  switch (col.type) {
    case "numbers": return typeof ser === "number" ? String(ser) : ser;
    case "checkbox": return (ser as { checked?: unknown }).checked ? { checked: "true" } : null;
    case "people": {
      const p = (ser as { personsAndTeams?: { id: unknown; kind: string }[] }).personsAndTeams;
      return p ? { personsAndTeams: p.map((e) => ({ id: numIfInt(e.id), kind: e.kind })) } : ser;
    }
    case "board_relation":
    case "dependency": {
      const o = ser as { item_ids?: unknown[]; linkedPulseIds?: { linkedPulseId: unknown }[] };
      if (Array.isArray(o.linkedPulseIds)) return { linkedPulseIds: o.linkedPulseIds.map((p) => ({ linkedPulseId: numIfInt(p.linkedPulseId) })) };
      if (Array.isArray(o.item_ids)) return { linkedPulseIds: o.item_ids.map((id) => ({ linkedPulseId: numIfInt(id) })) };
      return ser;
    }
    case "mirror": case "formula": case "item_id": case "auto_number": return null;
    default: return ser;
  }
}

export function buildColumnValue(item: ItemRow, col: ColumnRow, fmt?: FormatContext): ColumnValueDto {
  if (col.type === "name") return { id: col.key, type: "name", text: item.name, raw: null, column: col, item };
  const logic = getColumnLogic(col.type);
  const stored = (item.values[col.id] ?? null) as never;
  let text = "";
  let ser: unknown = null;
  try { text = logic.format(stored, col, fmt); } catch { text = ""; }
  try { ser = logic.serialize(stored, col); } catch { ser = stored; }
  return { id: col.key, type: col.type, text, raw: toApiValue(col, ser), column: col, item };
}

export function buildColumnValues(item: ItemRow, cols: ColumnRow[], fmt?: FormatContext, filter?: { ids?: string[] | null; types?: string[] | null }): ColumnValueDto[] {
  const scope = item.parentItemId ? "subitem" : "item";
  let list = cols.filter((c) => c.scope === scope && !c.archived);
  if (filter?.ids?.length) list = list.filter((c) => filter.ids!.includes(c.key) || filter.ids!.includes(c.id));
  if (filter?.types?.length) list = list.filter((c) => filter.types!.includes(c.type));
  return list.map((c) => buildColumnValue(item, c, fmt));
}

/** API `value` strings -> object. Accepts an already parsed object too. */
export function parseJsonInput(v: unknown, what = "value"): unknown {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { throw new ValidationError(`Invalid JSON in ${what}`); }
}

export function parseValuesObject(v: unknown, what = "column_values"): Record<string, unknown> {
  const parsed = parseJsonInput(v, what);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new ValidationError(`${what} must be a JSON object keyed by column id`);
  return parsed as Record<string, unknown>;
}

/* ------------------------------------------------------------ colors + labels */

const COLOR_BY_NAME = new Map(WEEKEND_COLORS.map((c) => [c.name, c.hex]));
/** Color name ("done-green"), index ("1") or hex -> #rrggbb. */
export function resolveColor(c: unknown, fallbackIndex = 0): string {
  if (typeof c === "string") {
    if (/^#[0-9a-f]{6}$/i.test(c)) return c;
    const hit = COLOR_BY_NAME.get(c);
    if (hit) return hit;
  }
  if (typeof c === "number") return WEEKEND_COLORS[c % WEEKEND_COLORS.length].hex;
  return WEEKEND_COLORS[fallbackIndex % WEEKEND_COLORS.length].hex;
}

export const colorName = (hex: string): string => WEEKEND_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name ?? "explosive";

/** create_labels_if_missing: add unknown status/dropdown labels to the column settings before saving. */
export function ensureLabels(actor: Actor, boardId: string, cols: ColumnRow[], values: Record<string, unknown>): void {
  for (const [ref, input] of Object.entries(values)) {
    const col = cols.find((c) => c.key === ref || c.id === ref);
    if (!col || (col.type !== "status" && col.type !== "dropdown")) continue;
    const labels = (Array.isArray(col.settings.labels) ? col.settings.labels : []) as { id: number; text: string; color?: string; index?: number }[];
    const wanted: string[] = [];
    const o = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
    if (col.type === "status") {
      const l = o && typeof o.label === "string" ? o.label : typeof input === "string" && !/^\d+$/.test(input) ? input : null;
      if (l) wanted.push(l);
    } else {
      const arr = Array.isArray(input) ? input : o && Array.isArray(o.labels) ? o.labels : typeof input === "string" ? input.split(",") : [];
      for (const e of arr) if (typeof e === "string" && !/^\d+$/.test(e.trim())) wanted.push(e.trim());
    }
    const missing = wanted.filter((w) => w && !labels.some((l) => l.text.toLowerCase() === w.toLowerCase()));
    if (!missing.length) continue;
    let nextId = labels.reduce((m, l) => Math.max(m, l.id), -1) + 1;
    const added = [...new Set(missing)].map((text, i) => ({ id: nextId++, text, ...(col.type === "status" ? { color: WEEKEND_COLORS[(labels.length + i) % WEEKEND_COLORS.length].hex, index: labels.length + i } : {}) }));
    columnsService.update(actor, col.id, { settings: { labels: [...labels, ...added] } });
    col.settings = { ...col.settings, labels: [...labels, ...added] };
  }
}

/** settings_str as the API returns it, per column type. */
export function settingsStr(col: ColumnRow): string {
  const s = col.settings ?? {};
  if (col.type === "status") {
    const labels = (Array.isArray(s.labels) ? s.labels : []) as { id: number; text: string; color: string; isDone?: boolean }[];
    return JSON.stringify({
      labels: Object.fromEntries(labels.map((l) => [String(l.id), l.text])),
      labels_positions_v2: Object.fromEntries(labels.map((l, i) => [String(l.id), i])),
      labels_colors: Object.fromEntries(labels.map((l) => [String(l.id), { color: l.color, border: l.color, var_name: colorName(l.color) }])),
      done_colors: labels.filter((l) => l.isDone).map((l) => l.id),
    });
  }
  if (col.type === "dropdown") {
    const labels = (Array.isArray(s.labels) ? s.labels : []) as { id: number; text: string }[];
    return JSON.stringify({ limit_select: s.allowMultiple === false, labels: labels.map((l) => ({ id: l.id, name: l.text })) });
  }
  return JSON.stringify(s);
}

/** API `defaults` for create_status_column / create_dropdown_column -> our settings. */
export function labelDefaultsToSettings(type: "status" | "dropdown", defaults: unknown): Record<string, unknown> {
  const o = (defaults && typeof defaults === "object" ? defaults : {}) as { labels?: unknown };
  const raw = Array.isArray(o.labels) ? o.labels : o.labels && typeof o.labels === "object" ? Object.entries(o.labels).map(([id, label]) => ({ id: Number(id), label })) : [];
  if (type === "dropdown") {
    return { labels: raw.map((l, i) => { const r = (l ?? {}) as Record<string, unknown>; return { id: typeof r.id === "number" ? r.id : i + 1, text: String(r.label ?? r.name ?? r.text ?? l) }; }) };
  }
  const labels = raw.map((l, i) => {
    const r = (l ?? {}) as Record<string, unknown>;
    return { id: typeof r.id === "number" ? r.id : typeof r.index === "number" ? r.index : i, text: String(r.label ?? r.text ?? ""), color: resolveColor(r.color, i), index: i, isDone: Boolean(r.is_done ?? r.isDone) };
  });
  return labels.length ? { labels } : {};
}
