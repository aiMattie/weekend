import { ValidationError } from "../../../lib/errors";
import { NUMBER_OPS, TEXT_OPS, testNumber, testText } from "../ops";
import type { ColumnLogic } from "../types";
import { FormulaError, parseFormula, type FormulaResult } from "./formula-lang";

/**
 * formula: computed on read by services/computed.ts from `settings.formula`
 * (see formula-lang.ts for the language). Value = FormulaResult.
 * settings: { formula, decimals?, unit?, unitPosition?: "left"|"right" }
 */
export type FormulaValue = FormulaResult;

export function formatFormula(v: FormulaValue | null, s: Record<string, unknown>): string {
  if (!v || v.error) return v?.error ? "#ERROR" : "";
  if (typeof v.value === "number") {
    const decimals = typeof s.decimals === "number" ? s.decimals : undefined;
    const body = decimals !== undefined ? v.value.toFixed(decimals) : String(v.value);
    const unit = String(s.unit ?? "");
    return !unit ? body : s.unitPosition === "left" ? `${unit}${body}` : `${body}${unit}`;
  }
  return v.text;
}

export const formulaColumn: ColumnLogic<FormulaValue> = {
  type: "formula",
  label: "Formula",
  category: "numbers",
  icon: "Formula",
  readOnly: true,
  defaultSettings: () => ({ formula: "" }),
  normalizeSettings(s) {
    const formula = String(s.formula ?? "").trim();
    if (formula) {
      try {
        parseFormula(formula);
      } catch (e) {
        throw new ValidationError(e instanceof FormulaError ? `Formula error at ${e.pos}: ${e.message}` : String(e));
      }
    }
    const decimals = s.decimals === undefined || s.decimals === null || s.decimals === "" ? undefined : Number(s.decimals);
    if (decimals !== undefined && (!Number.isInteger(decimals) || decimals < 0 || decimals > 8)) throw new ValidationError("decimals must be 0-8");
    return { ...s, formula, ...(decimals !== undefined ? { decimals } : {}) };
  },
  validate: () => { throw new ValidationError("Formula columns are read-only"); },
  serialize: (v) => (v ? { value: v.value, text: v.text, ...(v.error ? { error: v.error } : {}) } : null),
  format: (v, c) => formatFormula(v, c.settings),
  filter: {
    operators: [...TEXT_OPS, ...NUMBER_OPS.filter((o) => ["gt", "gte", "lt", "lte", "eq", "neq"].includes(o.id))],
    test(v, op, operand) {
      if (["gt", "gte", "lt", "lte", "eq", "neq"].includes(op)) return testNumber(typeof v?.value === "number" ? v.value : null, op, operand);
      return testText(v?.text ?? "", op, operand);
    },
  },
  sortKey: (v) => (v && !v.error && v.value !== null ? (typeof v.value === "boolean" ? Number(v.value) : typeof v.value === "string" ? v.value.toLowerCase() : v.value) : null),
  summarize(vals, c) {
    const nums = vals.map((v) => (typeof v?.value === "number" ? v.value : null)).filter((n): n is number => n !== null);
    if (!nums.length) return null;
    return { text: formatFormula({ value: Math.round(nums.reduce((a, b) => a + b, 0) * 1e6) / 1e6, text: "", kind: "number" }, c.settings) };
  },
};
