"use client";

import { useEffect, useState } from "react";
import type { PanelTabProps } from "@/components/item-panel/tabs";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { SprintHistoryRow } from "@/server/services/sprint-read";
import { Chip } from "./ui";
import styles from "./dev.module.css";

const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "");

const COLORS: Record<SprintHistoryRow["result"], string> = { done: "#00c875", carried: "#fdab3d", removed: "#c4c4c4", current: "#579bfc", open: "#e2445c" };

/** Item panel tab "Sprints": every sprint the task has been in and what happened there. */
export function SprintsTab({ item, refreshKey }: PanelTabProps) {
  const t = useT();
  const [data, setData] = useState<{ sprints: SprintHistoryRow[]; carried: number } | null>(null);
  useEffect(() => {
    let live = true;
    api.get<{ sprints: SprintHistoryRow[]; carried: number }>(`/api/v1/dev/items/${item.id}/sprints`)
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setData({ sprints: [], carried: 0 }); });
    return () => { live = false; };
  }, [item.id, refreshKey]);

  if (!data) return <div className={styles.muted}>{t("common.loading")}</div>;
  if (!data.sprints.length) return <div className={styles.empty} data-testid="sprint-history-empty">{t("dev.history.empty")}</div>;
  return (
    <div data-testid="sprint-history">
      {data.carried ? <p className={styles.counts}>{t("dev.history.carried", { count: data.carried })}</p> : null}
      <table className={styles.table}>
        <thead><tr><th>Sprint</th><th>{t("dev.history.period")}</th><th>{t("dev.history.result")}</th></tr></thead>
        <tbody>
          {data.sprints.map((r) => (
            <tr key={`${r.sprintId}-${r.addedAt}`} data-testid="sprint-history-row" data-result={r.result}>
              <td>{r.name}</td>
              <td>{fmt(r.startsOn)} - {fmt(r.endsOn)}</td>
              <td><Chip text={t(r.result === "carried" ? "dev.history.carried_label" : `dev.history.${r.result}`)} color={COLORS[r.result]} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
