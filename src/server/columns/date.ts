import { ValidationError } from "../../lib/errors";
import { OP_IS_EMPTY, OP_NOT_EMPTY } from "./ops";
import type { ColumnLogic } from "./types";

/** date: `{ date: "YYYY-MM-DD", time?: "HH:mm:ss" }` (API shape). */
export type DateValue = { date: string; time?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

export function parseDateInput(input: unknown): DateValue {
  let date: string | undefined;
  let time: string | undefined;
  if (typeof input === "string") {
    const [d, t] = input.split(/[T ]/);
    date = d;
    time = t;
  } else if (input && typeof input === "object") {
    const o = input as Record<string, unknown>;
    date = typeof o.date === "string" ? o.date : undefined;
    time = typeof o.time === "string" ? o.time : undefined;
  }
  if (!date || !DATE_RE.test(date) || Number.isNaN(Date.parse(date))) throw new ValidationError(`Invalid date: ${JSON.stringify(input)} (use YYYY-MM-DD)`);
  if (time) {
    if (!TIME_RE.test(time)) throw new ValidationError(`Invalid time: ${time}`);
    return { date, time: time.length === 5 ? `${time}:00` : time };
  }
  return { date };
}

const today = () => new Date().toISOString().slice(0, 10);

export const dateColumn: ColumnLogic<DateValue> = {
  type: "date",
  label: "Date",
  category: "time",
  icon: "Calendar",
  defaultSettings: () => ({}),
  validate: (input) => (input === null || input === undefined || input === "" ? null : parseDateInput(input)),
  serialize: (v) => v,
  format: (v) => (v ? (v.time ? `${v.date} ${v.time.slice(0, 5)}` : v.date) : ""),
  filter: {
    operators: [
      { id: "is", label: "Is", needsOperand: true },
      { id: "before", label: "Is before", needsOperand: true },
      { id: "after", label: "Is after", needsOperand: true },
      { id: "overdue", label: "Overdue", needsOperand: false },
      { id: "today", label: "Today", needsOperand: false },
      OP_IS_EMPTY,
      OP_NOT_EMPTY,
    ],
    test(v, op, operand) {
      const d = v?.date ?? null;
      const o = typeof operand === "string" ? operand.slice(0, 10) : "";
      switch (op) {
        case "is_empty": return d === null;
        case "is_not_empty": return d !== null;
        case "is": return d === o;
        case "before": return d !== null && d < o;
        case "after": return d !== null && d > o;
        case "overdue": return d !== null && d < today();
        case "today": return d === today();
        default: return true;
      }
    },
  },
  sortKey: (v) => (v ? `${v.date}${v.time ?? ""}` : null),
  summarize(vals) {
    const ds = vals.filter(Boolean).map((v) => v!.date).sort();
    return ds.length ? { text: ds[0] === ds[ds.length - 1] ? ds[0] : `${ds[0]} - ${ds[ds.length - 1]}` } : null;
  },
};
