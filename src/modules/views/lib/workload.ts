/** Workload aggregation: per person load per day/bucket against capacity. Pure, unit-tested. */
import type { ColumnDto, ItemDto } from "@/lib/board-types";
import { isWeekend, rangeFromValue, workingDays, type DayRange } from "./dates";

export const UNASSIGNED = "none";

export interface WorkloadConfig {
  /** hours: total effort from `estimateColumn` (or `defaultDailyHours` per day when empty); items: 1 per item per day */
  mode: "hours" | "items";
  defaultDailyHours: number;
  /** capacity per working day (hours or items) */
  capacityPerDay: number;
  /** per user override of capacityPerDay */
  capacityByUser?: Record<string, number>;
}

export interface ItemLoad { itemId: string; range: DayRange; /** load per working day */ perDay: number; total: number }
export interface PersonLoad { id: string; perDay: Map<number, number>; items: ItemLoad[] }

export const assigneesOf = (item: ItemDto, peopleColumnId: string): string[] =>
  ((item.values[peopleColumnId] as { personsAndTeams?: { id: string; kind?: string }[] } | undefined)?.personsAndTeams ?? []).filter((p) => p.kind !== "team").map((p) => p.id);

export function itemLoad(item: ItemDto, rangeCol: ColumnDto, estimateCol: ColumnDto | null, cfg: WorkloadConfig, assignees: number): ItemLoad | null {
  const range = rangeFromValue(rangeCol.type, item.values[rangeCol.id]);
  if (!range) return null;
  const days = Math.max(1, workingDays(range));
  const share = Math.max(1, assignees);
  if (cfg.mode === "items") return { itemId: item.id, range, perDay: 1, total: days };
  const est = estimateCol ? Number(item.values[estimateCol.id]) : NaN;
  const hasEstimate = Number.isFinite(est) && est > 0;
  const total = hasEstimate ? est / share : (cfg.defaultDailyHours * days) / share;
  return { itemId: item.id, range, perDay: total / days, total };
}

/** Everyone's load per day. Items without people go to the UNASSIGNED row. */
export function aggregateWorkload(
  items: ItemDto[], peopleColumnId: string, rangeCol: ColumnDto, estimateCol: ColumnDto | null, cfg: WorkloadConfig,
): Map<string, PersonLoad> {
  const out = new Map<string, PersonLoad>();
  const row = (id: string) => { let r = out.get(id); if (!r) { r = { id, perDay: new Map(), items: [] }; out.set(id, r); } return r; };
  for (const item of items) {
    if (item.parentItemId) continue;
    const people = assigneesOf(item, peopleColumnId);
    const load = itemLoad(item, rangeCol, estimateCol, cfg, people.length);
    if (!load) continue;
    const owners = people.length ? people : [UNASSIGNED];
    const onlyWeekend = workingDays(load.range) === 0;
    for (const p of owners) {
      const r = row(p);
      r.items.push(load);
      for (let d = load.range.start; d <= load.range.end; d++) {
        if (isWeekend(d) && !onlyWeekend) continue;
        r.perDay.set(d, (r.perDay.get(d) ?? 0) + load.perDay);
      }
    }
  }
  return out;
}

export type LoadLevel = "empty" | "low" | "ok" | "over";
export interface BucketLoad { load: number; capacity: number; ratio: number; level: LoadLevel }

export const capacityFor = (userId: string, cfg: WorkloadConfig): number => cfg.capacityByUser?.[userId] ?? cfg.capacityPerDay;

/** Sum a person's load over a bucket (a day, a week ...) and compare with capacity of its working days. */
export function bucketLoad(person: PersonLoad | undefined, bucket: DayRange, cfg: WorkloadConfig): BucketLoad {
  const cap = capacityFor(person?.id ?? "", cfg) * workingDays(bucket);
  let load = 0;
  for (let d = bucket.start; d <= bucket.end; d++) load += person?.perDay.get(d) ?? 0;
  load = Math.round(load * 100) / 100;
  const ratio = cap > 0 ? load / cap : load > 0 ? Infinity : 0;
  const level: LoadLevel = load === 0 ? "empty" : ratio > 1.0001 ? "over" : ratio >= 0.6 ? "ok" : "low";
  return { load, capacity: cap, ratio, level };
}

export const LEVEL_COLORS: Record<LoadLevel, string> = { empty: "#f0f1f5", low: "#a8d4ff", ok: "#7fdba9", over: "#f27a8c" };

/** New people value after dragging an item from person `from` to person `to` (UNASSIGNED clears). */
export function reassignInput(item: ItemDto, peopleColumnId: string, from: string, to: string): unknown {
  const cur = ((item.values[peopleColumnId] as { personsAndTeams?: { id: string; kind: string }[] } | undefined)?.personsAndTeams ?? []);
  const next = cur.filter((p) => !(p.kind !== "team" && p.id === from));
  if (to !== UNASSIGNED && !next.some((p) => p.kind !== "team" && p.id === to)) next.push({ id: to, kind: "person" });
  return next.length ? { personsAndTeams: next } : null;
}
