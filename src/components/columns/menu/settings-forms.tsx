"use client";

import { useState, type ComponentType } from "react";
import type { BoardFull, ColumnDto } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import { formulaRefs, parseFormula, FormulaError } from "@/server/columns/computed/formula-lang";
import { LabelEditor } from "./label-editor";
import { AggregateSelect, BoardRelationForm, MirrorForm, ProgressForm } from "./relation-forms";
import css from "./menu.module.css";

export interface FormProps {
  type: string;
  settings: Record<string, unknown>;
  /** shallow patch of the settings (undefined value deletes the key) */
  onChange: (patch: Record<string, unknown>) => void;
  board: BoardFull;
  /** existing column (edit mode) */
  column?: ColumnDto;
  mode: "create" | "edit";
}

function NumbersForm({ settings, onChange }: FormProps) {
  const t = useT();
  return (
    <div className={css.form} data-testid="numbers-form">
      <div className={css.row}>
        <label className={css.field} style={{ flex: 1 }}>{t("col.numbers.unit")}<input type="text" value={String(settings.unit ?? "")} data-testid="numbers-unit" onChange={(e) => onChange({ unit: e.target.value })} /></label>
        <label className={css.field} style={{ width: 130 }}>{t("col.numbers.unitPosition")}
          <select value={settings.unitPosition === "left" ? "left" : "right"} onChange={(e) => onChange({ unitPosition: e.target.value })}>
            <option value="left">{t("col.numbers.left")}</option><option value="right">{t("col.numbers.right")}</option>
          </select>
        </label>
        <label className={css.field} style={{ width: 100 }}>{t("col.numbers.decimals")}
          <input type="number" min={0} max={8} value={settings.decimals === undefined ? "" : String(settings.decimals)} data-testid="numbers-decimals" onChange={(e) => onChange({ decimals: e.target.value === "" ? undefined : Number(e.target.value) })} />
        </label>
      </div>
    </div>
  );
}

function RatingForm({ settings, onChange }: FormProps) {
  const t = useT();
  return (
    <div className={css.form}>
      <label className={css.field}>{t("col.rating.max")}
        <select value={String(settings.max ?? 5)} data-testid="rating-max" onChange={(e) => onChange({ max: Number(e.target.value) })}>
          {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
  );
}

function ButtonForm({ settings, onChange }: FormProps) {
  const t = useT();
  return (
    <div className={css.form}>
      <label className={css.field}>{t("col.button.label")}<input type="text" maxLength={40} value={String(settings.label ?? "")} data-testid="button-label" onChange={(e) => onChange({ label: e.target.value })} /></label>
      <label className={css.field}>{t("col.button.color")}<input type="color" value={String(settings.color ?? "#0073ea")} style={{ width: 60, height: 34 }} onChange={(e) => onChange({ color: e.target.value })} /></label>
      <span className={css.hint}>{t("col.button.hint")}</span>
    </div>
  );
}

function AutoNumberForm({ settings, onChange }: FormProps) {
  const t = useT();
  return (
    <div className={css.form}>
      <div className={css.row}>
        <label className={css.field} style={{ flex: 1 }}>{t("col.auto.prefix")}<input type="text" maxLength={10} value={String(settings.prefix ?? "")} onChange={(e) => onChange({ prefix: e.target.value })} /></label>
        <label className={css.field} style={{ width: 110 }}>{t("col.auto.digits")}<input type="number" min={0} max={10} value={String(settings.minDigits ?? 0)} onChange={(e) => onChange({ minDigits: Number(e.target.value) })} /></label>
        <label className={css.field} style={{ width: 110 }}>{t("col.auto.start")}<input type="number" min={0} value={String(settings.startAt ?? 1)} onChange={(e) => onChange({ startAt: Number(e.target.value) })} /></label>
      </div>
    </div>
  );
}

function LabelsForm({ type, settings, onChange, column }: FormProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const count = ((settings.labels as unknown[] | undefined) ?? []).length;
  const fake = { ...(column ?? { id: "new", boardId: "", key: "", title: "", type, scope: "item", description: null, position: 0, width: null }), type, settings } as ColumnDto;
  return (
    <div className={css.form}>
      <div className={css.row}>
        <span className={css.hint} style={{ flex: 1 }}>{t("col.labels.count", { n: count })}</span>
        <button type="button" className="" data-testid="edit-labels" onClick={() => setOpen(true)} style={{ border: "1px solid var(--app-border)", borderRadius: 4, background: "#fff", padding: "6px 12px", cursor: "pointer" }}>{t("col.labels.edit")}</button>
      </div>
      {type === "dropdown" ? (
        <label className={css.check}>
          <input type="checkbox" checked={settings.allowMultiple !== false} onChange={(e) => onChange({ allowMultiple: e.target.checked })} /> {t("col.dropdown.multiple")}
        </label>
      ) : null}
      {open ? <LabelEditor column={fake} onSave={(labels) => onChange({ labels })} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function FormulaForm({ settings, onChange, board, column }: FormProps) {
  const t = useT();
  const formula = String(settings.formula ?? "");
  let error: string | null = null;
  let refs: string[] = [];
  if (formula.trim()) {
    try { refs = formulaRefs(parseFormula(formula)); } catch (e) { error = e instanceof FormulaError ? `${e.message} (${e.pos})` : String(e); }
  }
  const cols = board.columns.filter((c) => c.scope === "item" && c.id !== column?.id);
  const missing = refs.filter((r) => !cols.some((c) => c.title.toLowerCase() === r.toLowerCase() || c.key.toLowerCase() === r.toLowerCase()) && r.toLowerCase() !== "name");
  return (
    <div className={css.form} data-testid="formula-form">
      <label className={css.field}>{t("col.formula.formula")}
        <textarea value={formula} placeholder="{Uren} * {Tarief}" data-testid="formula-input" onChange={(e) => onChange({ formula: e.target.value })} />
      </label>
      {error ? <span className={css.hintErr} data-testid="formula-error-hint">{error}</span> : null}
      {missing.length ? <span className={css.hintErr}>{t("col.formula.unknown", { names: missing.join(", ") })}</span> : null}
      <div className={css.chipRow}>
        {cols.filter((c) => c.type !== "name").map((c) => (
          <button key={c.id} type="button" className={css.insertChip} data-testid={`formula-col-${c.key}`} onClick={() => onChange({ formula: `${formula}{${c.title}}` })}>{c.title}</button>
        ))}
      </div>
      <div className={css.row}>
        <label className={css.field} style={{ width: 110 }}>{t("col.numbers.decimals")}<input type="number" min={0} max={8} value={settings.decimals === undefined ? "" : String(settings.decimals)} onChange={(e) => onChange({ decimals: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
        <label className={css.field} style={{ flex: 1 }}>{t("col.numbers.unit")}<input type="text" value={String(settings.unit ?? "")} onChange={(e) => onChange({ unit: e.target.value })} /></label>
        <label className={css.field} style={{ width: 110 }}>{t("col.numbers.unitPosition")}
          <select value={settings.unitPosition === "left" ? "left" : "right"} onChange={(e) => onChange({ unitPosition: e.target.value })}><option value="left">{t("col.numbers.left")}</option><option value="right">{t("col.numbers.right")}</option></select>
        </label>
      </div>
      <span className={css.hint}>{t("col.formula.help")}</span>
    </div>
  );
}

function DependencyForm({ settings, onChange }: FormProps) {
  const t = useT();
  return (
    <div className={css.form}>
      <label className={css.check}><input type="checkbox" checked={settings.allowMultiple !== false} onChange={(e) => onChange({ allowMultiple: e.target.checked })} /> {t("col.dependency.multiple")}</label>
      <span className={css.hint}>{t("col.dependency.hint")}</span>
    </div>
  );
}

const FORMS: Record<string, ComponentType<FormProps>> = {
  numbers: NumbersForm, rating: RatingForm, button: ButtonForm, auto_number: AutoNumberForm, status: LabelsForm, dropdown: LabelsForm,
  formula: FormulaForm, dependency: DependencyForm, board_relation: BoardRelationForm, mirror: MirrorForm, progress: ProgressForm,
};
export const hasSettingsForm = (type: string): boolean => type in FORMS;

/** Types whose summary row function can be chosen (settings.summary). */
export const SUMMARY_TYPES = new Set(["numbers"]);

export function ColumnSettingsForm(props: FormProps) {
  const Form = FORMS[props.type];
  const t = useT();
  return (
    <>
      {Form ? <Form {...props} /> : <span className={css.hint}>{t("col.settings.none")}</span>}
      {SUMMARY_TYPES.has(props.type) ? (
        <div className={css.form} style={{ marginTop: 12 }}>
          <label className={css.field}>{t("col.summary.title")}
            <select value={String(props.settings.summary ?? "sum")} data-testid="summary-select" onChange={(e) => props.onChange({ summary: e.target.value })}>
              {["sum", "avg", "min", "max", "median", "count", "none"].map((a) => <option key={a} value={a}>{t(`col.agg.${a}`)}</option>)}
            </select>
          </label>
        </div>
      ) : null}
    </>
  );
}
export { AggregateSelect };
