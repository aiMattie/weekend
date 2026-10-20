import { ValidationError } from "../../lib/errors";
import { OP_IS_EMPTY, OP_NOT_EMPTY, testSet } from "./ops";
import type { ColumnLogic } from "./types";

/** sprint: `{ sprintId, name? }`. `name` is a display cache written by the UI/service. */
export type SprintValue = { sprintId: string; name?: string };

export const sprintColumn: ColumnLogic<SprintValue> = {
  type: "sprint",
  label: "Sprint",
  category: "advanced",
  icon: "Sprint",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined || input === "") return null;
    const o = typeof input === "object" ? (input as { sprintId?: unknown; name?: unknown }) : { sprintId: input };
    const id = String(o.sprintId ?? "").trim();
    if (!id) return null;
    if (!/^\d{1,20}$/.test(id)) throw new ValidationError("Invalid sprint id");
    return { sprintId: id, ...(typeof o.name === "string" && o.name ? { name: o.name } : {}) };
  },
  serialize: (v) => v,
  format: (v) => v?.name ?? v?.sprintId ?? "",
  filter: {
    operators: [{ id: "any_of", label: "Is any of", needsOperand: true }, { id: "none_of", label: "Is none of", needsOperand: true }, OP_IS_EMPTY, OP_NOT_EMPTY],
    /** operand: array of sprint ids */
    test: (v, op, operand) => testSet(v ? [v.sprintId] : [], op, operand),
  },
  sortKey: (v) => v?.name?.toLowerCase() ?? v?.sprintId ?? null,
  summarize(vals) {
    const n = vals.filter(Boolean).length;
    return n ? { text: String(n) } : null;
  },
};
