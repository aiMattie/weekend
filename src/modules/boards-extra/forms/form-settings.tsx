"use client";

import { Button, TextArea, TextField, Toggle } from "@vibe/core";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import styles from "./forms.module.css";
import type { FormDto } from "./types";

type SettingsPatch = Record<string, unknown>;
interface Props { form: FormDto; canEdit: boolean; tab: "design" | "settings"; onChange: (patch: SettingsPatch, debounce?: boolean) => void }

function ColorField({ label, value, onChange, testId }: { label: string; value: string; onChange: (v: string) => void; testId: string }) {
  return (
    <label className={styles.fieldLabel}>{label}
      <span className={styles.colorRow}><input type="color" className={styles.colorInput} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} aria-label={label} /><code>{value}</code></span>
    </label>
  );
}

export function FormSettingsPanel({ form, canEdit, tab, onChange }: Props) {
  const t = useT();
  const s = form.settings;
  const [pw, setPw] = useState("");
  const ty = s.thankYou ?? {};
  if (tab === "design") {
    return (
      <div className={styles.settingsBody} data-testid="form-design">
        <label className={styles.fieldLabel}>{t("forms.description")}
          <TextArea value={s.description ?? ""} onChange={(e) => onChange({ description: e.target.value }, true)} disabled={!canEdit} rows={3} data-testid="f-description" />
        </label>
        <label className={styles.fieldLabel}>{t("forms.cover")}
          <TextField value={s.coverUrl ?? ""} onChange={(v: string) => onChange({ coverUrl: v }, true)} disabled={!canEdit} placeholder="https://..." data-testid="f-cover" />
        </label>
        <label className={styles.fieldLabel}>{t("forms.logo")}
          <TextField value={s.logoUrl ?? ""} onChange={(v: string) => onChange({ logoUrl: v }, true)} disabled={!canEdit} placeholder="https://..." data-testid="f-logo" />
        </label>
        <ColorField label={t("forms.primaryColor")} value={s.primaryColor ?? "#0073ea"} onChange={(v) => onChange({ primaryColor: v }, true)} testId="f-primary" />
        <ColorField label={t("forms.backgroundColor")} value={s.backgroundColor ?? "#f6f7fb"} onChange={(v) => onChange({ backgroundColor: v }, true)} testId="f-background" />
        <label className={styles.fieldLabel}>{t("forms.submitLabel")}
          <TextField value={s.submitLabel ?? ""} onChange={(v: string) => onChange({ submitLabel: v }, true)} disabled={!canEdit} data-testid="f-submit-label" />
        </label>
        <div className={styles.sectionHead}>{t("forms.thankYou")}</div>
        <label className={styles.fieldLabel}>{t("forms.thankTitle")}
          <TextField value={ty.title ?? ""} onChange={(v: string) => onChange({ thankYou: { title: v } }, true)} disabled={!canEdit} data-testid="f-thank-title" />
        </label>
        <label className={styles.fieldLabel}>{t("forms.thankMessage")}
          <TextArea value={ty.message ?? ""} onChange={(e) => onChange({ thankYou: { message: e.target.value } }, true)} disabled={!canEdit} rows={3} data-testid="f-thank-message" />
        </label>
        <label className={styles.fieldLabel}>{t("forms.redirect")}
          <TextField value={ty.redirectUrl ?? ""} onChange={(v: string) => onChange({ thankYou: { redirectUrl: v } }, true)} disabled={!canEdit} placeholder="https://..." data-testid="f-redirect" />
        </label>
      </div>
    );
  }
  return (
    <div className={styles.settingsBody} data-testid="form-settings">
      <div className={styles.sectionHead}>{t("forms.security")}</div>
      <label className={styles.fieldLabel}>{t("forms.password")}
        <TextField value={pw} onChange={setPw} type="password" disabled={!canEdit} placeholder={s.hasPassword ? t("forms.passwordSet") : t("forms.passwordPlaceholder")} data-testid="f-password" />
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <Button size="small" kind="secondary" disabled={!canEdit || !pw} onClick={() => { onChange({ password: pw }); setPw(""); }} data-testid="f-password-save">{t("common.save")}</Button>
        {s.hasPassword && <Button size="small" kind="tertiary" disabled={!canEdit} onClick={() => onChange({ password: null })} data-testid="f-password-clear">{t("forms.passwordClear")}</Button>}
      </div>
      <div className={styles.toggleRow}>{t("forms.requireLogin")}
        <Toggle isSelected={!!s.requireLogin} disabled={!canEdit} onChange={(v: boolean) => onChange({ requireLogin: v })} data-testid="f-require-login" aria-label={t("forms.requireLogin")} />
      </div>
      <div className={styles.toggleRow}>{t("forms.limitOne")}
        <Toggle isSelected={!!s.limitOneResponse} disabled={!canEdit} onChange={(v: boolean) => onChange({ limitOneResponse: v })} data-testid="f-limit-one" aria-label={t("forms.limitOne")} />
      </div>
      <label className={styles.fieldLabel}>{t("forms.tags")}
        <TextField value={(s.tags ?? []).join(", ")} onChange={(v: string) => onChange({ tags: v.split(",").map((x) => x.trim()).filter(Boolean) }, true)} disabled={!canEdit} data-testid="f-tags" />
      </label>
    </div>
  );
}
