import { ValidationError } from "../../lib/errors";
import { OP_IS_EMPTY, OP_NOT_EMPTY, testSet, testText } from "./ops";
import type { ColumnLogic } from "./types";
import { idList } from "./util";

/**
 * Shared by board_relation and dependency. Stored (API read shape):
 *   `{ linkedPulseIds: [{ linkedPulseId: "<itemId>" }] }`
 * validate() also accepts `{ item_ids: [...] }` (API write shape), a plain id array or one id.
 * The read path (services/computed.ts) adds `items: [{ id, name, boardId }]` so cells can show names;
 * serialize() strips that decoration.
 */
export type LinkedItemRef = { id: string; name: string; boardId: string };
export type RelationValue = { linkedPulseIds: { linkedPulseId: string }[]; items?: LinkedItemRef[] };

export const relationIds = (v: RelationValue | null | undefined): string[] => (v?.linkedPulseIds ?? []).map((l) => String(l.linkedPulseId));
export const makeRelationValue = (ids: string[]): RelationValue | null => (ids.length ? { linkedPulseIds: ids.map((linkedPulseId) => ({ linkedPulseId })) } : null);

export function relationNames(v: RelationValue | null | undefined): string[] {
  const byId = new Map((v?.items ?? []).map((i) => [i.id, i.name]));
  return relationIds(v).map((id) => byId.get(id) ?? id);
}

export function relationColumn(def: Pick<ColumnLogic, "type" | "label" | "icon" | "category"> & { defaultSettings: () => Record<string, unknown>; normalizeSettings?: ColumnLogic["normalizeSettings"] }): ColumnLogic<RelationValue> {
  return {
    ...def,
    validate(input, column) {
      if (input === null || input === undefined || input === "") return null;
      const ids = idList(input);
      if (column.settings.allowMultiple === false && ids.length > 1) throw new ValidationError(`Column "${column.title}" is limited to one linked item`);
      return makeRelationValue(ids);
    },
    serialize: (v) => (v ? { linkedPulseIds: v.linkedPulseIds } : null),
    format: (v) => relationNames(v).join(", "),
    filter: {
      operators: [
        { id: "contains", label: "Contains text", needsOperand: true },
        { id: "any_of", label: "Is any of", needsOperand: true },
        { id: "none_of", label: "Is none of", needsOperand: true },
        OP_IS_EMPTY,
        OP_NOT_EMPTY,
      ],
      test(v, op, operand) {
        if (op === "contains") return testText(relationNames(v).join(" "), "contains", operand);
        return testSet(relationIds(v), op, operand);
      },
    },
    sortKey: (v) => (relationIds(v).length ? relationNames(v).join(", ").toLowerCase() : null),
    summarize(vals) {
      const n = vals.reduce((a, v) => a + relationIds(v).length, 0);
      return n ? { text: String(n) } : null;
    },
  };
}
