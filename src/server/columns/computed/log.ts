import { ValidationError } from "../../../lib/errors";
import { OP_IS_EMPTY, OP_NOT_EMPTY } from "../ops";
import type { ColumnLogic, FormatContext } from "../types";

/** creation_log: `{ at, userId }` and last_updated: `{ at, userId }`, both computed on read. */
export type LogValue = { at: string; userId: string | null };

const fmt = (v: LogValue | null, ctx?: FormatContext): string => {
  if (!v) return "";
  const who = v.userId ? ctx?.userNames?.get(v.userId) : undefined;
  const when = v.at.slice(0, 16).replace("T", " ");
  return who ? `${when} - ${who}` : when;
};

function logColumn(type: string, label: string, icon: string): ColumnLogic<LogValue> {
  return {
    type,
    label,
    category: "time",
    icon,
    readOnly: true,
    defaultSettings: () => ({}),
    validate: () => { throw new ValidationError(`${label} columns are read-only`); },
    serialize: (v) => (v ? { [type === "creation_log" ? "created_at" : "updated_at"]: v.at, ...(v.userId ? { [type === "creation_log" ? "creator_id" : "updater_id"]: v.userId } : {}) } : null),
    format: (v, _c, ctx) => fmt(v, ctx),
    filter: {
      operators: [
        { id: "before", label: "Is before", needsOperand: true },
        { id: "after", label: "Is after", needsOperand: true },
        { id: "is", label: "Is", needsOperand: true },
        OP_IS_EMPTY,
        OP_NOT_EMPTY,
      ],
      test(v, op, operand) {
        const d = v?.at.slice(0, 10) ?? null;
        const o = String(operand ?? "").slice(0, 10);
        switch (op) {
          case "is_empty": return d === null;
          case "is_not_empty": return d !== null;
          case "is": return d === o;
          case "before": return d !== null && d < o;
          case "after": return d !== null && d > o;
          default: return true;
        }
      },
    },
    sortKey: (v) => v?.at ?? null,
  };
}

export const creationLogColumn = logColumn("creation_log", "Creation log", "Calendar");
export const lastUpdatedColumn = logColumn("last_updated", "Last updated", "Calendar");
