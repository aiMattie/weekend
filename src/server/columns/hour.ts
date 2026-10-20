import { ValidationError } from "../../lib/errors";
import { NUMBER_OPS, testNumber } from "./ops";
import type { ColumnLogic } from "./types";
import { isObj } from "./util";

/** hour: `{ hour: 0-23, minute: 0-59 }` (API shape). */
export type HourValue = { hour: number; minute: number };

export function parseHour(input: unknown): HourValue {
  let h: unknown;
  let m: unknown;
  if (typeof input === "string") {
    const mm = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(input.trim());
    if (mm) [h, m] = [mm[1], mm[2]];
  } else if (isObj(input)) [h, m] = [input.hour, input.minute ?? 0];
  const hour = Number(h);
  const minute = Number(m);
  if (h === undefined || !Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new ValidationError(`Invalid hour: ${JSON.stringify(input)} (use HH:mm)`);
  }
  return { hour, minute };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const hourText = (v: HourValue): string => `${pad(v.hour)}:${pad(v.minute)}`;
const minutes = (v: HourValue | null) => (v ? v.hour * 60 + v.minute : null);

export const hourColumn: ColumnLogic<HourValue> = {
  type: "hour",
  label: "Hour",
  category: "time",
  icon: "Time",
  defaultSettings: () => ({}),
  validate: (input) => (input === null || input === undefined || input === "" ? null : parseHour(input)),
  serialize: (v) => v,
  format: (v) => (v ? hourText(v) : ""),
  filter: {
    operators: NUMBER_OPS,
    /** operand "HH:mm" or minutes since midnight */
    test(v, op, operand) {
      let o: unknown = operand;
      if (typeof operand === "string" && operand.includes(":")) o = minutes(parseHour(operand));
      return testNumber(minutes(v), op, o);
    },
  },
  sortKey: (v) => minutes(v),
  summarize(vals) {
    const ms = vals.map(minutes).filter((x): x is number => x !== null).sort((a, b) => a - b);
    if (!ms.length) return null;
    const t = (n: number) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
    return { text: ms[0] === ms[ms.length - 1] ? t(ms[0]) : `${t(ms[0])} - ${t(ms[ms.length - 1])}` };
  },
};
