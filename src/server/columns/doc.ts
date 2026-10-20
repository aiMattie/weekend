import { ValidationError } from "../../lib/errors";
import { OP_IS_EMPTY, OP_NOT_EMPTY, testText } from "./ops";
import type { ColumnLogic } from "./types";
import { isObj } from "./util";

/**
 * doc: link to a WorkDoc. Stored `{ files: [{ objectId, fileType: "DOC", name? }] }` (API shape,
 * `objectId` = docs.id). The read path decorates `name` with the doc's current title.
 */
export interface DocRef { objectId: string; fileType: "DOC"; name?: string; linkToFile?: string }
export type DocValue = { files: DocRef[] };

export const docColumn: ColumnLogic<DocValue> = {
  type: "doc",
  label: "Doc",
  category: "files",
  icon: "Doc",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined || input === "") return null;
    const list = Array.isArray(input) ? input : isObj(input) && Array.isArray(input.files) ? input.files : isObj(input) ? [input] : [input];
    const files: DocRef[] = [];
    for (const e of list) {
      const id = String(isObj(e) ? (e.objectId ?? e.docId ?? e.id ?? "") : e);
      if (!/^\d+$/.test(id)) throw new ValidationError(`Invalid doc reference: ${JSON.stringify(e)}`);
      if (!files.some((f) => f.objectId === id)) files.push({ objectId: id, fileType: "DOC", ...(isObj(e) && typeof e.name === "string" ? { name: e.name } : {}) });
    }
    return files.length ? { files } : null;
  },
  serialize: (v) => (v ? { files: v.files.map((f) => ({ objectId: f.objectId, fileType: "DOC" })) } : null),
  format: (v) => (v?.files ?? []).map((f) => f.name ?? f.objectId).join(", "),
  filter: {
    operators: [{ id: "contains", label: "Contains text", needsOperand: true }, OP_IS_EMPTY, OP_NOT_EMPTY],
    test: (v, op, operand) => (op === "contains" ? testText(docColumn.format(v, { id: "", key: "", title: "", type: "doc", settings: {} }), "contains", operand) : op === "is_empty" ? !v?.files.length : op === "is_not_empty" ? !!v?.files.length : true),
  },
  sortKey: (v) => (v?.files.length ? docColumn.format(v, { id: "", key: "", title: "", type: "doc", settings: {} }).toLowerCase() : null),
};
