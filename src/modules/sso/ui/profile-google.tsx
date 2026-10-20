"use client";

import { Button } from "@vibe/core";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { ProfileGoogle } from "@/server/services/sso-settings";
import type { SsoProvider } from "@/server/sso/oauth";
import { Card, Chip, fmtDate, useAction } from "@/modules/admin/ui/ui";
import styles from "@/modules/admin/ui/admin.module.css";
import { GoogleLogo } from "./google-logo";
import { MicrosoftLogo } from "./microsoft-logo";
import { hardNavigate, ssoStartUrl } from "./nav";

/**
 * Profile > linked Google or Microsoft account with link / unlink. `flash` = ?google=<linked|error code>
 * (or ?microsoft=...) after returning from the provider. Test ids are prefixed with the provider.
 */
export function ProfileGoogleCard({ google, flash, provider = "google" }: { google: ProfileGoogle; flash: string | null; provider?: SsoProvider }) {
  const t = useT();
  const { run, error, busy } = useAction();
  if (!google.available) return null;
  const p = provider;
  /** provider specific strings: Google keeps the original keys, Microsoft has its own under sso.profile.microsoft.* */
  const k = (key: string) => (p === "google" ? `sso.profile.${key}` : `sso.profile.microsoft.${key}`);
  const Logo = p === "google" ? GoogleLogo : MicrosoftLogo;
  return (
    <Card title={t(k("title"))} testId={`profile-${p}`} actions={google.identity ? <Chip tone="green">{t("admin.on")}</Chip> : <Chip>{t("admin.off")}</Chip>}>
      {flash === "linked" && <div className={styles.ok} role="status" data-testid={`${p}-flash`}>{t(k("flashLinked"))}</div>}
      {flash && flash !== "linked" && <div className={styles.error} role="alert" data-testid={`${p}-flash-error`}>{t(`sso.error.${flash}`)}</div>}
      {google.identity ? (
        <>
          <div className={styles.fieldRow}><Logo /><strong data-testid={`${p}-linked-email`}>{t("sso.profile.linked", { email: google.identity.email })}</strong></div>
          <p className={styles.hint}>{t("sso.profile.since", { when: fmtDate(google.identity.createdAt, false) })}</p>
          {google.unlinkBlocked && <p className={styles.hint} data-testid={`${p}-unlink-blocked`}>{google.unlinkBlocked}</p>}
          <Button size="small" kind="secondary" color="negative" disabled={!google.canUnlink || busy} data-testid={`${p}-unlink`}
            onClick={() => { if (confirm(t(k("unlinkConfirm")))) void run(() => api.del(`/api/v1/profile/${p}`)); }}>{t("sso.profile.unlink")}</Button>
        </>
      ) : (
        <>
          <p className={styles.hint}>{t(k("none"))}</p>
          <Button size="small" onClick={() => hardNavigate(ssoStartUrl(p, "link"))} data-testid={`${p}-link`}><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Logo size={14} />{t(k("link"))}</span></Button>
        </>
      )}
      <div className={styles.error} role="alert" data-testid={`${p}-error`}>{error}</div>
    </Card>
  );
}
