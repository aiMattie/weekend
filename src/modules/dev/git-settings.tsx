"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/shell/user-context";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { Integration } from "@/server/services/dev-git";
import styles from "./dev.module.css";

type Created = Integration & { secret: string };

/** Settings > Git-koppeling: create the webhook secret for GitHub / Bitbucket and show the payload URL. */
export function GitSettings() {
  const t = useT();
  const me = useCurrentUser();
  const [list, setList] = useState<Integration[] | null>(null);
  const [fresh, setFresh] = useState<Created | null>(null);
  const [error, setError] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const load = () => api.get<Integration[]>("/api/v1/dev/git/integrations").then(setList).catch((e: Error) => setError(e.message));
  useEffect(() => { if (me.role === "admin") void load(); }, [me.role]);

  if (me.role !== "admin") return <div className={styles.page}><div className={styles.empty}>{t("dev.git.adminOnly")}</div></div>;

  const create = async (provider: "github" | "bitbucket") => {
    try { setFresh(await api.post<Created>("/api/v1/dev/git/integrations", { provider })); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className={styles.page} data-testid="git-settings">
      <h1 className={styles.h1}>{t("dev.git.title")}</h1>
      <p className={styles.muted}>{t("dev.git.intro")}</p>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      <div className={styles.toolbar}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void create("github")} data-testid="git-create-github">{t("dev.git.createGithub")}</button>
        <button type="button" className={styles.btn} onClick={() => void create("bitbucket")} data-testid="git-create-bitbucket">{t("dev.git.createBitbucket")}</button>
      </div>
      {fresh ? (
        <div className={styles.secretBox} data-testid="git-secret-box">
          <strong>{t("dev.git.secretOnce")}</strong>
          <div>{t("dev.git.secret")}: <span className={styles.mono} data-testid="git-secret">{fresh.secret}</span></div>
          <div>{t("dev.git.url")}: <span className={styles.mono}>{origin}{fresh.webhookPath}</span></div>
        </div>
      ) : null}
      <div className={styles.hubCards}>
        {list?.map((i) => (
          <div key={i.id} className={styles.hubCard} data-testid="git-integration" data-provider={i.provider}>
            <div className={styles.h2}>{i.name}</div>
            <div>{t("dev.git.url")}: <span className={styles.mono}>{origin}{i.webhookPath}</span></div>
            <div className={styles.muted}>{t("dev.git.secret")}: {i.secretPreview} · {i.lastEventAt ? t("dev.git.lastEvent", { at: i.lastEventAt.slice(0, 16).replace("T", " ") }) : t("dev.git.noEvents")}</div>
            <div className={styles.toolbar} style={{ marginBottom: 0 }}>
              <button type="button" className={styles.btn} onClick={() => void api.post<Created>(`/api/v1/dev/git/integrations/${i.id}/rotate`).then((c) => { setFresh(c); return load(); })} data-testid="git-rotate">{t("dev.git.rotate")}</button>
              <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => void api.del(`/api/v1/dev/git/integrations/${i.id}`).then(load)} data-testid="git-delete">{t("common.delete")}</button>
            </div>
          </div>
        ))}
      </div>
      <h2 className={styles.h2} style={{ marginTop: 24 }}>{t("dev.git.howTitle")}</h2>
      <ol className={styles.muted}>
        <li>{t("dev.git.how1")}</li>
        <li>{t("dev.git.how2")}</li>
        <li>{t("dev.git.how3")}</li>
      </ol>
    </div>
  );
}
