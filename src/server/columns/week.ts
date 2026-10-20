import { ValidationError } from "../../lib/errors";
import { OP_IS_EMPTY, OP_NOT_EMPTY } from "./ops";
import type { ColumnLogic } from "./types";
import { addDays, isObj, isoDate, isoWeekOf, isoWeekStart, todayIso } from "./util";

/** week: `{ week: { startDate, endDate } }` (API shape), Monday to Sunday. */
export type WeekValue = { week: { startDate: string; endDate: string } };

const weekFromDate = (d: string): WeekValue => {
  const w = isoWeekOf(d);
  return { week: { startDate: w.start, endDate: w.end } };
};

export function parseWeek(input: unknown): WeekValue {
  if (typeof input === "string") {
    const m = /^(\d{4})-?W(\d{1,2})$/i.exec(input.trim());
    if (m) {
      const wk = Number(m[2]);
      if (wk < 1 || wk > 53) throw new ValidationError(`Invalid week: ${input}`);
      const start = isoWeekStart(Number(m[1]), wk);
      return { week: { startDate: start, endDate: addDays(start, 6) } };
    }
    const d = isoDate(input);
    if (d) return weekFromDate(d);
  } else if (isObj(input)) {
    const inner = isObj(input.week) ? input.week : input;
    const s = isoDate(inner.startDate ?? inner.start ?? inner.date);
    if (s) return weekFromDate(s);
  }
  throw new ValidationError(`Invalid week: ${JSON.stringify(input)} (use YYYY-Www or a date)`);
}

export const weekLabel = (v: WeekValue): string => `Week ${isoWeekOf(v.week.startDate).week}`;

export const weekColumn: ColumnLogic<WeekValue> = {
  type: "week",
  label: "Week",
  category: "time",
  icon: "Calendar",
  defaultSettings: () => ({}),
  validate: (input) => (input === null || input === undefined || input === "" ? null : parseWeek(input)),
  serialize: (v) => v,
  format: (v) => (v ? `${weekLabel(v)} (${v.week.startDate} - ${v.week.endDate})` : ""),
  filter: {
    operators: [
      { id: "is", label: "Is", needsOperand: true },
      { id: "before", label: "Is before", needsOperand: true },
      { id: "after", label: "Is after", needsOperand: true },
      { id: "this_week", label: "This week", needsOperand: false },
      OP_IS_EMPTY,
      OP_NOT_EMPTY,
    ],
    test(v, op, operand) {
      const s = v?.week.startDate ?? null;
      const o = isoDate(operand);
      const os = o ? isoWeekOf(o).start : "";
      switch (op) {
        case "is_empty": return s === null;
        case "is_not_empty": return s !== null;
        case "is": return s === os;
        case "before": return s !== null && s < os;
        case "after": return s !== null && s > os;
        case "this_week": return s === isoWeekOf(todayIso()).start;
        default: return true;
      }
    },
  },
  sortKey: (v) => v?.week.startDate ?? null,
  summarize(vals) {
    const ds = vals.filter(Boolean).map((v) => v!.week.startDate).sort();
    if (!ds.length) return null;
    const a = isoWeekOf(ds[0]);
    const b = isoWeekOf(ds[ds.length - 1]);
    return { text: ds[0] === ds[ds.length - 1] ? `Week ${a.week}` : `Week ${a.week} - ${b.week}` };
  },
};
