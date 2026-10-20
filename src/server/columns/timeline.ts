import { ValidationError } from "../../lib/errors";
import { OP_IS_EMPTY, OP_NOT_EMPTY } from "./ops";
import type { ColumnLogic } from "./types";
import { addDays, daysBetween, isObj, isoDate, todayIso } from "./util";

/** timeline: `{ from: "YYYY-MM-DD", to: "YYYY-MM-DD" }` (API shape). */
export type TimelineValue = { from: string; to: string };

export function parseTimeline(input: unknown): TimelineValue {
  let from: unknown;
  let to: unknown;
  if (Array.isArray(input)) [from, to] = input;
  else if (isObj(input)) {
    from = input.from ?? input.start ?? input.startDate;
    to = input.to ?? input.end ?? input.endDate;
  } else if (typeof input === "string") [from, to] = input.split(/\s*(?:\/|,|\.\.| - )\s*/);
  const f = isoDate(from);
  const t = isoDate(to ?? from);
  if (!f || !t) throw new ValidationError(`Invalid timeline: ${JSON.stringify(input)} (use { from, to } as YYYY-MM-DD)`);
  if (t < f) throw new ValidationError("Timeline end is before its start");
  return { from: f, to: t };
}

export const timelineColumn: ColumnLogic<TimelineValue> = {
  type: "timeline",
  label: "Timeline",
  category: "time",
  icon: "TimeLine",
  defaultSettings: () => ({}),
  validate: (input) => (input === null || input === undefined || input === "" ? null : parseTimeline(input)),
  serialize: (v) => (v ? { from: v.from, to: v.to } : null),
  format: (v) => (v ? (v.from === v.to ? v.from : `${v.from} - ${v.to}`) : ""),
  filter: {
    operators: [
      { id: "overlaps", label: "Overlaps date", needsOperand: true },
      { id: "before", label: "Ends before", needsOperand: true },
      { id: "after", label: "Starts after", needsOperand: true },
      { id: "overdue", label: "Overdue", needsOperand: false },
      OP_IS_EMPTY,
      OP_NOT_EMPTY,
    ],
    test(v, op, operand) {
      const o = isoDate(operand) ?? "";
      switch (op) {
        case "is_empty": return !v;
        case "is_not_empty": return !!v;
        case "overlaps": return !!v && v.from <= o && o <= v.to;
        case "before": return !!v && v.to < o;
        case "after": return !!v && v.from > o;
        case "overdue": return !!v && v.to < todayIso();
        default: return true;
      }
    },
  },
  sortKey: (v) => (v ? `${v.from}${v.to}` : null),
  /** full range covered by all timelines + number of days */
  summarize(vals) {
    const vs = vals.filter(Boolean) as TimelineValue[];
    if (!vs.length) return null;
    const from = vs.map((v) => v.from).sort()[0];
    const to = vs.map((v) => v.to).sort().reverse()[0];
    return { text: `${from} - ${to}` };
  },
};

export const timelineDays = (v: TimelineValue): number => daysBetween(v.from, v.to) + 1;
export const shiftTimeline = (v: TimelineValue, days: number): TimelineValue => ({ from: addDays(v.from, days), to: addDays(v.to, days) });
