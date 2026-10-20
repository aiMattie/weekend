import { ValidationError } from "../../lib/errors";
import { NUMBER_OPS, testNumber } from "./ops";
import type { ColumnLogic } from "./types";
import { isObj, round6 } from "./util";

/** rating: `{ rating: 1..max }` (API shape). settings.max (default 5, 1-10). */
export type RatingValue = { rating: number };

export const ratingColumn: ColumnLogic<RatingValue> = {
  type: "rating",
  label: "Rating",
  category: "numbers",
  icon: "Favorite",
  defaultSettings: () => ({ max: 5 }),
  normalizeSettings(s) {
    const max = s.max === undefined ? 5 : Number(s.max);
    if (!Number.isInteger(max) || max < 1 || max > 10) throw new ValidationError("rating max must be 1-10");
    return { ...s, max };
  },
  validate(input, column) {
    if (input === null || input === undefined || input === "") return null;
    const n = Number(isObj(input) ? input.rating : input);
    const max = Number(column.settings.max ?? 5);
    if (!Number.isInteger(n) || n < 0 || n > max) throw new ValidationError(`Rating must be 0-${max}`);
    return n === 0 ? null : { rating: n };
  },
  serialize: (v) => v,
  format: (v) => (v ? String(v.rating) : ""),
  filter: { operators: NUMBER_OPS, test: (v, op, operand) => testNumber(v?.rating ?? null, op, operand) },
  sortKey: (v) => v?.rating ?? null,
  summarize(vals) {
    const n = vals.filter(Boolean) as RatingValue[];
    return n.length ? { text: String(round6(n.reduce((a, b) => a + b.rating, 0) / n.length).toFixed(1)) } : null;
  },
};
