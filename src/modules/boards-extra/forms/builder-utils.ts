/** Pure helpers for the form builder (client side). */
import { dropdownLabels, statusLabels } from "@/server/columns/labels";
import type { PublicForm, PublicOption, PublicQuestion, QuestionDto, FormDto } from "./types";

export interface BuilderColumn { id: string; key: string; title: string; type: string; settings: Record<string, unknown> }
export interface BuilderUser { id: string; name: string }

export function optionsOf(q: QuestionDto, col: BuilderColumn | undefined, users: BuilderUser[]): PublicOption[] | undefined {
  const allowed = Array.isArray(q.settings.optionIds) && q.settings.optionIds.length ? (q.settings.optionIds as number[]) : null;
  if (q.kind === "status" && col) return statusLabels(col.settings).filter((l) => l.text.trim() && (!allowed || allowed.includes(l.id))).map((l) => ({ id: l.id, text: l.text, color: l.color }));
  if (q.kind === "dropdown" && col) return dropdownLabels(col.settings).filter((l) => !allowed || allowed.includes(l.id)).map((l) => ({ id: l.id, text: l.text }));
  if (q.kind === "people") return users.map((u) => ({ id: Number(u.id), text: u.name }));
  return undefined;
}

/** All options of the mapped column (for the "available options" checklist). */
export const allOptionsOf = (q: QuestionDto, col: BuilderColumn | undefined, users: BuilderUser[]): PublicOption[] =>
  optionsOf({ ...q, settings: { ...q.settings, optionIds: [] } }, col, users) ?? [];

/** What a respondent would see, built from the builder state (hidden questions are left out). */
export function buildPreview(form: FormDto, questions: QuestionDto[], columns: BuilderColumn[], users: BuilderUser[]): PublicForm {
  const cols = new Map(columns.map((c) => [c.id, c]));
  const out: PublicQuestion[] = questions.filter((q) => !q.hidden).map((q) => {
    const col = q.columnId ? cols.get(q.columnId) : undefined;
    return {
      id: q.id, kind: q.kind, title: q.title, description: q.description, required: q.kind === "section" ? false : q.required,
      placeholder: typeof q.settings.placeholder === "string" ? q.settings.placeholder : undefined,
      options: optionsOf(q, col, users),
      multiple: q.kind === "people" ? true : q.kind === "dropdown" ? col?.settings.allowMultiple !== false : undefined,
      logic: q.settings.logic,
    };
  });
  const s = form.settings;
  return {
    token: form.token, name: form.name, locked: false, requireLogin: false,
    settings: { description: s.description, coverUrl: s.coverUrl, logoUrl: s.logoUrl, primaryColor: s.primaryColor, backgroundColor: s.backgroundColor, submitLabel: s.submitLabel, thankYou: s.thankYou, tags: s.tags },
    questions: out,
  };
}
