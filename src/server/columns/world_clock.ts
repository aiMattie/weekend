import { ValidationError } from "../../lib/errors";
import { TEXT_OPS, testText } from "./ops";
import type { ColumnLogic } from "./types";
import { isObj } from "./util";

/** world_clock: `{ timezone: "Europe/Amsterdam" }` (IANA name). */
export type WorldClockValue = { timezone: string };

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Current local time in `tz` as HH:mm. */
export function clockTime(tz: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("nl-NL", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  } catch {
    return "";
  }
}

export const worldClockColumn: ColumnLogic<WorldClockValue> = {
  type: "world_clock",
  label: "World clock",
  category: "time",
  icon: "Time",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined || input === "") return null;
    const tz = typeof input === "string" ? input : isObj(input) ? input.timezone ?? input.timeZone : undefined;
    if (typeof tz !== "string" || !isValidTimeZone(tz)) throw new ValidationError(`Invalid time zone: ${JSON.stringify(input)}`);
    return { timezone: tz };
  },
  serialize: (v) => v,
  format: (v) => (v ? `${v.timezone} ${clockTime(v.timezone)}` : ""),
  filter: { operators: TEXT_OPS, test: (v, op, operand) => testText(v?.timezone ?? "", op, operand) },
  sortKey: (v) => (v ? v.timezone.toLowerCase() : null),
};
