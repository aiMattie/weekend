"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/shell/user-context";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { DevOverview } from "@/server/services/sprint-read";
import { fmtDate } from "./ui";
import styles from "./dev.module.css";

/** /dev: the team's sprint boards with the active sprint, quick links and the Git-koppeling settings. */
export function DevHub() {
  const t = useT();
  const me = useCurrentUser();
  const [data, setData] = useState<DevOverview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api.get<DevOverview[]>("/api/v1/dev/overview").then(setData).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);

  const create = async (demo: boolean) => {
    try { await api.post("/api/v1/dev/template", { demo }); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className={styles.page} data-testid="dev-hub">
      <h1 className={styles.h1}>{t("dev.hub.title")}</h1>
      <p className={styles.muted}>{t("dev.hub.sub")}</p>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      <div className={styles.toolbar}>
        <Link href="/dev/git" className={styles.btn} data-testid="hub-git-settings">{t("dev.hub.git")}</Link>
        {me.role === "admin" ? <button type="button" className={styles.btn} onClick={() => void create(false)} data-testid="hub-create-workspace">{t("dev.hub.create")}</button> : null}
      </div>
      {data?.length === 0 ? <div className={styles.empty} data-testid="hub-empty">{t("dev.hub.empty")}</div> : null}
      <div className={styles.hubCards}>
        {data?.map((b) => (
          <div key={b.id} className={styles.hubCard} data-testid="hub-card">
            <div className={styles.h2}>{b.name}</div>
            {b.activeSprint ? (
              <div>
                <strong>{b.activeSprint.name}</strong> <span className={styles.muted}>{fmtDate(b.activeSprint.startsOn)} - {fmtDate(b.activeSprint.endsOn)}</span>
                <div className={styles.muted}>{t("dev.doneOf", { done: b.activeSprint.counts.doneCount, total: b.activeSprint.counts.count })}</div>
              </div>
            ) : <div className={styles.muted}>{t("dev.noActiveSprint")}</div>}
            <div className={styles.muted}>{t("dev.hub.stats", { planned: b.plannedCount, backlog: b.backlogCount })}</div>
            <div className={styles.toolbar} style={{ marginBottom: 0 }}>
              <Link className={styles.btn} href={`/boards/${b.boards.sprints}`}>{t("dev.hub.sprints")}</Link>
              {b.boards.tasks ? <Link className={styles.btn} href={`/boards/${b.boards.tasks}`}>{t("dev.hub.tasks")}</Link> : null}
              {b.boards.epics ? <Link className={styles.btn} href={`/boards/${b.boards.epics}`}>Epics</Link> : null}
              {b.boards.bugs ? <Link className={styles.btn} href={`/boards/${b.boards.bugs}`}>Bugs</Link> : null}
              {b.boards.retros ? <Link className={styles.btn} href={`/boards/${b.boards.retros}`}>Retrospectives</Link> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
