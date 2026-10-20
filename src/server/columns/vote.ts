import { ValidationError } from "../../lib/errors";
import { NUMBER_OPS, testNumber } from "./ops";
import type { ColumnLogic } from "./types";
import { isObj } from "./util";

/** vote: `{ votersIds: string[] }` (user ids). */
export type VoteValue = { votersIds: string[] };

export const voteColumn: ColumnLogic<VoteValue> = {
  type: "vote",
  label: "Vote",
  category: "people",
  icon: "ThumbsUp",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined) return null;
    const list = Array.isArray(input) ? input : isObj(input) ? (input.votersIds ?? input.voters ?? input.votes) : undefined;
    if (!Array.isArray(list)) throw new ValidationError("Vote value must be { votersIds: [userId] }");
    const ids: string[] = [];
    for (const e of list) {
      const id = String(isObj(e) ? (e.userId ?? e.id) : e);
      if (!/^\d+$/.test(id)) throw new ValidationError(`Invalid user id: ${id}`);
      if (!ids.includes(id)) ids.push(id);
    }
    return ids.length ? { votersIds: ids } : null;
  },
  serialize: (v) => v,
  format: (v) => String(v?.votersIds.length ?? 0),
  filter: {
    operators: [...NUMBER_OPS, { id: "voted_by", label: "Voted by", needsOperand: true }],
    test(v, op, operand) {
      if (op === "voted_by") return (v?.votersIds ?? []).some((i) => (Array.isArray(operand) ? operand : [operand]).map(String).includes(i));
      return testNumber(v?.votersIds.length ?? null, op, operand);
    },
  },
  sortKey: (v) => v?.votersIds.length ?? null,
  summarize: (vals) => ({ text: String(vals.reduce((a, v) => a + (v?.votersIds.length ?? 0), 0)) }),
};
