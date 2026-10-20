import { ValidationError } from "../../lib/errors";
import { NUMBER_OPS, testNumber } from "./ops";
import type { ColumnLogic } from "./types";
import { aggregate, type AggregateFn } from "./util";

/** numbers: stored as a JSON number. settings: { unit?, unitPosition?: "left"|"right", decimals?, summary?: sum|avg|min|max|median|count|none } */
export const numbersColumn: ColumnLogic<number> = {
  type: "numbers",
  label: "Numbers",
  category: "numbers",
  icon: "Numbers",
  defaultSettings: () => ({ unit: "", unitPosition: "right" }),
  normalizeSettings(s) {
    const decimals = s.decimals === undefined || s.decimals === null ? undefined : Number(s.decimals);
    if (decimals !== undefined && (!Number.isInteger(decimals) || decimals < 0 || decimals > 8)) throw new ValidationError("decimals must be 0-8");
    return { ...s, unit: String(s.unit ?? ""), unitPosition: s.unitPosition === "left" ? "left" : "right", ...(decimals !== undefined ? { decimals } : {}) };
  },
  validate(input) {
    if (input === null || input === undefined || input === "") return null;
    const raw = typeof input === "object" ? (input as { number?: unknown }).number : input;
    const n = typeof raw === "string" ? Number(raw.replace(",", ".")) : Number(raw);
    if (raw === null || raw === undefined || raw === "" || !Number.isFinite(n)) throw new ValidationError("Not a valid number");
    return n;
  },
  serialize: (v) => v,
  format(v, c) {
    if (v === null || v === undefined) return "";
    const decimals = typeof c.settings.decimals === "number" ? c.settings.decimals : undefined;
    const body = decimals !== undefined ? v.toFixed(decimals) : String(v);
    const unit = String(c.settings.unit ?? "");
    if (!unit) return body;
    return c.settings.unitPosition === "left" ? `${unit}${body}` : `${body}${unit}`;
  },
  filter: { operators: NUMBER_OPS, test: (v, op, operand) => testNumber(v ?? null, op, operand) },
  sortKey: (v) => v ?? null,
  summarize(vals, c) {
    const nums = vals.filter((v): v is number => typeof v === "number");
    if (!nums.length) return null;
    const fn = String(c.settings.summary ?? "sum") as AggregateFn | "none";
    if (fn === "none") return null;
    const r = aggregate(nums, fn);
    if (r === null) return null;
    return { text: fn === "count" ? String(r) : numbersColumn.format(r, c) };
  },
};
