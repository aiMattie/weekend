import { ValidationError } from "../../lib/errors";
import { normalizeStatusLabels, statusLabels, type StatusLabel } from "./labels";
import { OP_IS_EMPTY, OP_NOT_EMPTY, testSet } from "./ops";
import type { ColumnLogic, ColumnRef } from "./types";

/** status: `{ index }` where index = StatusLabel.id of settings.labels. */
export type StatusValue = { index: number };

export const DEFAULT_STATUS_LABELS: StatusLabel[] = [
  { id: 0, text: "Working on it", color: "#fdab3d", index: 0 },
  { id: 1, text: "Done", color: "#00c875", index: 1, isDone: true },
  { id: 2, text: "Stuck", color: "#df2f4a", index: 2 },
  { id: 5, text: "", color: "#c4c4c4", index: 3 },
];

export function findStatusLabel(column: ColumnRef, value: StatusValue | null): StatusLabel | undefined {
  return value ? statusLabels(column.settings).find((l) => l.id === value.index) : undefined;
}

export const statusColumn: ColumnLogic<StatusValue> = {
  type: "status",
  label: "Status",
  category: "status",
  icon: "Status",
  defaultSettings: () => ({ labels: DEFAULT_STATUS_LABELS }),
  normalizeSettings: (s) => ({ ...s, labels: normalizeStatusLabels(s.labels ?? DEFAULT_STATUS_LABELS) }),
  validate(input, column) {
    if (input === null || input === undefined || input === "") return null;
    const labels = statusLabels(column.settings);
    let hit: StatusLabel | undefined;
    const o = typeof input === "object" ? (input as Record<string, unknown>) : null;
    if (o && (typeof o.index === "number" || typeof o.index === "string")) hit = labels.find((l) => l.id === Number(o.index));
    else if (o && typeof o.label === "string") hit = labels.find((l) => l.text.toLowerCase() === (o.label as string).toLowerCase());
    else if (typeof input === "number") hit = labels.find((l) => l.id === input);
    else if (typeof input === "string") hit = labels.find((l) => l.text.toLowerCase() === input.toLowerCase()) ?? (/^\d+$/.test(input) ? labels.find((l) => l.id === Number(input)) : undefined);
    if (!hit) throw new ValidationError(`Unknown status label for column "${column.title}": ${JSON.stringify(input)}`);
    return { index: hit.id };
  },
  serialize: (v) => v,
  format: (v, c) => findStatusLabel(c, v)?.text ?? "",
  filter: {
    operators: [{ id: "any_of", label: "Is any of", needsOperand: true }, { id: "none_of", label: "Is none of", needsOperand: true }, OP_IS_EMPTY, OP_NOT_EMPTY],
    /** operand: array of label ids */
    test: (v, op, operand) => testSet(v ? [String(v.index)] : [], op, operand),
  },
  sortKey: (v, c) => {
    const l = findStatusLabel(c, v);
    return l ? l.index : null;
  },
  summarize(vals, c) {
    const labels = statusLabels(c.settings);
    const segments = labels
      .map((l) => ({ label: l.text, color: l.color, count: vals.filter((v) => v?.index === l.id).length }))
      .filter((s) => s.count > 0);
    return segments.length ? { segments } : null;
  },
};
