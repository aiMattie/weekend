"use client";

import { Button, TextField, Toggle } from "@vibe/core";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { AdminSsoView } from "@/server/services/sso-settings";
import { Card, Chip, CopyButton, Field, PageHead, fmtDate, relTime, useAction } from "@/modules/admin/ui/ui";
import styles from "@/modules/admin/ui/admin.module.css";
import { GoogleLogo } from "./google-logo";
import { MicrosoftLogo } from "./microsoft-logo";
import { googleStartUrl, hardNavigate, ssoStartUrl } from "./nav";

export type SsoTest = ({ ok: true; match: string; email: string } | { ok: false; code: string }) & { provider?: "google" | "microsoft" } | null;

/** Admin center > Single sign-on: Google and Microsoft (OAuth 2.0 / OpenID Connect) with one shared policy. */
export function SsoPage({ view, test }: { view: AdminSsoView; test: SsoTest }) {
  const t = useT();
  const { run, error, busy } = useAction();
  const [domains, setDomains] = useState(view.settings.allowedDomains.join(", "));
  const [saved, setSaved] = useState("");
  const flash = (k: string) => { setSaved(k); setTimeout(() => setSaved(""), 2000); };
  const patch = async (body: object, key: string) => { if (await run(() => api.put("/api/v1/admin/sso", body))) flash(key); };
  const status = !view.configured ? "none" : view.settings.enabled ? "ok" : "off";
  const ms = view.microsoft;
  const msStatus = !ms.configured ? "none" : ms.enabled ? "ok" : "off";
  const statusText = (st: string) => (st === "ok" ? t("sso.admin.statusOk") : st === "off" ? t("sso.admin.statusOff") : t("sso.admin.statusNone"));

  return (
    <>
      <PageHead title={t("sso.admin.title")} sub={t("sso.admin.sub")} />
      {error && <div className={styles.error} role="alert" data-testid="admin-error">{error}</div>}
      {test && (
        <div className={`${styles.banner} ${test.ok ? styles.bannerInfo : styles.bannerDanger}`} role="status" data-testid="sso-test-result" data-ok={test.ok}>
          {test.provider === "microsoft" ? "Microsoft: " : ""}
          {test.ok
            ? t("sso.admin.testOk", { email: test.email, match: t(`sso.admin.testMatch.${test.match}`) })
            : t("sso.admin.testFailed", { message: t(`sso.error.${test.code}`) })}
        </div>
      )}

      <Card title={t("sso.admin.google")} testId="sso-status-card" actions={
        <Chip tone={status === "ok" ? "green" : "orange"}><span data-testid="sso-status">{statusText(status)}</span></Chip>
      }>
        <div className={styles.fieldRow}><GoogleLogo /><span>{t("sso.admin.googleSub")}</span></div>
        {!view.configured && <p className={styles.hint} data-testid="sso-not-configured">{t("sso.admin.notConfiguredHint")}</p>}
        <div className={styles.fieldRow}>
          <Button kind="secondary" disabled={!view.active} onClick={() => hardNavigate(googleStartUrl("test"))} data-testid="sso-test">{t("sso.admin.test")}</Button>
          <span className={styles.muted}>{t("sso.admin.testHint")}</span>
        </div>
      </Card>

      <Card title={t("sso.admin.redirect")} testId="sso-redirect">
        <p className={styles.hint}>{t("sso.admin.redirectHint")}</p>
        {view.redirectUris.map((r) => (
          <div className={styles.fieldRow} key={r.uri}>
            <span style={{ minWidth: 130 }}>{t("sso.admin.redirectCurrent")}</span>
            <code className={styles.mono} data-testid={`sso-redirect-${r.label}`}>{r.uri}</code>
            <CopyButton text={r.uri} label={t("admin.copy")} />
          </div>
        ))}
      </Card>

      <Card title={t("sso.admin.env")} testId="sso-env">
        <p className={styles.hint}>{t("sso.admin.envHint")}</p>
        <table className={styles.table}>
          <tbody>
            {view.env.map((e) => (
              <tr key={e.name} data-testid={`sso-env-${e.name}`} data-present={e.present}>
                <td><code className={styles.mono}>{e.name}</code></td>
                <td>{e.present ? <Chip tone="green">{t("sso.admin.present")}</Chip> : <Chip tone={e.required ? "red" : undefined}>{t("sso.admin.missing")}{e.required ? "" : ` (${t("sso.admin.optional")})`}</Chip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title={t("sso.admin.microsoft")} testId="sso-ms-card" actions={
        <Chip tone={msStatus === "ok" ? "green" : "orange"}><span data-testid="sso-ms-status">{statusText(msStatus)}</span></Chip>
      }>
        <div className={styles.fieldRow}><MicrosoftLogo /><span>{t("sso.admin.msSub")}</span></div>
        {!ms.configured && <p className={styles.hint} data-testid="sso-ms-not-configured">{t("sso.admin.msNotConfiguredHint")}</p>}
        <div className={styles.fieldRow}>
          <Toggle isSelected={ms.enabled} onChange={(v: boolean) => patch({ microsoftEnabled: v }, "msEnabled")} aria-label={t("sso.admin.msEnabled")} data-testid="sso-ms-enabled" />
          <span>{t("sso.admin.msEnabled")}</span>{saved === "msEnabled" && <span className={styles.ok}>{t("admin.saved")}</span>}
        </div>
        <p className={styles.hint} data-testid="sso-ms-tenant">{t(ms.singleTenant ? "sso.admin.msTenantSingle" : "sso.admin.msTenantMulti", { tenant: ms.tenant })}</p>
        <div className={styles.fieldRow}>
          <Button kind="secondary" disabled={!ms.active} onClick={() => hardNavigate(ssoStartUrl("microsoft", "test"))} data-testid="sso-ms-test">{t("sso.admin.test")}</Button>
          <span className={styles.muted}>{t("sso.admin.msTestHint")}</span>
        </div>
        <h3 style={{ fontSize: 14, margin: "16px 0 8px" }}>{t("sso.admin.msRedirect")}</h3>
        {ms.redirectUris.map((r) => (
          <div className={styles.fieldRow} key={r.uri}>
            <span style={{ minWidth: 130 }}>{t("sso.admin.redirectCurrent")}</span>
            <code className={styles.mono} data-testid={`sso-ms-redirect-${r.label}`}>{r.uri}</code>
            <CopyButton text={r.uri} label={t("admin.copy")} />
          </div>
        ))}
        <table className={styles.table}>
          <tbody>
            {ms.env.map((e) => (
              <tr key={e.name} data-testid={`sso-env-${e.name}`} data-present={e.present}>
                <td><code className={styles.mono}>{e.name}</code></td>
                <td>{e.present ? <Chip tone="green">{t("sso.admin.present")}</Chip> : <Chip tone={e.required ? "red" : undefined}>{t("sso.admin.missing")}{e.required ? "" : ` (${t("sso.admin.optional")})`}</Chip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 style={{ fontSize: 14, margin: "16px 0 8px" }}>{t("sso.admin.msSteps")}</h3>
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
          {[1, 2, 3, 4, 5].map((n) => <li key={n}>{t(`sso.admin.msStep${n}`)}</li>)}
        </ol>
      </Card>

      <Card title={t("sso.admin.settings")} testId="sso-settings">
        <p className={styles.hint}>{t("sso.admin.settingsShared")}</p>
        <div className={styles.fieldRow}>
          <Toggle isSelected={view.settings.enabled} onChange={(v: boolean) => patch({ enabled: v }, "enabled")} aria-label={t("sso.admin.enabled")} data-testid="sso-enabled" />
          <span>{t("sso.admin.enabled")}</span>{saved === "enabled" && <span className={styles.ok}>{t("admin.saved")}</span>}
        </div>

        <Field label={t("sso.admin.domains")} hint={t("sso.admin.domainsHint")}>
          <TextField value={domains} onChange={setDomains} size="medium" placeholder="example.com, example.org" data-testid="sso-domains" />
        </Field>
        {view.envDomains.length > 0 && <p className={styles.muted} data-testid="sso-env-domains">{t("sso.admin.domainsEnv", { domains: view.envDomains.join(", ") })}</p>}
        <div className={styles.fieldRow}>
          <Button size="small" onClick={() => patch({ allowedDomains: domains.split(/[\s,;]+/).filter(Boolean) }, "domains")} loading={busy} data-testid="sso-domains-save">{t("sso.admin.domainsSave")}</Button>
          {saved === "domains" && <span className={styles.ok} data-testid="sso-saved">{t("admin.saved")}</span>}
        </div>

        <div className={styles.fieldRow} style={{ marginTop: 16 }}>
          <Toggle isSelected={view.settings.autoProvision} onChange={(v: boolean) => patch({ autoProvision: v }, "auto")} aria-label={t("sso.admin.autoProvision")} data-testid="sso-auto" />
          <span>{t("sso.admin.autoProvision")}</span>{saved === "auto" && <span className={styles.ok}>{t("admin.saved")}</span>}
        </div>
        <p className={styles.hint}>{t("sso.admin.autoProvisionHint")}</p>

        <div className={styles.fieldRow} style={{ marginTop: 16 }}>
          <Toggle isSelected={view.settings.enforceSso} onChange={(v: boolean) => patch({ enforceSso: v }, "enforce")} aria-label={t("sso.admin.enforce")} data-testid="sso-enforce" />
          <span>{t("sso.admin.enforce")}</span>{saved === "enforce" && <span className={styles.ok}>{t("admin.saved")}</span>}
        </div>
        <p className={styles.hint}>{t("sso.admin.enforceHint")}</p>
        {!view.currentAdminLinked && <p className={styles.muted} data-testid="sso-enforce-needs-link">{t("sso.admin.enforceNeedsLink")}</p>}
        {view.enforced && <p className={styles.ok} data-testid="sso-enforce-active">{t("sso.admin.enforceActive")}</p>}
        <p className={styles.hint}>{t("sso.admin.recovery")}</p>

        <h3 style={{ fontSize: 14, margin: "16px 0 8px" }}>{t("sso.admin.breakGlass")}</h3>
        {view.admins.length === 0 ? <p className={styles.muted}>{t("sso.admin.breakGlassNone")}</p> : view.admins.map((a) => (
          <label className={styles.fieldRow} key={a.id} data-testid="sso-breakglass-row">
            <input type="checkbox" checked={a.breakGlass} data-testid={`sso-breakglass-${a.email}`}
              onChange={(e) => patch({ breakGlassUserIds: view.admins.filter((x) => (x.id === a.id ? e.target.checked : x.breakGlass)).map((x) => x.id) }, "bg")} />
            <span>{a.name}</span><span className={styles.muted}>{a.email}</span>
          </label>
        ))}
      </Card>

      <Card title={t("sso.admin.identities")} testId="sso-identities">
        {view.identities.length === 0 ? <p className={styles.muted} data-testid="sso-identities-empty">{t("sso.admin.identitiesEmpty")}</p> : (
          <table className={styles.table}>
            <thead><tr><th>{t("sso.admin.colUser")}</th><th>{t("sso.admin.colProvider")}</th><th>{t("sso.admin.colGoogle")}</th><th>{t("sso.admin.colLinked")}</th><th>{t("sso.admin.colLastLogin")}</th><th /></tr></thead>
            <tbody>
              {view.identities.map((i) => (
                <tr key={i.id} data-testid="sso-identity-row" data-user-email={i.userEmail} data-provider={i.provider}>
                  <td>{i.userName}<div className={styles.muted}>{i.userEmail}</div></td>
                  <td data-testid="sso-identity-provider"><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{i.provider === "microsoft" ? <MicrosoftLogo size={14} /> : <GoogleLogo size={14} />}{i.provider === "microsoft" ? "Microsoft" : "Google"}</span></td>
                  <td>{i.email}</td><td>{fmtDate(i.createdAt, false)}</td><td>{relTime(i.lastLoginAt)}</td>
                  <td><Button size="small" kind="tertiary" color="negative" data-testid="sso-unlink"
                    onClick={() => { if (confirm(t("sso.admin.unlinkConfirm"))) void run(() => api.del(`/api/v1/admin/sso/identities/${i.id}`)); }}>{t("sso.admin.unlink")}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title={t("sso.admin.steps")} testId="sso-steps">
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
          {[1, 2, 3, 4, 5].map((n) => <li key={n}>{t(`sso.admin.step${n}`)}</li>)}
        </ol>
      </Card>

      <Card title={t("sso.admin.saml")} testId="sso-saml">
        <p className={styles.hint}>{t("sso.admin.samlHint")}</p>
        <a href="/admin/security#security-sso" data-testid="sso-saml-link">{t("sso.admin.samlOpen")}</a>
      </Card>
    </>
  );
}
