import { ValidationError } from "../../lib/errors";
import { TEXT_OPS, testText } from "./ops";
import type { ColumnLogic } from "./types";

export type LongTextValue = { text: string };

/** long_text: stored as `{ text }` (API shape). Accepts a plain string too. */
export const longTextColumn: ColumnLogic<LongTextValue> = {
  type: "long_text",
  label: "Long text",
  category: "essentials",
  icon: "Text",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined) return null;
    const text = typeof input === "string" ? input : (input as { text?: unknown }).text;
    if (typeof text !== "string") throw new ValidationError("Long text value must be a string or { text }");
    return text === "" ? null : { text };
  },
  serialize: (v) => v,
  format: (v) => v?.text ?? "",
  filter: { operators: TEXT_OPS, test: (v, op, operand) => testText(v?.text ?? "", op, operand) },
  sortKey: (v) => (v?.text ? v.text.toLowerCase() : null),
};
