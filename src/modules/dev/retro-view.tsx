"use client";

import { useEffect, useState } from "react";
import type { ViewProps } from "@/components/views/types";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { RetroData } from "@/server/services/retros";
import { useDevData } from "./use-dev";
import styles from "./dev.module.css";

const KINDS = [{ kind: "Keep", color: "#00c875" }, { kind: "Improve", color: "#fdab3d" }, { kind: "Discussion", color: "#579bfc" }] as const;

/** Keep / Improve / Discussion cards per sprint, with voting. */
export function RetroView({ board, canEdit }: ViewProps) {
  const t = useT();
  const { data, error, reload } = useDevData<RetroData>(`/api/v1/dev/boards/${board.board.id}/retro`, board.board.id);
  const [sprintId, setSprintId] = useState<string>("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!data || sprintId) return;
    const withCards = [...data.sprints].reverse().find((s) => data.cards.some((c) => c.sprint === s.name));
    const pick = withCards ?? [...data.sprints].reverse().find((s) => s.state === "completed") ?? data.sprints[data.sprints.length - 1];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pick) setSprintId(pick.id);
  }, [data, sprintId]);

  if (!data) return <div className={styles.page}>{error ?? t("common.loading")}</div>;
  const sprint = data.sprints.find((s) => s.id === sprintId);
  const cards = data.cards.filter((c) => (sprint ? c.sprint === sprint.name : true));
  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try { await fn(); } catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
    await reload();
  };

  return (
    <div className={styles.page} data-testid="retro-view">
      <div className={styles.toolbar}>
        <select className={styles.select} value={sprintId} onChange={(e) => setSprintId(e.target.value)} data-testid="retro-sprint" aria-label={t("dev.chooseSprint")}>
          {data.sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className={styles.muted}>{t("dev.retro.hint")}</span>
      </div>
      {actionError ? <div className={styles.error} role="alert">{actionError}</div> : null}
      <div className={styles.retroCols}>
        {KINDS.map(({ kind, color }) => (
          <div key={kind} className={styles.retroCol} data-testid={`retro-column-${kind.toLowerCase()}`}>
            <div className={styles.retroColHead}><span style={{ width: 10, height: 10, borderRadius: 5, background: color }} />{t(`dev.retro.${kind.toLowerCase()}`)}<span className={styles.muted}>{cards.filter((c) => c.kind === kind).length}</span></div>
            {cards.filter((c) => c.kind === kind).sort((a, b) => b.votes - a.votes).map((c) => (
              <div key={c.id} className={styles.retroCard} data-testid="retro-card" data-votes={c.votes}>
                <div className={styles.retroText}>{c.text}{c.authorName ? <div className={styles.retroAuthor}>{c.authorName}</div> : null}</div>
                <button type="button" className={`${styles.vote} ${c.voted ? styles.voted : ""}`} onClick={() => void run(() => api.post(`/api/v1/dev/items/${c.id}/vote`))} aria-pressed={c.voted} data-testid="retro-vote">+1 <span data-testid="retro-votes">{c.votes}</span></button>
              </div>
            ))}
            {canEdit && sprint ? (
              <form style={{ display: "flex", gap: 6 }} onSubmit={(e) => {
                e.preventDefault();
                const text = (drafts[kind] ?? "").trim();
                if (!text) return;
                setDrafts({ ...drafts, [kind]: "" });
                void run(() => api.post(`/api/v1/dev/boards/${board.board.id}/retro`, { kind, text, sprintId }));
              }}>
                <input className={styles.input} style={{ flex: 1 }} value={drafts[kind] ?? ""} onChange={(e) => setDrafts({ ...drafts, [kind]: e.target.value })} placeholder={t("dev.retro.add")} data-testid={`retro-add-input-${kind.toLowerCase()}`} aria-label={t("dev.retro.add")} />
                <button type="submit" className={styles.btn} data-testid={`retro-add-${kind.toLowerCase()}`}>{t("common.add")}</button>
              </form>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
