/**
 * Translation of monday column definitions and JSON values to the clone's storage.
 * The clone stores monday-shaped values, so most types map 1:1; the work is remapping ids
 * (users, items, assets), cleaning bookkeeping keys (changed_at, post_id) and rebuilding
 * settings (status labels with colors, dropdown labels, relations, mirrors, formulas).
 * Final validation always goes through the column registry's `validate()`.
 */
import { getColumnLogic, hasColumnLogic } from "../../columns/registry";
import type { MBoard, MColumn, MColumnValue } from "./monday-types";

export interface PlanColumn {
  mondayId: string;
  title: string;
  mondayType: string;
  type: string;
  key: string;
  scope: "item" | "subitem";
  settings: Record<string, unknown>;
  width?: number | null;
  description?: string | null;
  /** stored values are never written for computed columns */
  computed: boolean;
  /** settings that reference other boards/columns; resolved in a second pass */
  deferred?: { boardIds?: string[]; relationColumn?: string; displayedBoard?: string; displayedColumn?: string; formula?: string; aggregate?: string };
}

/** monday type -> clone type. Unlisted types are kept under their own name (fallback = verbatim JSON). */
const TYPE_MAP: Record<string, string> = { person: "people", "multiple-person": "people", color_picker: "color_picker" };
const COMPUTED = new Set(["mirror", "formula", "auto_number", "creation_log", "last_updated", "item_id", "progress", "lookup", "subtasks", "button", "tags_computed"]);
const SIMPLE_CHANGED_AT = ["changed_at", "post_id", "updated_at"];

export const safeJson = <T = unknown>(s: string | null | undefined, fallback: T): T => {
  if (s === null || s === undefined || s === "") return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

/** monday column ids are mostly [a-z0-9_]; make them valid clone keys. */
export function cloneKey(mondayId: string): string {
  const k = mondayId.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(k) ? k.slice(0, 60) : `c_${k}`.slice(0, 60);
}

function statusSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const labels = (raw.labels ?? {}) as Record<string, string>;
  const colors = (raw.labels_colors ?? {}) as Record<string, { color?: string }>;
  const pos = (raw.labels_positions_v2 ?? raw.labels_positions ?? {}) as Record<string, number>;
  const done = new Set(((raw.done_colors ?? []) as number[]).map(String));
  const ids = new Set<string>([...Object.keys(labels), ...Object.keys(colors)]);
  const list = [...ids].filter((id) => /^\d+$/.test(id)).map((id) => ({
    id: Number(id), text: String(labels[id] ?? ""), color: /^#[0-9a-fA-F]{6}$/.test(colors[id]?.color ?? "") ? colors[id]!.color! : "#c4c4c4",
    index: typeof pos[id] === "number" ? pos[id] : 1000 + Number(id), isDone: done.has(id),
  }));
  if (!list.some((l) => l.id === 5)) list.push({ id: 5, text: "", color: "#c4c4c4", index: 999, isDone: false });
  return { labels: list.sort((a, b) => a.index - b.index).map((l, i) => ({ ...l, index: i })) };
}

function numbersSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const u = (raw.unit ?? {}) as { symbol?: string; custom_unit?: string; direction?: string };
  const unit = u.symbol === "custom" ? (u.custom_unit ?? "") : (u.symbol ?? "");
  return { unit, unitPosition: u.direction === "left" ? "left" : "right" };
}

/** Build the clone-side plan for one monday column (settings that need other boards are `deferred`). */
export function planColumn(col: MColumn, scope: "item" | "subitem", board?: MBoard): PlanColumn {
  const raw = safeJson<Record<string, unknown>>(col.settings_str, {});
  const type = TYPE_MAP[col.type] ?? col.type;
  const plan: PlanColumn = {
    mondayId: col.id, title: col.title, mondayType: col.type, type, key: cloneKey(col.id), scope, settings: {},
    width: col.width ?? null, description: col.description ?? null, computed: COMPUTED.has(col.type),
  };
  switch (col.type) {
    case "status": plan.settings = statusSettings(raw); break;
    case "dropdown": {
      const labels = ((raw.labels ?? []) as { id: number; name: string }[]).map((l) => ({ id: Number(l.id), text: String(l.name) }));
      plan.settings = { labels, allowMultiple: raw.limit_select !== true };
      break;
    }
    case "numbers": plan.settings = numbersSettings(raw); break;
    case "board_relation": plan.deferred = { boardIds: ((raw.boardIds ?? []) as (string | number)[]).map(String) }; plan.settings = { allowMultiple: true }; break;
    case "mirror": {
      const rel = Object.keys((raw.relation_column ?? {}) as object)[0];
      const linked = Object.entries((raw.displayed_linked_columns ?? {}) as Record<string, string[]>)[0];
      const fn = String(raw.function ?? raw.sumType ?? "").toLowerCase();
      plan.deferred = { relationColumn: rel, displayedBoard: linked?.[0], displayedColumn: linked?.[1]?.[0], aggregate: ["sum", "avg", "min", "max", "median", "count"].includes(fn) ? fn : "none" };
      break;
    }
    case "formula": plan.deferred = { formula: String(raw.formula ?? "") }; break;
    case "subtasks": plan.settings = {}; break;
    default: plan.settings = {};
  }
  void board;
  return plan;
}

/** Replace `{column_id}` references of a monday formula by `{Column Title}`. */
export function translateFormula(formula: string, titleById: (id: string) => string | undefined): { formula: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const out = formula.replace(/\{([^}]+)\}/g, (_m, id: string) => {
    const t = titleById(id);
    if (!t) unresolved.push(id);
    return `{${t ?? id}}`;
  });
  return { formula: out, unresolved };
}

export interface ValueCtx {
  userId(mondayUserId: string | number): string | undefined;
  assetId(mondayAssetId: string | number): string | undefined;
  /** relation targets; undefined when the target item is not imported (yet) */
  itemId(mondayItemId: string | number): string | undefined;
  /** column info for validate() in the clone (settings of the plan) */
  columnRef(plan: PlanColumn): { id: string; key: string; title: string; type: string; settings: Record<string, unknown> };
}

export interface TranslateResult { value?: unknown; warning?: string; skipped?: boolean }

const clean = (o: unknown): unknown => {
  if (o && typeof o === "object" && !Array.isArray(o)) {
    const c = { ...(o as Record<string, unknown>) };
    for (const k of SIMPLE_CHANGED_AT) delete c[k];
    return c;
  }
  return o;
};

/** monday `column_values` entry -> stored value for the clone (undefined = leave empty). */
export function translateValue(plan: PlanColumn, cv: Pick<MColumnValue, "value" | "text">, ctx: ValueCtx): TranslateResult {
  if (plan.computed || plan.type === "name") return { skipped: true };
  if (cv.value === null || cv.value === undefined || cv.value === "" || cv.value === "null") return {};
  const parsed = safeJson<unknown>(cv.value, undefined);
  if (parsed === undefined) return { warning: `${plan.title}: value is not valid JSON` };
  const warn: string[] = [];
  let input: unknown = clean(parsed);
  switch (plan.mondayType) {
    case "text": case "numbers": case "color_picker": break;
    case "checkbox": input = { checked: (parsed as { checked?: unknown })?.checked === true || (parsed as { checked?: unknown })?.checked === "true" }; break;
    case "people": case "person": case "multiple-person": {
      const o = parsed as { personsAndTeams?: { id: number | string; kind?: string }[]; id?: number | string };
      const list = o.personsAndTeams ?? (o.id !== undefined ? [{ id: o.id, kind: "person" }] : []);
      const mapped: { id: string; kind: "person" | "team" }[] = [];
      for (const p of list) {
        if ((p.kind ?? "person") === "team") continue; // team ids are not mapped into people columns
        const id = ctx.userId(p.id);
        if (id) mapped.push({ id, kind: "person" });
        else warn.push(`${plan.title}: unknown monday user ${p.id} dropped`);
      }
      input = mapped.length ? { personsAndTeams: mapped } : null;
      break;
    }
    case "board_relation": {
      const ids = ((parsed as { linkedPulseIds?: { linkedPulseId: number | string }[] }).linkedPulseIds ?? []).map((l) => String(l.linkedPulseId));
      const mapped = ids.map((i) => ctx.itemId(i)).filter(Boolean) as string[];
      if (mapped.length < ids.length) warn.push(`${plan.title}: ${ids.length - mapped.length} linked item(s) not imported`);
      input = mapped.length ? { linkedPulseIds: mapped.map((linkedPulseId) => ({ linkedPulseId })) } : null;
      break;
    }
    case "file": {
      type F = { assetId?: number | string; name?: string | null; isImage?: string | boolean; fileType?: string; linkToFile?: string; url?: string };
      const files = ((parsed as { files?: F[] }).files ?? []);
      const mapped: Record<string, unknown>[] = [];
      for (const f of files) {
        const asset = f.assetId !== undefined ? ctx.assetId(f.assetId) : undefined;
        const link = f.linkToFile ?? f.url;
        if (asset) mapped.push({ assetId: asset, name: f.name ?? "", isImage: f.isImage === true || f.isImage === "true" });
        else if (link && /^https?:\/\//.test(link)) mapped.push({ linkToFile: link, name: f.name || (f.fileType === "MONDAY_DOC" ? "monday doc" : link) });
        else warn.push(`${plan.title}: file without asset or link skipped`);
      }
      input = mapped.length ? { files: mapped } : null;
      break;
    }
    case "time_tracking": {
      const o = parsed as { additional_value?: Record<string, unknown>[]; running?: unknown; startDate?: unknown; duration?: unknown };
      input = {
        running: o.running === true || o.running === "true", startDate: o.startDate ?? null, duration: Number(o.duration ?? 0),
        additional_value: (o.additional_value ?? []).map((h) => ({ ...h, started_user_id: ctx.userId(h.started_user_id as string) ?? null, ended_user_id: ctx.userId(h.ended_user_id as string) ?? null })),
      };
      break;
    }
    case "doc": warn.push(`${plan.title}: doc column stored raw (docs are imported separately)`); break;
    default: break;
  }
  if (input === null) return warn.length ? { warning: warn.join("; ") } : {};
  try {
    const logic = getColumnLogic(plan.type);
    const stored = logic.validate(input, ctx.columnRef(plan));
    if (!hasColumnLogic(plan.type)) warn.push(`${plan.title}: unknown column type "${plan.mondayType}", value stored raw`);
    return { value: stored ?? undefined, warning: warn.length ? warn.join("; ") : undefined };
  } catch (e) {
    return { warning: `${plan.title} (${plan.mondayType}): ${(e as Error).message}; value skipped` };
  }
}
