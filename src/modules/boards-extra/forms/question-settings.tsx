"use client";

import { Button, Checkbox, TextArea, TextField, Toggle } from "@vibe/core";
import { useT } from "@/lib/i18n/client";
import { allOptionsOf, type BuilderColumn, type BuilderUser } from "./builder-utils";
import styles from "./forms.module.css";
import type { QuestionDto, QuestionLogic } from "./types";

type Rule = NonNullable<QuestionLogic["showWhen"]>[number];
const OPS: Rule["op"][] = ["equals", "not_equals", "contains", "not_empty", "is_empty"];

interface Props {
  question: QuestionDto;
  questions: QuestionDto[];
  column: BuilderColumn | undefined;
  columns: BuilderColumn[];
  users: BuilderUser[];
  canEdit: boolean;
  onChange: (patch: { title?: string; description?: string | null; required?: boolean; hidden?: boolean; settings?: Record<string, unknown> }, debounce?: boolean) => void;
  onRemove: () => void;
}

function LogicEditor({ question, questions, columns, users, onChange }: Pick<Props, "question" | "questions" | "columns" | "users" | "onChange">) {
  const t = useT();
  const logic = question.settings.logic ?? {};
  const rules = logic.showWhen ?? [];
  const others = questions.filter((q) => q.id !== question.id && q.kind !== "section");
  const save = (showWhen: Rule[], match = logic.match) => onChange({ settings: { logic: { showWhen, match } } });
  const setRule = (i: number, patch: Partial<Rule>) => save(rules.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div className={styles.settingsBody} data-testid="logic-editor">
      <div className={styles.sectionHead}>{t("forms.logic")}</div>
      <p className={styles.helpText}>{t("forms.logicHint")}</p>
      {rules.map((r, i) => {
        const dep = others.find((q) => q.id === r.questionId);
        const depCol = dep?.columnId ? columns.find((c) => c.id === dep.columnId) : undefined;
        const opts = dep ? allOptionsOf(dep, depCol, users) : [];
        const needsValue = r.op === "equals" || r.op === "not_equals" || r.op === "contains";
        return (
          <div key={i} className={styles.logicRule} data-testid={`logic-rule-${i}`}>
            <div className={styles.logicRuleHead}>
              <span>{t("forms.logicQuestion")}</span>
              <Button kind="tertiary" size="xs" onClick={() => save(rules.filter((_, k) => k !== i))} data-testid={`logic-remove-${i}`}>{t("forms.logicRemove")}</Button>
            </div>
            <select className={styles.nativeInput} value={r.questionId} onChange={(e) => setRule(i, { questionId: e.target.value, value: undefined })} data-testid={`logic-question-${i}`}>
              {others.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
            </select>
            <select className={styles.nativeInput} value={r.op} onChange={(e) => setRule(i, { op: e.target.value as Rule["op"] })} data-testid={`logic-op-${i}`}>
              {OPS.map((o) => <option key={o} value={o}>{t(`forms.logic.${o}`)}</option>)}
            </select>
            {needsValue && (opts.length && r.op !== "contains" ? (
              <select className={styles.nativeInput} value={r.value === undefined ? "" : String(r.value)} onChange={(e) => setRule(i, { value: e.target.value === "" ? undefined : Number(e.target.value) })} data-testid={`logic-value-${i}`}>
                <option value="" />
                {opts.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
              </select>
            ) : (
              <TextField value={String(r.value ?? "")} onChange={(v: string) => setRule(i, { value: v })} placeholder={t("forms.logicValue")} data-testid={`logic-value-${i}`} />
            ))}
          </div>
        );
      })}
      {rules.length > 1 && (
        <select className={styles.nativeInput} value={logic.match ?? "all"} onChange={(e) => save(rules, e.target.value as "all" | "any")} data-testid="logic-match">
          <option value="all">{t("forms.logicMatchAll")}</option>
          <option value="any">{t("forms.logicMatchAny")}</option>
        </select>
      )}
      {others.length > 0 && (
        <Button kind="secondary" size="small" onClick={() => save([...rules, { questionId: others[0].id, op: "not_empty" }])} data-testid="logic-add">{t("forms.logicAdd")}</Button>
      )}
    </div>
  );
}

export function QuestionSettings(props: Props) {
  const { question: q, column, users, canEdit, onChange, onRemove } = props;
  const t = useT();
  const isSection = q.kind === "section";
  const isName = q.kind === "name";
  const options = allOptionsOf(q, column, users);
  const allowed = (Array.isArray(q.settings.optionIds) ? (q.settings.optionIds as number[]) : []);
  const textual = ["name", "text", "long_text", "numbers", "email", "phone", "link", "checkbox"].includes(q.kind);
  const toggleOption = (id: number, on: boolean) => {
    const current = allowed.length ? allowed : options.map((o) => o.id);
    const next = on ? [...new Set([...current, id])] : current.filter((x) => x !== id);
    onChange({ settings: { optionIds: next.length === options.length || next.length === 0 ? [] : next } });
  };
  return (
    <div className={styles.settingsBody} data-testid="question-settings">
      <label className={styles.fieldLabel}>{t("forms.questionTitle")}
        <TextField value={q.title} onChange={(v: string) => onChange({ title: v }, true)} disabled={!canEdit} data-testid="q-title" />
      </label>
      <label className={styles.fieldLabel}>{t("forms.questionDescription")}
        <TextArea value={q.description ?? ""} onChange={(e) => onChange({ description: e.target.value }, true)} disabled={!canEdit} rows={3} data-testid="q-description" />
      </label>
      {textual && !isSection && (
        <label className={styles.fieldLabel}>{t("forms.placeholder")}
          <TextField value={String(q.settings.placeholder ?? "")} onChange={(v: string) => onChange({ settings: { placeholder: v } }, true)} disabled={!canEdit} data-testid="q-placeholder" />
        </label>
      )}
      {!isSection && (
        <div className={styles.toggleRow}>{t("forms.required")}
          <Toggle isSelected={q.required} disabled={!canEdit || isName} onChange={(v: boolean) => onChange({ required: v })} data-testid="q-required" aria-label={t("forms.required")} />
        </div>
      )}
      <div className={styles.toggleRow}>{t("forms.hidden")}
        <Toggle isSelected={q.hidden} disabled={!canEdit} onChange={(v: boolean) => onChange({ hidden: v })} data-testid="q-hidden" aria-label={t("forms.hidden")} />
      </div>
      {column && <p className={styles.helpText}>{t("forms.mappedTo")}: <b>{column.title}</b> ({column.type})</p>}
      {(q.kind === "status" || q.kind === "dropdown") && options.length > 0 && (
        <div className={styles.settingsBody}>
          <div className={styles.sectionHead}>{t("forms.options")}</div>
          {options.map((o) => (
            <Checkbox key={o.id} label={o.text} disabled={!canEdit} checked={allowed.length === 0 || allowed.includes(o.id)} onChange={(e) => toggleOption(o.id, e.target.checked)} data-testid={`q-option-${o.id}`} />
          ))}
        </div>
      )}
      {!isSection && !isName && canEdit && <LogicEditor {...props} />}
      {!isName && canEdit && <Button kind="tertiary" color="negative" size="small" onClick={onRemove} data-testid="q-remove">{t("forms.removeQuestion")}</Button>}
    </div>
  );
}
