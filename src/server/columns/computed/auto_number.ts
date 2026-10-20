import { ValidationError } from "../../../lib/errors";
import { NUMBER_OPS, testNumber } from "../ops";
import type { ColumnLogic } from "../types";

/** auto_number: sequential number per board by creation order (computed on read). settings: prefix, minDigits, startAt. */
export const autoNumberColumn: ColumnLogic<number> = {
  type: "auto_number",
  label: "Auto number",
  category: "numbers",
  icon: "Numbers",
  readOnly: true,
  defaultSettings: () => ({ prefix: "", minDigits: 0, startAt: 1 }),
  normalizeSettings(s) {
    const minDigits = Number(s.minDigits ?? 0);
    const startAt = Number(s.startAt ?? 1);
    if (!Number.isInteger(minDigits) || minDigits < 0 || minDigits > 10) throw new ValidationError("minDigits must be 0-10");
    if (!Number.isInteger(startAt) || startAt < 0) throw new ValidationError("startAt must be a non-negative integer");
    return { ...s, prefix: String(s.prefix ?? "").slice(0, 10), minDigits, startAt };
  },
  validate: () => { throw new ValidationError("Auto number columns are read-only"); },
  serialize: (v) => v,
  format: (v, c) => (v === null || v === undefined ? "" : `${String(c.settings.prefix ?? "")}${String(v).padStart(Number(c.settings.minDigits ?? 0), "0")}`),
  filter: { operators: NUMBER_OPS, test: (v, op, operand) => testNumber(v ?? null, op, operand) },
  sortKey: (v) => v ?? null,
};
