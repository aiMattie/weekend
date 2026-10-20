import { OP_IS_EMPTY, OP_NOT_EMPTY } from "./ops";
import type { ColumnLogic } from "./types";

/**
 * Used for column types that have no registered implementation yet (file, board_relation,
 * timeline ... until the `columns` agent builds them): values are stored verbatim as JSON.
 */
export const fallbackColumn: ColumnLogic<unknown> = {
  type: "unknown",
  label: "Unsupported",
  category: "advanced",
  icon: "Question",
  defaultSettings: () => ({}),
  validate: (input) => (input === undefined ? null : input),
  serialize: (v) => v,
  format: (v) => (v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v)),
  filter: { operators: [OP_IS_EMPTY, OP_NOT_EMPTY], test: (v, op) => (op === "is_empty" ? v == null : op === "is_not_empty" ? v != null : true) },
  sortKey: () => null,
};
