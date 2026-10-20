"use client";

import { Button, TextField, Toggle } from "@vibe/core";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { SecuritySettings } from "@/server/services/security";
import { Card, Chip, CopyButton, Field, PageHead, fmtDate, useAction } from "./ui";
import styles from "./admin.module.css";

type Sso = { enabled: boolean; entityId: string; ssoUrl: string; certificate: string; domains: string[]; connected: false; sp: { entityId: string; acsUrl: string; metadataUrl: string } };

export function SecurityPage({ settings, sso, panic, origin }: { settings: SecuritySettings; sso: Sso; panic: { locked: boolean; lockedAt: string | null }; origin: string }) {
  const t = useT();
  const { run, error, busy } = useAction();
  const [policy, setPolicy] = useState(settings.passwordPolicy);
  const [timeout, setTimeoutDays] = useState(String(settings.sessionTimeoutDays));
  const [maxFailed, setMaxFailed] = useState(String(settings.maxFailedLogins));
  const [retention, setRetention] = useState(String(settings.retentionDays));
  const [ips, setIps] = useState(settings.ipAllowlist.join("\n"));
  const [saved, setSaved] = useState("");
  const [panicCode, setPanicCode] = useState<string | null>(null);
  const [scimToken, setScimToken] = useState<string | null>(null);
  const flash = (k: string) => { setSaved(k); setTimeout(() => setSaved(""), 2000); };
  const patch = async (body: object, key: string) => { if (await run(() => api.patch("/api/v1/admin/security", body))) flash(key); };

  return (
    <>
      <PageHead title={t("admin.security.title")} sub={t("admin.security.sub")} />
      {error && <div className={styles.error} role="alert" data-testid="admin-error">{error}</div>}
      {panic.locked && (
        <div className={`${styles.banner} ${styles.bannerDanger}`} data-testid="panic-banner">
          <div className={styles.grow}><strong>{t("admin.panic.locked")}</strong><div>{t("admin.panic.lockedText", { when: fmtDate(panic.lockedAt) })}</div></div>
          <Button color="positive" onClick={() => run(() => api.post("/api/v1/admin/security/unlock"))} loading={busy} data-testid="panic-unlock">{t("admin.panic.unlock")}</Button>
        </div>
      )}
      {panicCode && (
        <div className={`${styles.banner} ${styles.bannerWarn}`} data-testid="panic-code-banner">
          <div className={styles.grow}><strong>{t("admin.panic.codeTitle")}</strong><div>{t("admin.panic.codeText")}</div><div className={`${styles.mono} ${styles.secret}`} data-testid="panic-code">{panicCode}</div></div>
          <CopyButton text={panicCode} label={t("admin.copy")} />
        </div>
      )}

      <Card title={t("admin.security.auth")} testId="security-auth">
        <div className={styles.fieldRow}>
          <Toggle isSelected={settings.twoFactorRequired} onChange={(v: boolean) => patch({ twoFactorRequired: v }, "2fa")} aria-label={t("admin.security.require2fa")} data-testid="require-2fa" />
          <span>{t("admin.security.require2fa")}</span>{saved === "2fa" && <span className={styles.ok}>{t("admin.saved")}</span>}
        </div>
        <p className={styles.hint}>{t("admin.security.require2faHint")}</p>
        <div className={styles.fieldRow}>
          <Field label={t("admin.security.sessionDays")}><TextField value={timeout} onChange={setTimeoutDays} size="small" type="number" data-testid="session-days" /></Field>
          <Field label={t("admin.security.maxFailed")}><TextField value={maxFailed} onChange={setMaxFailed} size="small" type="number" data-testid="max-failed" /></Field>
          <Button size="small" kind="secondary" onClick={() => patch({ sessionTimeoutDays: Number(timeout), maxFailedLogins: Number(maxFailed) }, "sess")} data-testid="session-save">{t("common.save")}</Button>
          {saved === "sess" && <span className={styles.ok}>{t("admin.saved")}</span>}
        </div>
      </Card>

      <Card title={t("admin.security.passwordPolicy")} testId="security-password">
        <div className={styles.fieldRow}>
          <Field label={t("admin.security.minLength")}><TextField value={String(policy.minLength)} onChange={(v: string) => setPolicy({ ...policy, minLength: Number(v) || 8 })} type="number" size="small" data-testid="policy-min" /></Field>
          <Field label={t("admin.security.maxAge")}><TextField value={policy.maxAgeDays ? String(policy.maxAgeDays) : ""} onChange={(v: string) => setPolicy({ ...policy, maxAgeDays: v ? Number(v) : null })} type="number" size="small" placeholder="-" /></Field>
        </div>
        {([["requireUpper", "admin.security.upper"], ["requireNumber", "admin.security.number"], ["requireSymbol", "admin.security.symbol"]] as const).map(([k, label]) => (
          <div className={styles.fieldRow} key={k}><Toggle isSelected={policy[k]} onChange={(v: boolean) => setPolicy({ ...policy, [k]: v })} aria-label={t(label)} data-testid={`policy-${k}`} /><span>{t(label)}</span></div>
        ))}
        <Button size="small" onClick={() => patch({ passwordPolicy: policy }, "pw")} data-testid="policy-save">{t("common.save")}</Button> {saved === "pw" && <span className={styles.ok}>{t("admin.saved")}</span>}
      </Card>

      <Card title={t("admin.security.ip")} testId="security-ip">
        <p className={styles.hint}>{t("admin.security.ipHint")}</p>
        <textarea className={`${styles.textarea} ${styles.mono}`} value={ips} onChange={(e) => setIps(e.target.value)} placeholder={"203.0.113.0/24\n198.51.100.7"} data-testid="ip-list" />
        <div className={styles.fieldRow} style={{ marginTop: 8 }}>
          <Button size="small" onClick={() => patch({ ipAllowlist: ips.split(/[\s,;]+/).filter(Boolean) }, "ip")} data-testid="ip-save">{t("common.save")}</Button>
          {saved === "ip" && <span className={styles.ok}>{t("admin.saved")}</span>}
          <span className={styles.muted}>{settings.ipAllowlist.length ? t("admin.security.ipOn", { n: settings.ipAllowlist.length }) : t("admin.security.ipOff")}</span>
        </div>
      </Card>

      <Card title={t("admin.security.retention")}>
        <div className={styles.fieldRow}>
          <Field label={t("admin.security.retentionDays")}><TextField value={retention} onChange={setRetention} type="number" size="small" data-testid="retention-days" /></Field>
          <Button size="small" kind="secondary" onClick={() => patch({ retentionDays: Number(retention) }, "ret")}>{t("common.save")}</Button>{saved === "ret" && <span className={styles.ok}>{t("admin.saved")}</span>}
        </div>
      </Card>

      <SsoCard sso={sso} />

      <Card title="SCIM" testId="security-scim" actions={settings.scimConfigured ? <Chip tone="green">{t("admin.scim.active", { prefix: settings.scimPrefix ?? "" })}</Chip> : <Chip>{t("admin.scim.inactive")}</Chip>}>
        <p className={styles.hint}>{t("admin.scim.hint")}</p>
        <div className={styles.fieldRow}><span>{t("admin.scim.endpoint")}</span><code className={styles.mono} data-testid="scim-endpoint">{origin}/api/scim/v2</code></div>
        {scimToken && <div className={`${styles.mono} ${styles.secret}`} data-testid="scim-token">{scimToken}</div>}
        <div className={styles.fieldRow}>
          <Button size="small" onClick={async () => { const r = await run(() => api.post<{ token: string }>("/api/v1/admin/security/scim-token")); if (r) setScimToken(r.token); }} data-testid="scim-create">{settings.scimConfigured ? t("admin.scim.rotate") : t("admin.scim.create")}</Button>
          {settings.scimConfigured && <Button size="small" kind="tertiary" color="negative" onClick={() => { setScimToken(null); run(() => api.del("/api/v1/admin/security/scim-token")); }}>{t("admin.scim.revoke")}</Button>}
          {scimToken && <span className={styles.muted}>{t("admin.scim.once")}</span>}
        </div>
      </Card>

      <Card title={t("admin.panic.title")} testId="security-panic">
        <p className={styles.hint}>{t("admin.panic.hint")}</p>
        <Button color="negative" disabled={panic.locked || busy} onClick={async () => { if (!confirm(t("admin.panic.confirm"))) return; const r = await run(() => api.post<{ recoveryCode: string }>("/api/v1/admin/security/panic")); if (r) setPanicCode(r.recoveryCode); }} data-testid="panic-button">{t("admin.panic.button")}</Button>
      </Card>
    </>
  );
}

function SsoCard({ sso }: { sso: Sso }) {
  const t = useT();
  const { run, error } = useAction();
  const [entityId, setEntityId] = useState(sso.entityId);
  const [url, setUrl] = useState(sso.ssoUrl);
  const [cert, setCert] = useState(sso.certificate);
  const [domains, setDomains] = useState(sso.domains.join(", "));
  const [enabled, setEnabled] = useState(sso.enabled);
  const [saved, setSaved] = useState(false);
  const save = async () => { if (await run(() => api.put("/api/v1/admin/security/sso", { enabled, entityId, ssoUrl: url, certificate: cert, domains: domains.split(/[\s,;]+/).filter(Boolean) }))) { setSaved(true); setTimeout(() => setSaved(false), 2000); } };
  return (
    <Card title="SAML (nog niet beschikbaar)" testId="security-sso" actions={<Chip tone="orange"><span data-testid="sso-state">{t("admin.sso.notConnected")}</span></Chip>}>
      <p className={styles.hint}>{t("admin.sso.hint")}</p>
      <div className={styles.split}>
        <div>
          <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>{t("admin.sso.sp")}</h3>
          <Field label="Entity ID"><code className={styles.mono}>{sso.sp.entityId}</code></Field>
          <Field label="ACS URL"><code className={styles.mono}>{sso.sp.acsUrl}</code></Field>
          <a href={sso.sp.metadataUrl} target="_blank" rel="noreferrer" className={styles.muted}>{t("admin.sso.metadata")}</a>
        </div>
        <div>
          <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>{t("admin.sso.idp")}</h3>
          <Field label="IdP Entity ID"><TextField value={entityId} onChange={setEntityId} size="small" data-testid="sso-entity" /></Field>
          <Field label="IdP SSO URL"><TextField value={url} onChange={setUrl} size="small" placeholder="https://" data-testid="sso-url" /></Field>
          <Field label={t("admin.sso.cert")}><textarea className={`${styles.textarea} ${styles.mono}`} value={cert} onChange={(e) => setCert(e.target.value)} data-testid="sso-cert" /></Field>
          <Field label={t("admin.sso.domains")}><TextField value={domains} onChange={setDomains} size="small" placeholder="example.com" /></Field>
          <div className={styles.fieldRow}><Toggle isSelected={enabled} onChange={setEnabled} aria-label={t("admin.sso.enable")} /><span>{t("admin.sso.enable")}</span></div>
        </div>
      </div>
      <div className={styles.error} role="alert">{error}</div>
      <div className={styles.fieldRow}><Button size="small" onClick={save} data-testid="sso-save">{t("common.save")}</Button><Button size="small" kind="secondary" disabled>{t("admin.sso.test")}</Button>{saved && <span className={styles.ok}>{t("admin.saved")}</span>}</div>
    </Card>
  );
}
