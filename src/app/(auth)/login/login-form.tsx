"use client";

import { Button, TextField } from "@vibe/core";
import { useState } from "react";
import { Logo } from "@/components/shell/topbar";
import { api, ApiError } from "@/lib/api-client";
import { I18nProvider, useT } from "@/lib/i18n/client";
import { useIsClient } from "@/lib/use-persistent-state";
import { GoogleLogo } from "@/modules/sso/ui/google-logo";
import { MicrosoftLogo } from "@/modules/sso/ui/microsoft-logo";
import styles from "./login.module.css";

export interface LoginSso { google: boolean; microsoft: boolean; enforced: boolean; error: string | null }

function Form({ next, sso }: { next: string; sso: LoginSso }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // admin module: second factor step and admin recovery code for a locked account
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [locked, setLocked] = useState(false);
  const [panicCode, setPanicCode] = useState("");
  // sso module: with "only SSO" the password form hides behind the small "Noodtoegang" link (break-glass admins)
  const [breakGlass, setBreakGlass] = useState(false);
  const showPassword = !sso.enforced || breakGlass || !!challenge;
  const ready = useIsClient(); // the button stays disabled until hydrated so no native form submit can leak the password into the URL

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = challenge
        ? { challenge, ...(/^\d{6}$/.test(code.replace(/\s/g, "")) ? { code } : { recoveryCode: code }) }
        : { email, password, ...(panicCode ? { panicCode } : {}) };
      const r = await api.post<{ twoFactor?: boolean; challenge?: string; setup2fa?: boolean }>("/api/auth/login", body);
      if (r.twoFactor && r.challenge) {
        setChallenge(r.challenge);
        setBusy(false);
        return;
      }
      // hard navigation: the client router cache may hold a prefetched "/" that redirected to /login before we had a session
      window.location.assign(r.setup2fa ? "/profile?setup2fa=1" : next);
    } catch (err) {
      if (err instanceof ApiError && err.code === "forbidden" && err.status === 423) { setLocked(true); setError(err.message); }
      else setError(err instanceof ApiError && err.status === 429 ? err.message : challenge ? t("auth.twoFactorFailed") : t("auth.failed"));
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={submit} data-testid="login-form">
        <Logo />
        <h1 className={styles.title}>{t("auth.title")}</h1>
        {sso.error && <div className={styles.ssoError} role="alert" data-testid="login-sso-error" data-code={sso.error}>{t(`sso.error.${sso.error}`)}</div>}
        {(sso.google || sso.microsoft) && !challenge && (
          <>
            {sso.google && (
              <a className={styles.google} href={`/api/auth/google/start${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} data-testid="login-google">
                <GoogleLogo /> {t("sso.login.google")}
              </a>
            )}
            {sso.microsoft && (
              <a className={styles.google} href={`/api/auth/microsoft/start${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} data-testid="login-microsoft">
                <MicrosoftLogo /> {t("sso.login.microsoft")}
              </a>
            )}
            {sso.enforced && !breakGlass && <div className={styles.small} data-testid="login-sso-enforced">{t("sso.login.enforcedHint")}</div>}
            {showPassword && <div className={styles.divider} data-testid="login-or">{t("sso.login.or")}</div>}
          </>
        )}
        {!showPassword ? (
          <div className={styles.small}><button type="button" className={styles.linkButton} onClick={() => setBreakGlass(true)} data-testid="login-breakglass">{t("sso.login.breakGlass")}</button></div>
        ) : challenge ? (
          <label className={styles.field}>
            {t("auth.twoFactorCode")}
            <TextField value={code} onChange={setCode} size="large" autoFocus name="code" placeholder="123456" data-testid="login-2fa-code" />
            <span style={{ fontSize: 12, color: "var(--app-text-secondary)" }}>{t("auth.twoFactorHint")}</span>
          </label>
        ) : (<>
        <label className={styles.field}>
          {t("auth.email")}
          <TextField value={email} onChange={setEmail} type="email" placeholder="naam@example.com" size="large" autoFocus name="email" data-testid="login-email" />
        </label>
        <label className={styles.field}>
          {t("auth.password")}
          <TextField value={password} onChange={setPassword} type="password" size="large" name="password" data-testid="login-password" />
        </label>
        {locked && (
          <label className={styles.field}>
            {t("auth.panicCode")}
            <TextField value={panicCode} onChange={setPanicCode} size="large" name="panicCode" data-testid="login-panic-code" />
          </label>
        )}
        </>)}
        {showPassword && <>
        <div className={styles.error} role="alert" data-testid="login-error">{error}</div>
        <Button type="submit" size="large" loading={busy} disabled={!ready} data-testid="login-submit">{t("auth.submit")}</Button>
        </>}
        {sso.enforced && breakGlass && !challenge && <div className={styles.small}>{t("sso.login.breakGlassHint")} <button type="button" className={styles.linkButton} onClick={() => setBreakGlass(false)} data-testid="login-breakglass-back">{t("sso.login.breakGlassBack")}</button></div>}
      </form>
    </div>
  );
}

export function LoginForm({ next, sso }: { next: string; sso: LoginSso }) {
  return (
    <I18nProvider locale="nl">
      <Form next={next} sso={sso} />
    </I18nProvider>
  );
}
