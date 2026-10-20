import type { ColumnLogic } from "./types";

/** checkbox: `{ checked: true }`; unchecked is stored as null. */
export type CheckboxValue = { checked: boolean };

export const checkboxColumn: ColumnLogic<CheckboxValue> = {
  type: "checkbox",
  label: "Checkbox",
  category: "essentials",
  icon: "Check",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined) return null;
    const raw = typeof input === "object" ? (input as { checked?: unknown }).checked : input;
    const checked = raw === true || raw === "true" || raw === 1 || raw === "1";
    return checked ? { checked: true } : null;
  },
  serialize: (v) => v ?? { checked: false },
  format: (v) => (v?.checked ? "v" : ""),
  filter: {
    operators: [
      { id: "is_checked", label: "Is checked", needsOperand: false },
      { id: "is_not_checked", label: "Is not checked", needsOperand: false },
    ],
    test: (v, op) => (op === "is_checked" ? !!v?.checked : op === "is_not_checked" ? !v?.checked : true),
  },
  sortKey: (v) => (v?.checked ? 1 : 0),
  summarize(vals) {
    const n = vals.filter((v) => v?.checked).length;
    return { text: `${n}/${vals.length}` };
  },
};
