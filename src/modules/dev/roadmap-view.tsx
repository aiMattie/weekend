"use client";

import { useState } from "react";
import type { ViewProps } from "@/components/views/types";
import { useT } from "@/lib/i18n/client";
import type { EpicRow } from "@/server/services/epics";
import { useDevData } from "./use-dev";
import { Chip, fmtDate, isClosedEpic, ShowAllEpics } from "./ui";
import styles from "./dev.module.css";

/** Epics with their phase (Projecten & Fases), klant and progress based on the linked tasks. */
export function RoadmapView({ board, onOpenItem }: ViewProps) {
  const t = useT();
  const sprintsBoard = (board.board.settings.dev as { sprintsBoardId?: string } | undefined)?.sprintsBoardId;
  const { data, error } = useDevData<{ epics: EpicRow[] }>(`/api/v1/dev/boards/${board.board.id}/roadmap`, board.board.id, () => (sprintsBoard ? [sprintsBoard] : []));
  const [all, setAll] = useState(false);
  if (!data) return <div className={styles.page}>{error ?? t("common.loading")}</div>;
  const epics = all ? data.epics : data.epics.filter((e) => !isClosedEpic(e.status));
  return (
    <div className={styles.page} data-testid="roadmap-view">
      <div className={styles.toolbar}><ShowAllEpics checked={all} onChange={setAll} hidden={data.epics.length - epics.length} label={t("dev.showClosedEpics")} /></div>
      <table className={styles.table}>
        <thead><tr><th>Epic</th><th>{t("dev.klant")}</th><th>{t("dev.phase")}</th><th>Status</th><th>{t("dev.timeline")}</th><th style={{ width: 240 }}>{t("dev.progress")}</th></tr></thead>
        <tbody>
          {epics.map((e) => (
            <tr key={e.id} data-testid="epic-row" data-epic-name={e.name}>
              <td><button type="button" className={styles.link} onClick={() => onOpenItem(e.id)}>{e.name}</button></td>
              <td>{e.klant ?? ""}</td>
              <td data-testid="epic-phase">{e.phases.map((p) => p.name).join(", ") || <span className={styles.muted}>-</span>}</td>
              <td>{e.status ? <Chip text={e.status} color={e.statusColor} /> : null}</td>
              <td>{e.timeline?.from ? `${fmtDate(e.timeline.from)} - ${fmtDate(e.timeline.to ?? null)}` : ""}</td>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className={styles.bar} style={{ flex: 1 }}><div className={styles.barFill} style={{ width: `${e.percent}%` }} /></div>
                  <span className={styles.counts} data-testid="epic-progress">{e.percent}% ({e.tasks.done}/{e.tasks.total})</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!epics.length ? <div className={styles.empty}>{t("dev.noEpics")}</div> : null}
    </div>
  );
}
