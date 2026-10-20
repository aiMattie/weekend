"use client";

import { Button, TextField } from "@vibe/core";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { Profile } from "@/server/services/profile";
import type { SessionInfo } from "@/server/services/sessions";
import { Card, Chip, Field, PageHead, Person, fmtDate, useAction } from "./ui";
import { ProfileGoogleCard } from "@/modules/sso/ui/profile-google";
import type { ProfileGoogle } from "@/server/services/sso-settings";
import styles from "./admin.module.css";
import { ClaudeConnectCard, ConnectedAppsCard, type ConnectedAppDto } from "@/modules/oauth/connected-apps";

export function ProfilePage({ profile, sessions, autoSetup2fa, policyHint, google, googleFlash = null, microsoft, microsoftFlash = null, claude }: { profile: Profile; sessions: SessionInfo[]; autoSetup2fa: boolean; policyHint: string; google?: ProfileGoogle; googleFlash?: string | null; microsoft?: ProfileGoogle; microsoftFlash?: string | null; claude?: { baseUrl: string; apps: ConnectedAppDto[]; workspaces: { id: string; name: string }[] } }) {
  return (
    <div style={{ padding: "28px 40px 80px", overflow: "auto", flex: 1 }} data-testid="profile-page">
      <div className={styles.page}>
        <Details profile={profile} />
        <Password hint={policyHint} />
        <TwoFactor profile={profile} autoStart={autoSetup2fa} />
        {google && <ProfileGoogleCard google={google} flash={googleFlash} />}
        {microsoft && <ProfileGoogleCard provider="microsoft" google={microsoft} flash={microsoftFlash} />}
        <Sessions sessions={sessions} />
        {claude && <div id="claude"><ClaudeConnectCard baseUrl={claude.baseUrl} /><ConnectedAppsCard apps={claude.apps} workspaces={claude.workspaces} /></div>}
      </div>
    </div>
  );
}

function Details({ profile }: { profile: Profile }) {
  const t = useT();
  const { run, error, busy } = useAction();
  const [name, setName] = useState(profile.name);
  const [title, setTitle] = useState(profile.title ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [locale, setLocale] = useState(profile.locale);
  const [tz, setTz] = useState(profile.timeZone);
  const [saved, setSaved] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const save = async () => { if (await run(() => api.patch("/api/v1/profile", { name, title: title || null, phone: phone || null, locale, timeZone: tz }))) { setSaved(true); setTimeout(() => setSaved(false), 2000); } };
  const upload = async (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    await run(async () => { const r = await fetch("/api/v1/profile/avatar", { method: "POST", body: fd }); if (!r.ok) throw new Error((await r.json()).error?.message ?? "Upload mislukt"); });
  };
  return (
    <>
      <PageHead title={t("admin.profile.title")} sub={profile.email} />
      <Card title={t("admin.profile.details")} testId="profile-details">
        <div className={styles.fieldRow} style={{ marginBottom: 20 }}>
          <Person id={profile.id} name={profile.name} photoUrl={profile.photoUrl} />
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} data-testid="avatar-input" />
          <Button size="small" kind="secondary" onClick={() => file.current?.click()} data-testid="avatar-upload">{t("admin.profile.avatar")}</Button>
          {profile.photoUrl && <Button size="small" kind="tertiary" color="negative" onClick={() => run(() => api.del("/api/v1/profile/avatar"))}>{t("common.delete")}</Button>}
          <Chip>{t(`admin.role.${profile.role}`)}</Chip>
        </div>
        <div className={styles.split}>
          <Field label={t("admin.users.name")}><TextField value={name} onChange={setName} size="medium" data-testid="profile-name" /></Field>
          <Field label={t("admin.profile.jobTitle")}><TextField value={title} onChange={setTitle} size="medium" data-testid="profile-title" /></Field>
          <Field label={t("admin.profile.phone")}><TextField value={phone} onChange={setPhone} size="medium" data-testid="profile-phone" /></Field>
          <Field label={t("admin.account.language")}>
            <select className={styles.select} value={locale} onChange={(e) => setLocale(e.target.value)} data-testid="profile-locale"><option value="nl">Nederlands</option><option value="en">English</option></select>
          </Field>
          <Field label={t("admin.account.timezone")}><TextField value={tz} onChange={setTz} size="medium" data-testid="profile-tz" /></Field>
        </div>
        <div className={styles.error} role="alert" data-testid="profile-error">{error}</div>
        <div className={styles.fieldRow}>
          <Button onClick={save} loading={busy} data-testid="profile-save">{t("common.save")}</Button>{saved && <span className={styles.ok} data-testid="profile-saved">{t("admin.saved")}</span>}
          <Link href="/inbox"><Button kind="tertiary" data-testid="profile-notifications">{t("admin.profile.notifications")}</Button></Link>
        </div>
      </Card>
    </>
  );
}

function Password({ hint }: { hint: string }) {
  const t = useT();
  const { run, error, busy } = useAction({ refresh: false });
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [done, setDone] = useState(false);
  return (
    <Card title={t("admin.profile.password")} testId="profile-password">
      <div className={styles.split}>
        <Field label={t("admin.profile.currentPassword")}><TextField value={cur} onChange={setCur} type="password" size="medium" data-testid="pw-current" /></Field>
        <Field label={t("admin.profile.newPassword")} hint={hint ? t("admin.profile.policy", { rules: hint }) : undefined}><TextField value={next} onChange={setNext} type="password" size="medium" data-testid="pw-new" /></Field>
      </div>
      <div className={styles.error} role="alert" data-testid="pw-error">{error}</div>
      <div className={styles.fieldRow}>
        <Button onClick={async () => { if (await run(() => api.post("/api/v1/profile/password", { current: cur, next }))) { setDone(true); setCur(""); setNext(""); } }} loading={busy} disabled={!cur || !next} data-testid="pw-save">{t("admin.profile.changePassword")}</Button>
        {done && <span className={styles.ok} data-testid="pw-done">{t("admin.profile.passwordChanged")}</span>}
      </div>
    </Card>
  );
}

function TwoFactor({ profile, autoStart }: { profile: Profile; autoStart: boolean }) {
  const t = useT();
  const { run, error, busy } = useAction();
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pw, setPw] = useState("");
  const begin = async () => { const r = await run(() => api.post<{ secret: string; qrSvg: string }>("/api/v1/profile/2fa/setup")); if (r) setSetup(r); };
  useEffect(() => {
    if (autoStart && !profile.twoFactorEnabled) void api.post<{ secret: string; qrSvg: string }>("/api/v1/profile/2fa/setup").then(setSetup).catch(() => undefined);
  }, [autoStart, profile.twoFactorEnabled]);
  return (
    <Card title={t("admin.profile.twofa")} testId="profile-2fa" actions={profile.twoFactorEnabled ? <Chip tone="green">{t("admin.on")}</Chip> : <Chip>{t("admin.off")}</Chip>}>
      <p className={styles.hint}>{t("admin.profile.twofaHint")}</p>
      <div className={styles.error} role="alert" data-testid="twofa-error">{error}</div>
      {codes && (
        <div data-testid="recovery-codes">
          <strong>{t("admin.profile.recoveryTitle")}</strong>
          <p className={styles.hint}>{t("admin.profile.recoveryHint")}</p>
          <div className={`${styles.codes} ${styles.mono}`}>{codes.map((c) => <span key={c} data-testid="recovery-code">{c}</span>)}</div>
          <Button size="small" kind="secondary" onClick={() => setCodes(null)}>{t("admin.profile.recoverySaved")}</Button>
        </div>
      )}
      {!codes && !profile.twoFactorEnabled && !setup && <Button onClick={begin} loading={busy} data-testid="twofa-start">{t("admin.profile.twofaEnable")}</Button>}
      {!codes && !profile.twoFactorEnabled && setup && (
        <div data-testid="twofa-setup">
          <p>{t("admin.profile.twofaScan")}</p>
          <div className={styles.qr} dangerouslySetInnerHTML={{ __html: setup.qrSvg }} data-testid="twofa-qr" />
          <p className={styles.hint}>{t("admin.profile.twofaManual")}</p>
          <div className={`${styles.mono} ${styles.secret}`} data-testid="twofa-secret">{setup.secret}</div>
          <div className={styles.fieldRow}>
            <TextField value={code} onChange={setCode} placeholder="123456" size="medium" data-testid="twofa-code" />
            <Button onClick={async () => { const r = await run(() => api.post<{ recoveryCodes: string[] }>("/api/v1/profile/2fa/confirm", { code })); if (r) { setCodes(r.recoveryCodes); setSetup(null); setCode(""); } }} loading={busy} disabled={code.replace(/\s/g, "").length < 6} data-testid="twofa-confirm">{t("admin.profile.twofaConfirm")}</Button>
          </div>
        </div>
      )}
      {profile.twoFactorEnabled && !codes && (
        <div>
          <p>{t("admin.profile.recoveryLeft", { n: profile.recoveryCodesLeft })}</p>
          <div className={styles.fieldRow}>
            <Button size="small" kind="secondary" onClick={async () => { const r = await run(() => api.post<{ recoveryCodes: string[] }>("/api/v1/profile/2fa/recovery")); if (r) setCodes(r.recoveryCodes); }} data-testid="twofa-regenerate">{t("admin.profile.recoveryNew")}</Button>
          </div>
          <div className={styles.fieldRow} style={{ marginTop: 12 }}>
            <TextField value={pw} onChange={setPw} type="password" placeholder={t("admin.profile.currentPassword")} size="small" data-testid="twofa-disable-password" />
            <Button size="small" color="negative" kind="secondary" disabled={!pw} onClick={() => run(() => api.post("/api/v1/profile/2fa/disable", { password: pw }))} data-testid="twofa-disable">{t("admin.profile.twofaDisable")}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Sessions({ sessions }: { sessions: SessionInfo[] }) {
  const t = useT();
  const { run, error } = useAction();
  const short = (ua: string | null) => (ua ? ua.replace(/Mozilla\/5\.0 \(([^)]*)\).*?(Chrome|Firefox|Safari|Edg)\/?[\d.]*.*/, "$2 · $1") : "-");
  return (
    <Card title={t("admin.profile.sessions")} testId="profile-sessions" actions={sessions.length > 1 && <Button size="small" kind="secondary" onClick={() => run(() => api.post("/api/v1/profile/sessions/revoke-others"))} data-testid="sessions-revoke-others">{t("admin.profile.signOutOthers")}</Button>}>
      <div className={styles.error} role="alert">{error}</div>
      <table className={styles.table}>
        <thead><tr><th>{t("admin.profile.device")}</th><th>IP</th><th>{t("admin.profile.lastSeen")}</th><th /></tr></thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id} data-testid="session-row" data-current={s.current}>
              <td>{short(s.userAgent)} {s.current && <Chip tone="green">{t("admin.profile.thisDevice")}</Chip>}</td>
              <td className={styles.muted}>{s.ip ?? "-"}</td>
              <td className={styles.muted}>{fmtDate(s.lastSeenAt)}</td>
              <td style={{ textAlign: "right" }}>{!s.current && <Button size="small" kind="tertiary" color="negative" onClick={() => run(() => api.del(`/api/v1/profile/sessions/${s.id}`))} data-testid="session-revoke">{t("admin.profile.signOut")}</Button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
