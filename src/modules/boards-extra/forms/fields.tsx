"use client";

import { Checkbox, TextArea, TextField } from "@vibe/core";
import { useT } from "@/lib/i18n/client";
import type { PublicQuestion } from "./types";
import styles from "./forms.module.css";

interface Props {
  q: PublicQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}

/** One input per question kind. Answers are raw column input (what the column's validate() accepts). */
export function QuestionInput({ q, value, onChange, disabled }: Props) {
  const t = useT();
  const id = `form-input-${q.id}`;
  const aria = q.title;
  switch (q.kind) {
    case "long_text":
      return <TextArea id={id} aria-label={aria} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={q.placeholder} disabled={disabled} rows={4} data-testid={id} />;
    case "date":
      return <input id={id} aria-label={aria} className={styles.nativeInput} type="date" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} disabled={disabled} data-testid={id} />;
    case "checkbox":
      return <Checkbox label={q.placeholder || t("common.yes")} checked={value === true} onChange={(e) => onChange(e.target.checked)} disabled={disabled} data-testid={id} />;
    case "rating":
      return (
        <div className={styles.rating} data-testid={id}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" disabled={disabled} className={Number(value ?? 0) >= n ? styles.starOn : styles.starOff} aria-label={`${n}`} onClick={() => onChange(Number(value) === n ? null : n)}>★</button>
          ))}
        </div>
      );
    case "status":
    case "dropdown":
    case "people": {
      const options = q.options ?? [];
      if (q.multiple) {
        const list = Array.isArray(value) ? (value as number[]) : [];
        return (
          <div className={styles.optionList} data-testid={id}>
            {options.map((o) => (
              <Checkbox key={o.id} label={o.text} disabled={disabled} checked={list.includes(o.id)} onChange={(e) => onChange(e.target.checked ? [...list, o.id] : list.filter((x) => x !== o.id))} />
            ))}
          </div>
        );
      }
      return (
        <select id={id} aria-label={aria} className={styles.nativeInput} value={value === null || value === undefined ? "" : String(value)} disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} data-testid={id}>
          <option value="">{t("forms.public.choose")}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
        </select>
      );
    }
    default: {
      const type = q.kind === "email" ? "email" : q.kind === "phone" ? "tel" : q.kind === "link" ? "url" : "text";
      const ph = q.placeholder || (q.kind === "link" ? "https://" : undefined);
      return <TextField id={id} aria-label={aria} value={String(value ?? "")} onChange={(v: string) => onChange(v)} type={type} placeholder={ph} disabled={disabled} data-testid={id} />;
    }
  }
}
