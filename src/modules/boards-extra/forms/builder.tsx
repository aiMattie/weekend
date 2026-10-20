"use client";

import { Button } from "@vibe/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { buildPreview, type BuilderColumn, type BuilderUser } from "./builder-utils";
import { FormSettingsPanel } from "./form-settings";
import styles from "./forms.module.css";
import { QuestionList } from "./question-list";
import { QuestionSettings } from "./question-settings";
import { PublicFormView } from "./public-form";
import { ShareDialog } from "./share-dialog";
import type { FormDto, FormWithQuestions, QuestionDto } from "./types";

interface Props {
  initial: FormWithQuestions;
  boardName: string;
  columns: BuilderColumn[];
  users: BuilderUser[];
  availableColumns: { id: string; title: string; type: string }[];
  submissionsCount: number;
  canEdit: boolean;
}

/** merge plain objects recursively (so two quick edits of thankYou.title and thankYou.message both survive) */
function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) && cur && typeof cur === "object" && !Array.isArray(cur) ? deepMerge(cur as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out;
}

type QPatch = { title?: string; description?: string | null; required?: boolean; hidden?: boolean; settings?: Record<string, unknown> };

export function FormBuilder({ initial, boardName, columns, users, availableColumns: initialAvailable, submissionsCount, canEdit }: Props) {
  const t = useT();
  const router = useRouter();
  const [form, setForm] = useState<FormDto>(initial.form);
  const [questions, setQuestions] = useState<QuestionDto[]>(initial.questions);
  const [available, setAvailable] = useState(initialAvailable);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"question" | "design" | "settings">("design");
  const [share, setShare] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(initial.form.name);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, Record<string, unknown>>());

  const flash = useCallback(() => { setSaved(true); setTimeout(() => setSaved(false), 1500); }, []);
  const fail = useCallback((e: unknown) => setError(e instanceof Error ? e.message : t("common.error")), [t]);
  const refreshAvailable = useCallback(async () => {
    try { setAvailable(await api.get(`/api/v1/forms/${form.id}/questions`)); } catch { /* keep the old list */ }
  }, [form.id]);

  /** queue a PATCH for `key`; text inputs debounce, toggles go out immediately */
  const send = useCallback((key: string, url: string, patch: Record<string, unknown>, onDone: (r: never) => void, debounce: boolean) => {
    const merged = deepMerge(pending.current.get(key) ?? {}, patch);
    pending.current.set(key, merged);
    clearTimeout(timers.current.get(key));
    const run = async () => {
      const body = pending.current.get(key);
      pending.current.delete(key);
      if (!body) return;
      try { onDone((await api.patch(url, body)) as never); setError(""); flash(); } catch (e) { fail(e); }
    };
    if (debounce) timers.current.set(key, setTimeout(run, 450));
    else void run();
  }, [fail, flash]);

  useEffect(() => { const tm = timers.current; return () => { for (const x of tm.values()) clearTimeout(x); }; }, []);

  const patchForm = (patch: { name?: string; settings?: Record<string, unknown> }, debounce = false) => {
    setForm((f) => {
      const s = patch.settings ? { ...f.settings, ...patch.settings } : f.settings;
      if (patch.settings?.thankYou) s.thankYou = { ...(f.settings.thankYou ?? {}), ...(patch.settings.thankYou as object) };
      if (patch.settings && "password" in patch.settings) s.hasPassword = !!patch.settings.password;
      return { ...f, ...(patch.name !== undefined ? { name: patch.name } : {}), settings: s as FormDto["settings"] };
    });
    send("form", `/api/v1/forms/${form.id}`, patch, ((r: FormDto) => setForm((f) => ({ ...f, settings: { ...f.settings, hasPassword: r.settings.hasPassword } }))) as never, debounce);
  };
  const patchQuestion = (id: string, patch: QPatch, debounce = false) => {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch, settings: patch.settings ? { ...q.settings, ...patch.settings } : q.settings } : q)));
    send(`q:${id}`, `/api/v1/forms/${form.id}/questions/${id}`, patch, (() => undefined) as never, debounce);
  };

  const addQuestion = async (body: Record<string, unknown>) => {
    try {
      const q = await api.post<QuestionDto>(`/api/v1/forms/${form.id}/questions`, body);
      setQuestions((qs) => [...qs, q]);
      setSelectedId(q.id);
      setTab("question");
      void refreshAvailable();
    } catch (e) { fail(e); }
  };
  const removeQuestion = async (id: string) => {
    try {
      await api.del(`/api/v1/forms/${form.id}/questions/${id}`);
      setQuestions((qs) => qs.filter((q) => q.id !== id));
      setSelectedId(null);
      setTab("design");
      void refreshAvailable();
    } catch (e) { fail(e); }
  };
  const reorder = async (ids: string[]) => {
    setQuestions((qs) => ids.map((id) => qs.find((q) => q.id === id)!).filter(Boolean));
    try { await api.put(`/api/v1/forms/${form.id}/questions`, { questionIds: ids }); flash(); } catch (e) { fail(e); }
  };
  const publish = async (published: boolean) => {
    try { setForm(await api.post<FormDto>(`/api/v1/forms/${form.id}/publish`, { published })); } catch (e) { fail(e); }
  };
  const newLink = async () => {
    try { setForm(await api.post<FormDto>(`/api/v1/forms/${form.id}/token`, {})); } catch (e) { fail(e); }
  };
  const remove = async () => {
    if (!window.confirm(t("forms.deleteConfirm"))) return;
    try { await api.del(`/api/v1/forms/${form.id}`); router.push("/forms"); } catch (e) { fail(e); }
  };

  const selected = questions.find((q) => q.id === selectedId) ?? null;
  const preview = useMemo(() => buildPreview(form, questions, columns, users), [form, questions, columns, users]);
  const selectQuestion = (id: string) => { setSelectedId(id); setTab("question"); };

  return (
    <div className={styles.builder} data-testid="form-builder">
      <div className={styles.builderBar}>
        <Link href="/forms" className={styles.formMeta}>&lt; {t("forms.back")}</Link>
        <input className={styles.builderName} value={name} disabled={!canEdit} aria-label={t("forms.name")} data-testid="builder-name"
          onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name.trim() !== form.name) patchForm({ name: name.trim() }); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        <span className={form.isPublished ? styles.badgeOn : styles.badgeOff} data-testid="publish-state">{form.isPublished ? t("forms.published") : t("forms.draft")}</span>
        {saved && <span className={styles.savedNote} data-testid="saved-note">{t("forms.saved")}</span>}
        {error && <span className={styles.error} role="alert" data-testid="builder-error">{error}</span>}
        <span className={styles.barSpacer} />
        <span className={styles.formMeta} data-testid="submissions-count">{t("forms.submissionsCount", { count: submissionsCount })}</span>
        <Link href={`/boards/${form.boardId}`} className={styles.formMeta} title={boardName} data-testid="open-board">{t("forms.viewBoard")}</Link>
        <Button kind="secondary" size="small" onClick={() => setShare(true)} data-testid="share-form-button">{t("forms.share")}</Button>
        {canEdit && <Button kind="tertiary" color="negative" size="small" onClick={remove} data-testid="delete-form">{t("forms.delete")}</Button>}
        {canEdit && <Button size="small" kind={form.isPublished ? "secondary" : "primary"} onClick={() => publish(!form.isPublished)} data-testid="publish-toggle">{form.isPublished ? t("forms.unpublish") : t("forms.publish")}</Button>}
      </div>
      <div className={styles.builderBody}>
        <div className={styles.leftPane}>
          <QuestionList questions={questions} selectedId={selectedId} availableColumns={available} canEdit={canEdit} onSelect={selectQuestion} onReorder={reorder}
            onAddColumn={(columnId) => addQuestion({ columnId })} onAddSection={() => addQuestion({ kind: "section", title: t("forms.kind.section") })} />
        </div>
        <div className={styles.centerPane} data-testid="form-preview">
          <p className={styles.helpText} style={{ marginBottom: 8 }}>{t("forms.previewHint")}</p>
          <PublicFormView form={preview} mode="preview" selectedQuestionId={selectedId} onSelectQuestion={selectQuestion} withProvider={false} />
        </div>
        <div className={styles.rightPane}>
          <div className={styles.tabs}>
            {(["question", "design", "settings"] as const).map((k) => (
              <button key={k} type="button" className={`${styles.tabBtn} ${tab === k ? styles.tabActive : ""}`} onClick={() => setTab(k)} data-testid={`tab-${k}`}>{t(`forms.tab.${k}`)}</button>
            ))}
          </div>
          {tab === "question" ? (
            selected ? (
              <QuestionSettings key={selected.id} question={selected} questions={questions} column={columns.find((c) => c.id === selected.columnId)} columns={columns} users={users}
                canEdit={canEdit} onChange={(patch, d) => patchQuestion(selected.id, patch, d)} onRemove={() => removeQuestion(selected.id)} />
            ) : <p className={styles.helpText}>{t("forms.selectQuestion")}</p>
          ) : (
            <FormSettingsPanel form={form} canEdit={canEdit} tab={tab} onChange={(p, d) => patchForm({ settings: p }, d)} />
          )}
        </div>
      </div>
      {share && <ShareDialog token={form.token} published={form.isPublished} canEdit={canEdit} onNewLink={newLink} onClose={() => setShare(false)} />}
    </div>
  );
}
