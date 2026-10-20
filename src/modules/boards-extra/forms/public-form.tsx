"use client";

import { Button, TextField } from "@vibe/core";
import { useMemo, useState } from "react";
import { I18nProvider, useT } from "@/lib/i18n/client";
import { QuestionInput } from "./fields";
import styles from "./forms.module.css";
import { isEmptyAnswer, visibleQuestionIds } from "./logic";
import type { FieldError, PublicForm, SubmitResult } from "./types";

interface Props {
  form: PublicForm;
  /** public = real submit; preview = builder canvas (inputs disabled, questions selectable) */
  mode?: "public" | "preview";
  viewerName?: string | null;
  selectedQuestionId?: string | null;
  onSelectQuestion?: (id: string) => void;
}

const themeVars = (f: PublicForm) => ({ "--form-primary": f.settings.primaryColor || "#0073ea", "--form-bg": f.settings.backgroundColor || "#f6f7fb" }) as React.CSSProperties;

function PublicFormInner({ form: initial, mode = "public", viewerName, selectedQuestionId, onSelectQuestion }: Props) {
  const t = useT();
  const preview = mode === "preview";
  const [form, setForm] = useState(initial);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<SubmitResult["thankYou"] | null>(null);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const live = preview ? initial : form;

  const visible = useMemo(
    () => visibleQuestionIds(live.questions.map((q) => ({ id: q.id, hidden: false, kind: q.kind, settings: { logic: q.logic } })), answers),
    [live.questions, answers],
  );

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setPwError("");
    const res = await fetch(`/api/public/forms/${form.token}/unlock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const data = res.ok ? ((await res.json()) as PublicForm) : null;
    setBusy(false);
    if (res.status === 429) return setPwError(t("forms.public.rateLimited"));
    if (!data || data.locked) return setPwError(t("forms.public.wrongPassword"));
    setForm(data);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (preview) return;
    const local: Record<string, string> = {};
    for (const q of form.questions) {
      if (visible.has(q.id) && q.required && q.kind !== "section" && isEmptyAnswer(answers[q.id])) local[q.id] = t("forms.public.required");
    }
    setErrors(local);
    setBanner("");
    if (Object.keys(local).length) return;
    setBusy(true);
    const shown = Object.fromEntries(Object.entries(answers).filter(([id]) => visible.has(id)));
    const website = (new FormData(e.currentTarget).get("website") as string) ?? "";
    const res = await fetch(`/api/public/forms/${form.token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: shown, password, website }) });
    setBusy(false);
    const data = await res.json().catch(() => null);
    if (res.ok) {
      const ty = (data as SubmitResult).thankYou;
      setDone(ty);
      if (ty.redirectUrl) setTimeout(() => { window.location.href = ty.redirectUrl!; }, 1500);
      return;
    }
    if (res.status === 429) return setBanner(t("forms.public.rateLimited"));
    if (res.status === 409) return setBanner(t("forms.public.alreadyResponded"));
    if (res.status === 401) return setBanner(t("forms.public.loginRequired"));
    const details = (data?.error?.details ?? []) as FieldError[];
    if (res.status === 400 && details.length && details[0].questionId) {
      setErrors(Object.fromEntries(details.map((d) => [d.questionId, d.message])));
    }
    setBanner(t("forms.public.error"));
  };

  const reset = () => { setAnswers({}); setErrors({}); setDone(null); setBanner(""); };
  const s = live.settings;

  return (
    <div className={`${styles.formPage} ${preview ? styles.formPreview : ""}`} style={themeVars(live)} data-testid="public-form">
      {s.coverUrl ? <div className={styles.cover} style={{ backgroundImage: `url(${JSON.stringify(s.coverUrl).slice(1, -1)})` }} data-testid="form-cover" /> : null}
      <div className={`${styles.formCard} ${s.coverUrl ? styles.formCardCover : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- external logo URL chosen by the form owner */}
        {s.logoUrl ? <img className={styles.logo} src={s.logoUrl} alt="" /> : null}
        <h1 className={styles.formTitle} data-testid="form-title">{live.name}</h1>
        {s.description ? <p className={styles.formDesc}>{s.description}</p> : null}
        {!!s.tags?.length && <div className={styles.tagRow}>{s.tags.map((tag) => <span key={tag} className={styles.tag}>{tag}</span>)}</div>}

        {done ? (
          <div className={styles.thanks} data-testid="form-thanks">
            <h2>{done.title}</h2>
            {done.message ? <p>{done.message}</p> : null}
            {done.redirectUrl ? null : <Button kind="secondary" onClick={reset} data-testid="form-another">{t("forms.public.another")}</Button>}
          </div>
        ) : live.locked ? (
          <form className={styles.lockBox} onSubmit={unlock} data-testid="form-locked">
            <h2>{t("forms.public.passwordTitle")}</h2>
            <p>{t("forms.public.passwordHint")}</p>
            <TextField value={password} onChange={setPassword} type="password" placeholder={t("forms.password")} data-testid="form-password" />
            {pwError ? <div className={styles.error} role="alert" data-testid="form-password-error">{pwError}</div> : null}
            <Button type="submit" loading={busy} data-testid="form-unlock">{t("forms.public.unlock")}</Button>
          </form>
        ) : live.requireLogin && !viewerName && !preview ? (
          <div className={styles.lockBox} data-testid="form-login-required">
            <h2>{t("forms.public.loginRequired")}</h2>
            <a className={styles.loginLink} href={`/login?next=${encodeURIComponent(`/f/${live.token}`)}`}>{t("forms.public.login")}</a>
          </div>
        ) : (
          <form onSubmit={submit} noValidate data-testid="form-body">
            {live.questions.filter((q) => visible.has(q.id) || preview).map((q) => (
              <div
                key={q.id}
                className={`${styles.question} ${preview ? styles.questionSelectable : ""} ${selectedQuestionId === q.id ? styles.questionSelected : ""} ${preview && !visible.has(q.id) ? styles.questionDimmed : ""}`}
                onClick={preview ? () => onSelectQuestion?.(q.id) : undefined}
                data-testid={`form-question-${q.id}`}
              >
                {q.kind === "section" ? (
                  <><div className={styles.sectionTitle}>{q.title}</div>{q.description ? <p className={styles.qDesc}>{q.description}</p> : null}</>
                ) : (
                  <>
                    <label className={styles.qLabel} htmlFor={`form-input-${q.id}`}>{q.title}{q.required ? <span className={styles.star} aria-hidden="true"> *</span> : null}</label>
                    {q.description ? <p className={styles.qDesc}>{q.description}</p> : null}
                    <div className={preview ? styles.inert : undefined}>
                      <QuestionInput q={q} value={answers[q.id]} onChange={(v) => { setAnswers((a) => ({ ...a, [q.id]: v })); setErrors((er) => { const n = { ...er }; delete n[q.id]; return n; }); }} disabled={preview} />
                    </div>
                    {errors[q.id] ? <div className={styles.error} role="alert" data-testid={`form-error-${q.id}`}>{errors[q.id]}</div> : null}
                  </>
                )}
              </div>
            ))}
            {/* honeypot: invisible to people, bots fill it */}
            <div className={styles.honeypot} aria-hidden="true"><label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label></div>
            {banner ? <div className={styles.banner} role="alert" data-testid="form-banner">{banner}</div> : null}
            <Button type="submit" size="large" loading={busy} disabled={preview} className={styles.submit} data-testid="form-submit">{s.submitLabel || t("forms.public.submit")}</Button>
          </form>
        )}
      </div>
    </div>
  );
}

/** The public form (also used as live preview inside the builder). */
export function PublicFormView(props: Props & { locale?: "nl" | "en"; withProvider?: boolean }) {
  const { locale = "nl", withProvider = true, ...rest } = props;
  const inner = <PublicFormInner {...rest} />;
  return withProvider ? <I18nProvider locale={locale}>{inner}</I18nProvider> : inner;
}
