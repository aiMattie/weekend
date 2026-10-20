import { ValidationError } from "../../../lib/errors";
import { NUMBER_OPS, testNumber } from "../ops";
import type { StatusLabel } from "../labels";
import type { ColumnLogic } from "../types";

/**
 * progress ("Progress tracking"): computed on read from a status column. settings:
 *   source: "subitems" (default) | "relation"
 *   columnId           status column (id/key) of the subitems / related items; default = first status column
 *   relationColumnId   board_relation column on this board (source "relation")
 * Done = label flagged `isDone`, else a label named Done/Afgerond/Klaar/Complete(d).
 */
export type ProgressValue = { done: number; total: number; percent: number };

const DONE_NAME = /^(done|afgerond|klaar|gereed|complete|completed|behaald|resolved|closed)$/i;
export const isDoneLabel = (l: StatusLabel): boolean => !!l.isDone || DONE_NAME.test(l.text.trim());

export function buildProgress(done: number, total: number): ProgressValue | null {
  if (total <= 0) return null;
  return { done, total, percent: Math.round((done / total) * 100) };
}

export const progressColumn: ColumnLogic<ProgressValue> = {
  type: "progress",
  label: "Progress tracking",
  category: "status",
  icon: "Battery",
  readOnly: true,
  defaultSettings: () => ({ source: "subitems", columnId: "", relationColumnId: "" }),
  normalizeSettings(s) {
    if (s.source !== undefined && s.source !== "subitems" && s.source !== "relation") throw new ValidationError("progress source must be subitems or relation");
    return { ...s, source: s.source ?? "subitems" };
  },
  validate: () => { throw new ValidationError("Progress columns are read-only"); },
  serialize: (v) => (v ? { percent: v.percent, done: v.done, total: v.total } : null),
  format: (v) => (v ? `${v.percent}%` : ""),
  filter: { operators: NUMBER_OPS, test: (v, op, operand) => testNumber(v?.percent ?? null, op, operand) },
  sortKey: (v) => v?.percent ?? null,
  summarize(vals) {
    const done = vals.reduce((a, v) => a + (v?.done ?? 0), 0);
    const total = vals.reduce((a, v) => a + (v?.total ?? 0), 0);
    return total ? { text: `${Math.round((done / total) * 100)}%` } : null;
  },
};
