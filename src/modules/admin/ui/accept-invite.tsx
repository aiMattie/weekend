"use client";

import { Button, TextField } from "@vibe/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/shell/topbar";
import { api, ApiError } from "@/lib/api-client";
import { I18nProvider, useT } from "@/lib/i18n/client";
import { useIsClient } from "@/lib/use-persistent-state";
import type { InvitationPublic } from "@/server/services/members";
import styles from "./admin.module.css";

function Form({ token, invitation, rules }: { token: string; invitation: InvitationPublic | null; rules: string }) {
  const t = useT();
  const router = useRouter();
  const ready = useIsClient();
  const [name, setName] = useState(invitation?.name ?? "");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = invitation?.state === "pending";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) return setError(t("admin.invite.mismatch"));
    setBusy(true);
    setError("");
    try {
      await api.post("/api/auth/accept-invite", { token, name: name || undefined, password: pw });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("admin.invite.failed"));
      setBusy(false);
    }
  };
  return (
    <div className={styles.centerPage}>
      <form className={styles.centerCard} onSubmit={submit} data-testid="accept-invite">
        <Logo />
        {!valid ? (
          <>
            <h1 className={styles.pageTitle} style={{ fontSize: 22 }}>{t("admin.invite.invalidTitle")}</h1>
            <p className={styles.pageSub} data-testid="invite-invalid">{invitation?.state === "accepted" ? t("admin.invite.used") : t("admin.invite.invalid")}</p>
          </>
        ) : (
          <>
            <h1 className={styles.pageTitle} style={{ fontSize: 22 }}>{t("admin.invite.title", { account: invitation.accountName })}</h1>
            <p className={styles.pageSub}>{invitation.email}</p>
            <label className={styles.field}><span className={styles.fieldLabel}>{t("admin.users.name")}</span><TextField value={name} onChange={setName} size="large" data-testid="invite-name-input" /></label>
            <label className={styles.field}><span className={styles.fieldLabel}>{t("admin.invite.password")}</span><TextField value={pw} onChange={setPw} type="password" size="large" data-testid="invite-password" /></label>
            <label className={styles.field}><span className={styles.fieldLabel}>{t("admin.invite.repeat")}</span><TextField value={pw2} onChange={setPw2} type="password" size="large" data-testid="invite-password2" /></label>
            {rules && <p className={styles.hint}>{t("admin.profile.policy", { rules })}</p>}
            <div className={styles.error} role="alert" data-testid="invite-error">{error}</div>
            <Button type="submit" size="large" loading={busy} disabled={!ready || !pw} data-testid="invite-submit">{t("admin.invite.submit")}</Button>
          </>
        )}
      </form>
    </div>
  );
}

export function AcceptInvite(props: { token: string; invitation: InvitationPublic | null; rules: string }) {
  return <I18nProvider locale="nl"><Form {...props} /></I18nProvider>;
}
