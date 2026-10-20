import { ValidationError } from "../../../lib/errors";
import { TEXT_OPS, testText } from "../ops";
import type { ColumnLogic } from "../types";

/** item_id: the item's id as text (computed on read). */
export const itemIdColumn: ColumnLogic<string> = {
  type: "item_id",
  label: "Item ID",
  category: "numbers",
  icon: "Numbers",
  readOnly: true,
  defaultSettings: () => ({}),
  validate: () => { throw new ValidationError("Item ID columns are read-only"); },
  serialize: (v) => v,
  format: (v) => v ?? "",
  filter: { operators: TEXT_OPS, test: (v, op, operand) => testText(v ?? "", op, operand) },
  sortKey: (v) => (v ? Number(v) : null),
};
