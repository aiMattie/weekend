/** In-board form view: which columns become fields and how raw form input maps to column input. */
import type { ColumnDto } from "@/lib/board-types";
import { itemColumns } from "./settings";

export const FORM_TYPES = ["text", "long_text", "numbers", "status", "dropdown", "people", "date", "timeline", "checkbox", "link", "email", "phone"] as const;
export const isFormColumn = (c: ColumnDto): boolean => (FORM_TYPES as readonly string[]).includes(c.type);

export interface FormFieldCfg { columnId: string; label?: string; required?: boolean; visible?: boolean }

/** Stored field config merged with the board's columns: never configured = every supported column visible. */
export function resolveFormFields(columns: ColumnDto[], stored: unknown): { column: ColumnDto; label: string; required: boolean; visible: boolean }[] {
  const cfgs = Array.isArray(stored) ? (stored as FormFieldCfg[]) : [];
  const configured = cfgs.length > 0;
  return itemColumns(columns).filter(isFormColumn).map((column) => {
    const c = cfgs.find((x) => x.columnId === column.id);
    return { column, label: c?.label?.trim() || column.title, required: !!c?.required, visible: configured ? c?.visible === true : true };
  });
}

/** Raw column input from the form's draft value, null when empty. */
export function formInput(type: string, draft: unknown): unknown {
  if (draft === undefined || draft === null || draft === "") return null;
  switch (type) {
    case "numbers": return String(draft).trim() === "" ? null : Number(draft);
    case "checkbox": return draft ? { checked: true } : null;
    case "link": return { url: String(draft), text: String(draft) };
    case "email": return { email: String(draft), text: String(draft) };
    case "phone": return { phone: String(draft) };
    case "status": return { index: Number(draft) };
    case "dropdown": return Array.isArray(draft) ? (draft.length ? { ids: draft.map(Number) } : null) : { ids: [Number(draft)] };
    case "people": return Array.isArray(draft) ? (draft.length ? { personsAndTeams: draft.map((id) => ({ id: String(id), kind: "person" })) } : null) : null;
    case "timeline": { const d = draft as { from?: string; to?: string }; return d.from && d.to ? { from: d.from, to: d.to } : d.from ? { from: d.from, to: d.from } : null; }
    case "date": return { date: String(draft) };
    default: return String(draft);
  }
}

export const isEmptyDraft = (draft: unknown): boolean =>
  draft === undefined || draft === null || draft === "" || draft === false || (Array.isArray(draft) && draft.length === 0) || (typeof draft === "object" && !Array.isArray(draft) && !(draft as { from?: string }).from);
