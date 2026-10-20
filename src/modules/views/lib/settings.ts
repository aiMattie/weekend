/**
 * Per-view settings: the shape stored in `views.settings`, the defaults/auto-detection against a
 * board's columns, and the field list the generic settings dialog renders. Pure (no React).
 */
import type { ColumnDto } from "@/lib/board-types";

export type FieldKind = "column" | "columns" | "select" | "number" | "toggle";
export interface FieldDef {
  key: string;
  /** i18n key */
  label: string;
  kind: FieldKind;
  /** column types that can be picked (column / columns) */
  types?: string[];
  /** static options (select): value + i18n key */
  options?: { value: string; label: string }[];
  /** column kinds: allow "none" */
  optional?: boolean;
  min?: number;
  max?: number;
}

const DATE_TYPES = ["date", "timeline"];
const COLOR_TYPES = ["status", "dropdown"];
const ZOOMS = [{ value: "day", label: "vw.zoom.day" }, { value: "week", label: "vw.zoom.week" }, { value: "month", label: "vw.zoom.month" }, { value: "quarter", label: "vw.zoom.quarter" }];

export const VIEW_FIELDS: Record<string, FieldDef[]> = {
  kanban: [
    { key: "columnId", label: "vw.set.kanbanColumn", kind: "column", types: ["status", "dropdown", "people"] },
    { key: "cardFieldIds", label: "vw.set.cardFields", kind: "columns" },
    { key: "hideNoValueLane", label: "vw.set.hideNoValue", kind: "toggle" },
  ],
  calendar: [
    { key: "dateColumnIds", label: "vw.set.dateColumns", kind: "columns", types: DATE_TYPES },
    { key: "colorColumnId", label: "vw.set.colorBy", kind: "column", types: COLOR_TYPES, optional: true },
  ],
  timeline: [
    { key: "timelineColumnId", label: "vw.set.timelineColumn", kind: "column", types: DATE_TYPES },
    { key: "groupBy", label: "vw.set.groupBy", kind: "select", options: [{ value: "group", label: "vw.set.groupByGroup" }, { value: "person", label: "vw.set.groupByPerson" }, { value: "none", label: "vw.set.groupByNone" }] },
    { key: "peopleColumnId", label: "vw.set.peopleColumn", kind: "column", types: ["people"], optional: true },
    { key: "colorColumnId", label: "vw.set.colorBy", kind: "column", types: COLOR_TYPES, optional: true },
    { key: "zoom", label: "vw.set.zoom", kind: "select", options: ZOOMS },
  ],
  gantt: [
    { key: "timelineColumnId", label: "vw.set.timelineColumn", kind: "column", types: DATE_TYPES },
    { key: "dependencyColumnId", label: "vw.set.dependencyColumn", kind: "column", types: ["dependency"], optional: true },
    { key: "milestoneColumnId", label: "vw.set.milestoneColumn", kind: "column", types: ["checkbox"], optional: true },
    { key: "baselineColumnId", label: "vw.set.baselineColumn", kind: "column", types: ["timeline"], optional: true },
    { key: "colorColumnId", label: "vw.set.colorBy", kind: "column", types: COLOR_TYPES, optional: true },
    { key: "showCriticalPath", label: "vw.set.criticalPath", kind: "toggle" },
    { key: "shiftDependents", label: "vw.set.shiftDependents", kind: "toggle" },
    { key: "zoom", label: "vw.set.zoom", kind: "select", options: ZOOMS },
  ],
  workload: [
    { key: "peopleColumnId", label: "vw.set.peopleColumn", kind: "column", types: ["people"] },
    { key: "dateColumnId", label: "vw.set.timelineColumn", kind: "column", types: DATE_TYPES },
    { key: "estimateColumnId", label: "vw.set.estimateColumn", kind: "column", types: ["numbers"], optional: true },
    { key: "mode", label: "vw.set.workloadMode", kind: "select", options: [{ value: "hours", label: "vw.set.modeHours" }, { value: "items", label: "vw.set.modeItems" }] },
    { key: "capacityPerDay", label: "vw.set.capacity", kind: "number", min: 1, max: 24 },
    { key: "defaultDailyHours", label: "vw.set.defaultDaily", kind: "number", min: 0, max: 24 },
    { key: "granularity", label: "vw.set.granularity", kind: "select", options: [{ value: "day", label: "vw.zoom.day" }, { value: "week", label: "vw.zoom.week" }] },
  ],
  cards: [
    { key: "coverColumnId", label: "vw.set.coverColumn", kind: "column", types: ["file"], optional: true },
    { key: "cardFieldIds", label: "vw.set.cardFields", kind: "columns" },
  ],
  chart: [
    { key: "chartType", label: "vw.set.chartType", kind: "select", options: [{ value: "bar", label: "vw.chart.bar" }, { value: "stacked", label: "vw.chart.stacked" }, { value: "line", label: "vw.chart.line" }, { value: "pie", label: "vw.chart.pie" }] },
    { key: "xColumnId", label: "vw.set.xColumn", kind: "column", optional: true },
    { key: "stackColumnId", label: "vw.set.stackColumn", kind: "column", optional: true },
    { key: "metric", label: "vw.set.metric", kind: "select", options: [{ value: "count", label: "vw.metric.count" }, { value: "sum", label: "vw.metric.sum" }, { value: "avg", label: "vw.metric.avg" }] },
    { key: "yColumnId", label: "vw.set.yColumn", kind: "column", types: ["numbers"], optional: true },
  ],
  map: [
    { key: "locationColumnId", label: "vw.set.locationColumn", kind: "column", types: ["location"] },
    { key: "colorColumnId", label: "vw.set.colorBy", kind: "column", types: ["status"], optional: true },
  ],
  files: [
    { key: "fileColumnId", label: "vw.set.fileColumn", kind: "column", types: ["file"], optional: true },
  ],
};

export const hasSettings = (type: string): boolean => type !== "table" && type !== "form" && type !== "files" && type in VIEW_FIELDS;

export const itemColumns = (columns: ColumnDto[]): ColumnDto[] => columns.filter((c) => c.scope === "item" && c.type !== "name" && c.type !== "subtasks");

/** First column of the first type in `types` that exists (by position); `types` empty = any column. */
export function firstColumn(columns: ColumnDto[], types: string[]): ColumnDto | undefined {
  const cols = itemColumns(columns);
  if (!types.length) return cols[0];
  for (const t of types) { const hit = cols.find((c) => c.type === t); if (hit) return hit; } // earlier types are preferred
  return undefined;
}

/** Column with `id` if it exists (and matches `types`), else undefined. */
export function pickColumn(columns: ColumnDto[], id: unknown, types: string[] = []): ColumnDto | undefined {
  if (typeof id !== "string" || !id) return undefined;
  const c = columns.find((x) => x.id === id);
  return c && (!types.length || types.includes(c.type)) ? c : undefined;
}

/** Stored column id (`""`/missing = auto-detect the first matching column; `"none"` = explicitly off). */
export function resolveColumn(columns: ColumnDto[], stored: unknown, types: string[], autoDetect = true): ColumnDto | undefined {
  if (stored === "none") return undefined;
  return pickColumn(columns, stored, types) ?? (autoDetect ? firstColumn(columns, types) : undefined);
}

export const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
export const str = (v: unknown, fb: string): string => (typeof v === "string" ? v : fb);
export const num = (v: unknown, fb: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fb);
export const bool = (v: unknown, fb: boolean): boolean => (typeof v === "boolean" ? v : fb);
export const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T => (allowed.includes(v as T) ? (v as T) : fb);

/** Card fields: the stored list, or (never configured) the first `max` item columns except `skip`. */
export function resolveCardFields(columns: ColumnDto[], stored: unknown, skipIds: string[] = [], max = 3): ColumnDto[] {
  const cols = itemColumns(columns);
  if (Array.isArray(stored)) { const ids = strList(stored); return ids.map((id) => cols.find((c) => c.id === id)).filter((c): c is ColumnDto => !!c); }
  return cols.filter((c) => !skipIds.includes(c.id) && !["subtasks", "board_relation", "mirror"].includes(c.type)).slice(0, max);
}
