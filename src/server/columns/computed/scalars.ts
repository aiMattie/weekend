/** Turn stored column values into formula scalars / numbers. Pure; the logic resolver is injected. */
import type { ColumnLogic, ColumnRef, FormatContext } from "../types";
import { totalSeconds, type TimeValue } from "../time_tracking";
import type { Val } from "./formula-lang";

/** Types whose value can be summed / averaged. */
export function numericValue(type: string, value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const v = value as Record<string, unknown>;
  switch (type) {
    case "numbers": return typeof value === "number" ? value : null;
    case "rating": return typeof v.rating === "number" ? v.rating : null;
    case "progress": return typeof v.percent === "number" ? v.percent : null;
    case "auto_number": return typeof value === "number" ? value : null;
    case "vote": return Array.isArray(v.votersIds) ? v.votersIds.length : null;
    case "time_tracking": return totalSeconds(value as TimeValue) / 3600;
    case "hour": return typeof v.hour === "number" ? v.hour + (Number(v.minute) || 0) / 60 : null;
    case "formula": return typeof v.value === "number" ? v.value : null;
    case "mirror": return typeof v.result === "number" ? v.result : null;
    case "checkbox": return null;
    default: return null;
  }
}

export function scalarOf(logic: ColumnLogic, column: ColumnRef, value: unknown, ctx?: FormatContext): Val {
  if (value === null || value === undefined) return null;
  const v = value as Record<string, unknown>;
  switch (column.type) {
    case "checkbox": return !!v.checked;
    case "date": return typeof v.date === "string" ? { date: v.date } : null;
    case "timeline": return typeof v.from === "string" ? { date: v.from } : null;
    case "formula": return v.kind === "date" && typeof v.value === "string" ? { date: v.value } : ((v.value ?? null) as Val);
    case "mirror": {
      if (typeof v.result === "number") return v.result;
      const entries = (v.entries as { value: unknown }[] | undefined) ?? [];
      const target = v.column as ColumnRef | null;
      if (!target) return null;
      return entries.map((e) => numericValue(target.type, e.value) ?? (logicText(target, e.value)));
    }
    default: {
      const n = numericValue(column.type, value);
      if (n !== null) return n;
      const t = logic.format(value as never, column, ctx);
      return t === "" ? null : t;
    }
  }
}

// set by registry (avoids a circular import); used for mirror entries
let resolver: ((type: string) => ColumnLogic) | null = null;
export const bindScalarResolver = (fn: (type: string) => ColumnLogic): void => { resolver = fn; };
export const logicOf = (type: string): ColumnLogic => {
  if (!resolver) throw new Error("column logic resolver not bound (import the registry first)");
  return resolver(type);
};
const logicText = (c: ColumnRef, value: unknown): string => logicOf(c.type).format(value as never, c);
