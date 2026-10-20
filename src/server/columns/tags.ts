import { ValidationError } from "../../lib/errors";
import { OP_IS_EMPTY, OP_NOT_EMPTY, testSet, testText } from "./ops";
import type { ColumnLogic } from "./types";
import { isObj } from "./util";

/**
 * tags: `{ tag_ids: [...] }` (API shape; ids of rows in the account-level `tags` table, see
 * services/tags.ts). The read path decorates `tags: [{ id, name, color }]`; serialize() strips it.
 */
export type TagRef = { id: string; name: string; color: string };
export type TagsValue = { tag_ids: string[]; tags?: TagRef[] };

export const tagNames = (v: TagsValue | null | undefined): string[] => {
  const byId = new Map((v?.tags ?? []).map((t) => [t.id, t.name]));
  return (v?.tag_ids ?? []).map((id) => byId.get(id) ?? id);
};

export const tagsColumn: ColumnLogic<TagsValue> = {
  type: "tags",
  label: "Tags",
  category: "essentials",
  icon: "Tag",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined || input === "") return null;
    const list = Array.isArray(input) ? input : isObj(input) ? (input.tag_ids ?? input.tagIds ?? input.ids) : [input];
    if (!Array.isArray(list)) throw new ValidationError("Tags value must be { tag_ids: [...] }");
    const ids: string[] = [];
    for (const e of list) {
      const id = String(isObj(e) ? e.id : e);
      if (!/^\d+$/.test(id)) throw new ValidationError(`Invalid tag id: ${JSON.stringify(e)}`);
      if (!ids.includes(id)) ids.push(id);
    }
    return ids.length ? { tag_ids: ids } : null;
  },
  serialize: (v) => (v ? { tag_ids: v.tag_ids } : null),
  format: (v) => tagNames(v).join(", "),
  filter: {
    operators: [
      { id: "any_of", label: "Is any of", needsOperand: true },
      { id: "none_of", label: "Is none of", needsOperand: true },
      { id: "contains", label: "Contains text", needsOperand: true },
      OP_IS_EMPTY,
      OP_NOT_EMPTY,
    ],
    test: (v, op, operand) => (op === "contains" ? testText(tagNames(v).join(" "), "contains", operand) : testSet(v?.tag_ids ?? [], op, operand)),
  },
  sortKey: (v) => (v?.tag_ids.length ? tagNames(v).join(", ").toLowerCase() : null),
  summarize(vals) {
    const counts = new Map<string, number>();
    for (const v of vals) for (const n of tagNames(v)) counts.set(n, (counts.get(n) ?? 0) + 1);
    return counts.size ? { segments: [...counts].map(([label, count]) => ({ label, color: "#579bfc", count })) } : null;
  },
};
