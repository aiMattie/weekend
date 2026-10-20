"use client";

import { Button } from "@vibe/core";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { ItemDto } from "@/lib/board-types";
import { formInput, isEmptyDraft, resolveFormFields, type FormFieldCfg } from "@/modules/views/lib/form";
import { FormFieldInput } from "@/modules/views/ui/form-field";
import { useViewSettings } from "@/modules/views/ui/use-view-settings";
import { ViewFrame } from "@/modules/views/ui/view-frame";
import styles from "@/modules/views/ui/form.module.css";
import frame from "@/modules/views/ui/views.module.css";
import type { ViewProps } from "./types";

interface WorkForm { id: string; name: string; isPublished?: boolean; published?: boolean }

/** In-board form: fields come from the board's columns, a submit creates an item. */
export function FormView(props: ViewProps) {
  const { board, view, actions, onOpenItem, canEdit, canEditStructure } = props;
  const t = useT();
  const { settings, patch } = useViewSettings(view, actions, canEditStructure);
  const fields = useMemo(() => resolveFormFields(board.columns, settings.fields), [board.columns, settings.fields]);
  const title = typeof settings.title === "string" && settings.title ? settings.title : board.board.name;
  const description = typeof settings.description === "string" ? settings.description : "";
  const groupId = typeof settings.groupId === "string" && board.groups.some((g) => g.id === settings.groupId) ? settings.groupId : board.groups[0]?.id ?? "";
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<ItemDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [workForms, setWorkForms] = useState<WorkForm[]>([]);
  useEffect(() => {
    let live = true;
    api.get<WorkForm[]>(`/api/v1/forms?boardId=${board.board.id}`).then((f) => { if (live && Array.isArray(f)) setWorkForms(f); }).catch(() => undefined);
    return () => { live = false; };
  }, [board.board.id]);

  const saveFields = (next: FormFieldCfg[]) => patch({ fields: next });
  const cfgOf = (): FormFieldCfg[] => fields.map((f) => ({ columnId: f.column.id, label: f.label === f.column.title ? undefined : f.label, required: f.required, visible: f.visible }));
  const updateField = (columnId: string, p: Partial<FormFieldCfg>) => saveFields(cfgOf().map((c) => (c.columnId === columnId ? { ...c, ...p } : c)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.__name = t("vw.form.required");
    for (const f of fields) if (f.visible && f.required && isEmptyDraft(draft[f.column.id])) errs[f.column.id] = t("vw.form.required");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const values: Record<string, unknown> = {};
    for (const f of fields) {
      if (!f.visible) continue;
      const v = formInput(f.column.type, draft[f.column.id]);
      if (v !== null) values[f.column.id] = v;
    }
    setBusy(true);
    try {
      const item = await api.post<ItemDto>("/api/v1/items", { boardId: board.board.id, groupId: groupId || undefined, name: name.trim(), values });
      setCreated(item);
      setName("");
      setDraft({});
      await actions.refetch();
    } catch (err) {
      setErrors({ __form: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const controls = canEditStructure ? (
    <button type="button" className={`${frame.barBtn} ${editing ? frame.barBtnActive : ""}`} onClick={() => setEditing((v) => !v)} data-testid="form-edit-toggle">{editing ? t("vw.form.done") : t("vw.form.edit")}</button>
  ) : null;

  return (
    <ViewFrame props={props} settings={settings} patch={patch} controls={controls} testId="form-view">
      <form className={styles.wrap} onSubmit={submit} data-testid="form-body" noValidate>
        {editing ? (
          <>
            <label className={styles.field}><span className={styles.label}>{t("vw.form.titleLabel")}</span><input className={styles.input} defaultValue={settings.title as string | undefined} onBlur={(e) => patch({ title: e.target.value })} data-testid="form-edit-title" /></label>
            <label className={styles.field}><span className={styles.label}>{t("vw.form.descLabel")}</span><textarea className={styles.input} rows={2} defaultValue={description} onBlur={(e) => patch({ description: e.target.value })} data-testid="form-edit-desc" /></label>
            <label className={styles.field}><span className={styles.label}>{t("vw.form.group")}</span>
              <select className={styles.input} value={groupId} onChange={(e) => patch({ groupId: e.target.value })} data-testid="form-edit-group">{board.groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select>
            </label>
            <div data-testid="form-edit-fields">
              <div className={`${styles.editRow} ${styles.editHead}`}><span /><span>{t("vw.form.fieldLabel")}</span><span>{t("vw.form.requiredCol")}</span></div>
              {fields.map((f) => (
                <div key={f.column.id} className={styles.editRow} data-testid={`form-edit-row-${f.column.key}`}>
                  <input type="checkbox" checked={f.visible} onChange={(e) => updateField(f.column.id, { visible: e.target.checked })} data-testid={`form-edit-visible-${f.column.key}`} />
                  <input className={styles.input} defaultValue={f.label} onBlur={(e) => updateField(f.column.id, { label: e.target.value })} />
                  <input type="checkbox" checked={f.required} onChange={(e) => updateField(f.column.id, { required: e.target.checked })} data-testid={`form-edit-required-${f.column.key}`} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2 className={styles.title} data-testid="form-title">{title}</h2>
            {description ? <p className={styles.desc}>{description}</p> : null}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="form-name">{t("vw.form.name")}<span className={styles.req}>*</span></label>
              <input id="form-name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} data-testid="form-input-name" />
              {errors.__name ? <span className={styles.error}>{errors.__name}</span> : null}
            </div>
            {fields.filter((f) => f.visible).map((f) => (
              <div key={f.column.id} className={styles.field} data-testid={`form-field-${f.column.key}`}>
                <label className={styles.label} htmlFor={`form-${f.column.id}`}>{f.label}{f.required ? <span className={styles.req}>*</span> : null}</label>
                <FormFieldInput id={`form-${f.column.id}`} board={board} column={f.column} value={draft[f.column.id]} onChange={(v) => setDraft((d) => ({ ...d, [f.column.id]: v }))} />
                {errors[f.column.id] ? <span className={styles.error}>{errors[f.column.id]}</span> : null}
              </div>
            ))}
            {errors.__form ? <div className={styles.error} role="alert">{errors.__form}</div> : null}
            {created ? (
              <div className={styles.success} role="status" data-testid="form-success">
                <span>{t("vw.form.created", { name: created.name })}</span>
                <button type="button" className={styles.link} onClick={() => onOpenItem(created.id)}>{t("table.openItem")}</button>
              </div>
            ) : null}
            <div className={styles.actions}>
              <Button type="submit" disabled={busy || !canEdit} data-testid="form-submit">{(typeof settings.submitLabel === "string" && settings.submitLabel) || t("vw.form.submit")}</Button>
              <Link className={styles.link} href={workForms.length ? `/forms/${workForms[0].id}` : "/forms"} data-testid="form-workforms-link">{workForms.length ? t("vw.form.workforms") : t("vw.form.workformsNew")}</Link>
            </div>
          </>
        )}
      </form>
    </ViewFrame>
  );
}
