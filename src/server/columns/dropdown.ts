import { ValidationError } from "../../lib/errors";
import { dropdownLabels, type DropdownLabel } from "./labels";
import { SET_OPS, testSet } from "./ops";
import type { ColumnLogic } from "./types";

/** dropdown: `{ ids: number[] }` referencing settings.labels[].id. settings.allowMultiple (default true). */
export type DropdownValue = { ids: number[] };

export const dropdownColumn: ColumnLogic<DropdownValue> = {
  type: "dropdown",
  label: "Dropdown",
  category: "essentials",
  icon: "Dropdown",
  defaultSettings: () => ({ labels: [] as DropdownLabel[], allowMultiple: true }),
  normalizeSettings(s) {
    const raw = Array.isArray(s.labels) ? s.labels : [];
    const labels = raw.map((l, i) => {
      const r = l as Record<string, unknown>;
      return { id: Number.isInteger(r.id) ? (r.id as number) : i + 1, text: String(r.text ?? r.label ?? l).trim() };
    });
    if (new Set(labels.map((l) => l.id)).size !== labels.length) throw new ValidationError("Duplicate dropdown label ids");
    return { ...s, labels, allowMultiple: s.allowMultiple !== false };
  },
  validate(input, column) {
    if (input === null || input === undefined) return null;
    const labels = dropdownLabels(column.settings);
    const list: unknown[] = Array.isArray(input)
      ? input
      : input && typeof input === "object"
        ? (((input as { ids?: unknown[]; labels?: unknown[] }).ids ?? (input as { labels?: unknown[] }).labels) as unknown[]) ?? []
        : [input];
    const ids: number[] = [];
    for (const e of list) {
      const hit = typeof e === "number" || /^\d+$/.test(String(e)) ? labels.find((l) => l.id === Number(e)) : labels.find((l) => l.text.toLowerCase() === String(e).toLowerCase());
      if (!hit) throw new ValidationError(`Unknown dropdown option ${JSON.stringify(e)} for column "${column.title}"`);
      if (!ids.includes(hit.id)) ids.push(hit.id);
    }
    if (column.settings.allowMultiple === false && ids.length > 1) throw new ValidationError("This dropdown allows a single value");
    return ids.length ? { ids } : null;
  },
  serialize: (v) => v,
  format: (v, c) => {
    const labels = dropdownLabels(c.settings);
    return (v?.ids ?? []).map((id) => labels.find((l) => l.id === id)?.text ?? String(id)).join(", ");
  },
  filter: { operators: SET_OPS, test: (v, op, operand) => testSet((v?.ids ?? []).map(String), op, operand) },
  sortKey: (v, c) => (v?.ids.length ? dropdownColumn.format(v, c).toLowerCase() : null),
  summarize(vals, c) {
    const segments = dropdownLabels(c.settings)
      .map((l) => ({ label: l.text, color: "#579bfc", count: vals.filter((v) => v?.ids.includes(l.id)).length }))
      .filter((s) => s.count > 0);
    return segments.length ? { segments } : null;
  },
};
