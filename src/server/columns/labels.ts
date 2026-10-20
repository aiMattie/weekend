/** Shared label model for status + dropdown columns. */
import { ValidationError } from "../../lib/errors";

/**
 * Status label. `id` is the stable identifier (equals label "index" on import); stored
 * values reference it as `{ index: <id> }`. `index` is only the display order.
 */
export interface StatusLabel {
  id: number;
  text: string;
  color: string;
  index: number;
  isDone?: boolean;
}

export interface DropdownLabel {
  id: number;
  text: string;
}

export const HEX = /^#[0-9a-fA-F]{6}$/;

export function normalizeStatusLabels(raw: unknown): StatusLabel[] {
  if (!Array.isArray(raw)) throw new ValidationError("settings.labels must be an array");
  const seen = new Set<number>();
  const out = raw.map((l, i) => {
    const r = (l ?? {}) as Record<string, unknown>;
    const id = typeof r.id === "number" ? r.id : Number(r.id ?? i);
    const text = String(r.text ?? "").trim();
    const color = String(r.color ?? "#c4c4c4");
    if (!Number.isInteger(id) || id < 0) throw new ValidationError(`Invalid label id "${String(r.id)}"`);
    if (seen.has(id)) throw new ValidationError(`Duplicate label id ${id}`);
    if (!HEX.test(color)) throw new ValidationError(`Invalid label color "${color}" (use #rrggbb)`);
    seen.add(id);
    return { id, text, color, index: typeof r.index === "number" ? r.index : i, isDone: Boolean(r.isDone) };
  });
  return out.sort((a, b) => a.index - b.index).map((l, i) => ({ ...l, index: i }));
}

export const statusLabels = (settings: Record<string, unknown>): StatusLabel[] =>
  Array.isArray(settings.labels) ? (settings.labels as StatusLabel[]) : [];

export const dropdownLabels = (settings: Record<string, unknown>): DropdownLabel[] =>
  Array.isArray(settings.labels) ? (settings.labels as DropdownLabel[]) : [];
