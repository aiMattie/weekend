import { ValidationError } from "../../lib/errors";
import { HEX } from "./labels";
import { OP_IS_EMPTY, OP_NOT_EMPTY, testSet } from "./ops";
import type { ColumnLogic } from "./types";
import { isObj } from "./util";

/** color_picker: `{ color: { hex } }` (API shape). */
export type ColorValue = { color: { hex: string } };

export const colorPickerColumn: ColumnLogic<ColorValue> = {
  type: "color_picker",
  label: "Color picker",
  category: "advanced",
  icon: "Color",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined || input === "") return null;
    let hex: unknown = input;
    if (isObj(input)) hex = isObj(input.color) ? input.color.hex : (input.hex ?? input.color);
    if (typeof hex !== "string") throw new ValidationError("Color must be a hex string like #ff0000");
    const h = hex.trim().toLowerCase();
    const full = /^#[0-9a-f]{3}$/.test(h) ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
    if (!HEX.test(full)) throw new ValidationError(`Invalid color: ${hex}`);
    return { color: { hex: full } };
  },
  serialize: (v) => v,
  format: (v) => v?.color.hex ?? "",
  filter: {
    operators: [{ id: "any_of", label: "Is any of", needsOperand: true }, { id: "none_of", label: "Is none of", needsOperand: true }, OP_IS_EMPTY, OP_NOT_EMPTY],
    test: (v, op, operand) => testSet(v ? [v.color.hex] : [], op, Array.isArray(operand) ? operand.map((o) => String(o).toLowerCase()) : String(operand).toLowerCase()),
  },
  sortKey: (v) => v?.color.hex ?? null,
  summarize(vals) {
    const counts = new Map<string, number>();
    for (const v of vals) if (v) counts.set(v.color.hex, (counts.get(v.color.hex) ?? 0) + 1);
    return counts.size ? { segments: [...counts].map(([label, count]) => ({ label, color: label, count })) } : null;
  },
};
