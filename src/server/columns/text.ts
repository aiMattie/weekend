import { ValidationError } from "../../lib/errors";
import { TEXT_OPS, testText } from "./ops";
import type { ColumnLogic } from "./types";

/** text: stored as a plain string. */
export const textColumn: ColumnLogic<string> = {
  type: "text",
  label: "Text",
  category: "essentials",
  icon: "TextCopy",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined) return null;
    if (typeof input === "object" && "text" in (input as object)) input = (input as { text: unknown }).text;
    if (typeof input !== "string" && typeof input !== "number") throw new ValidationError("Text value must be a string");
    const s = String(input);
    return s === "" ? null : s;
  },
  serialize: (v) => v,
  format: (v) => v ?? "",
  filter: { operators: TEXT_OPS, test: (v, op, operand) => testText(v ?? "", op, operand) },
  sortKey: (v) => (v ? v.toLowerCase() : null),
  summarize: (vals) => ({ text: `${vals.filter(Boolean).length}` }),
};
