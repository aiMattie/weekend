"use client";

import { Button, TextField } from "@vibe/core";
import { useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { AccountInfo } from "@/server/services/account";
import { Card, Field, PageHead, useAction } from "./ui";
import styles from "./admin.module.css";

const ZONES = ["Europe/Amsterdam", "Europe/Brussels", "Europe/London", "Europe/Berlin", "Europe/Paris", "UTC", "America/New_York", "America/Los_Angeles", "Asia/Singapore", "Australia/Sydney"];

export function AccountPage({ info }: { info: AccountInfo }) {
  const t = useT();
  const { run, error, busy } = useAction();
  const [name, setName] = useState(info.name);
  const [locale, setLocale] = useState(info.general.defaultLocale);
  const [tz, setTz] = useState(info.general.timeZone);
  const [week, setWeek] = useState(info.general.weekStart);
  const [saved, setSaved] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const save = async () => { if (await run(() => api.patch("/api/v1/admin/account", { name, defaultLocale: locale, timeZone: tz, weekStart: week }))) { setSaved(true); setTimeout(() => setSaved(false), 2000); } };
  const upload = async (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    await run(async () => { const r = await fetch("/api/v1/account/logo", { method: "PUT", body: fd }); if (!r.ok) throw new Error((await r.json()).error?.message ?? "Upload mislukt"); });
  };
  return (
    <>
      <PageHead title={t("admin.account.title")} sub={t("admin.account.sub")} />
      <Card title={t("admin.account.general")} testId="account-general">
        <Field label={t("admin.account.name")}><TextField value={name} onChange={setName} size="medium" data-testid="account-name" /></Field>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t("admin.account.logo")}</span>
          <div className={styles.fieldRow}>
            {info.general.logoUrl ? <img src={info.general.logoUrl} alt="Logo" width={64} height={64} style={{ objectFit: "contain", border: "1px solid var(--app-border-soft)", borderRadius: 8 }} data-testid="account-logo" /> : <span className={styles.muted}>{t("admin.account.noLogo")}</span>}
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} data-testid="account-logo-input" />
            <Button size="small" kind="secondary" onClick={() => file.current?.click()}>{t("admin.account.upload")}</Button>
            {info.general.logoUrl && <Button size="small" kind="tertiary" color="negative" onClick={() => run(() => api.del("/api/v1/account/logo"))}>{t("common.delete")}</Button>}
          </div>
        </div>
        <div className={styles.fieldRow}>
          <Field label={t("admin.account.language")}>
            <select className={styles.select} value={locale} onChange={(e) => setLocale(e.target.value as "nl" | "en")} data-testid="account-locale"><option value="nl">Nederlands</option><option value="en">English</option></select>
          </Field>
          <Field label={t("admin.account.timezone")}>
            <select className={styles.select} value={tz} onChange={(e) => setTz(e.target.value)} data-testid="account-tz">{[...new Set([tz, ...ZONES])].map((z) => <option key={z} value={z}>{z}</option>)}</select>
          </Field>
          <Field label={t("admin.account.weekStart")}>
            <select className={styles.select} value={week} onChange={(e) => setWeek(e.target.value as "monday")} data-testid="account-week"><option value="monday">{t("admin.account.monday")}</option><option value="sunday">{t("admin.account.sunday")}</option><option value="saturday">{t("admin.account.saturday")}</option></select>
          </Field>
        </div>
        <div className={styles.error} role="alert">{error}</div>
        <div className={styles.fieldRow}><Button onClick={save} loading={busy} data-testid="account-save">{t("common.save")}</Button>{saved && <span className={styles.ok} data-testid="account-saved">{t("admin.saved")}</span>}</div>
      </Card>
    </>
  );
}
