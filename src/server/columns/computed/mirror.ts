import { NUMBER_OPS, TEXT_OPS, testNumber, testText } from "../ops";
import type { ColumnLogic, ColumnRef } from "../types";
import { AGGREGATE_FNS, aggregate, type AggregateFn } from "../util";
import { ValidationError } from "../../../lib/errors";
import { logicOf, numericValue } from "./scalars";

/**
 * mirror: shows a column of the items linked through a board_relation column. Computed on read by
 * services/computed.ts, never stored. settings:
 *   relationColumnId   id or key of the board_relation column on THIS board
 *   targetColumnId     id or key of the column on the linked board
 *   aggregate          none | sum | avg | min | max | median | count   (default none = list)
 */
export type MirrorEntry = { itemId: string; name: string; value: unknown };
export type MirrorValue = { column: ColumnRef | null; entries: MirrorEntry[]; aggregate: AggregateFn; result: number | null };

export const mirrorNumbers = (v: MirrorValue): number[] =>
  v.column ? v.entries.map((e) => numericValue(v.column!.type, e.value)).filter((n): n is number => n !== null) : [];

/** Compute the aggregate for a list of entries (pure, used by the service and tests). */
export function buildMirrorValue(column: ColumnRef | null, entries: MirrorEntry[], fn: AggregateFn): MirrorValue {
  const v: MirrorValue = { column, entries, aggregate: fn, result: null };
  if (column && fn !== "none") v.result = aggregate(mirrorNumbers(v), fn);
  return v;
}

export function mirrorText(v: MirrorValue | null): string {
  if (!v || !v.column) return "";
  const target = logicOf(v.column.type);
  if (v.result !== null) {
    const asTarget = v.column.type === "numbers" ? target.format(v.result as never, v.column) : String(v.result);
    return v.aggregate === "count" ? String(v.result) : asTarget;
  }
  return v.entries.map((e) => target.format(e.value as never, v.column!)).filter(Boolean).join(", ");
}

export const mirrorColumn: ColumnLogic<MirrorValue> = {
  type: "mirror",
  label: "Mirror",
  category: "advanced",
  icon: "Mirror",
  readOnly: true,
  defaultSettings: () => ({ relationColumnId: "", targetColumnId: "", aggregate: "none" }),
  normalizeSettings(s) {
    const fn = String(s.aggregate ?? "none") as AggregateFn;
    if (!AGGREGATE_FNS.includes(fn)) throw new ValidationError(`Unknown aggregate "${fn}"`);
    return { ...s, relationColumnId: String(s.relationColumnId ?? ""), targetColumnId: String(s.targetColumnId ?? ""), aggregate: fn };
  },
  validate: () => { throw new ValidationError("Mirror columns are read-only"); },
  serialize: (v) => (v ? { display_value: mirrorText(v), linked_item_ids: v.entries.map((e) => e.itemId), aggregate: v.aggregate, result: v.result } : null),
  format: (v) => mirrorText(v),
  filter: {
    operators: [...TEXT_OPS, ...NUMBER_OPS.filter((o) => ["gt", "gte", "lt", "lte", "eq"].includes(o.id))],
    test(v, op, operand) {
      if (["gt", "gte", "lt", "lte", "eq"].includes(op)) return testNumber(v?.result ?? null, op, operand);
      return testText(mirrorText(v), op, operand);
    },
  },
  sortKey: (v) => (v ? (v.result ?? (mirrorText(v).toLowerCase() || null)) : null),
  summarize(vals) {
    const nums = vals.map((v) => v?.result).filter((n): n is number => typeof n === "number");
    if (!nums.length) return null;
    const sum = nums.reduce((a, b) => a + b, 0);
    const first = vals.find((v) => v?.column)?.column;
    return { text: first?.type === "numbers" ? logicOf("numbers").format(Math.round(sum * 1e6) / 1e6, first) : String(Math.round(sum * 1e6) / 1e6) };
  },
};
