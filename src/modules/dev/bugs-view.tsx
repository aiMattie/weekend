"use client";

import type { ViewProps } from "@/components/views/types";
import { useT } from "@/lib/i18n/client";
import type { BugStats } from "@/server/services/bugs";
import { useDevData } from "./use-dev";
import { Chip, PRIO_COLORS } from "./ui";
import styles from "./dev.module.css";

const days = (n: number | null) => (n === null ? "-" : `${n} d`);

/** Bugs with time to resolution (created -> done). */
export function BugsView({ board, onOpenItem }: ViewProps) {
  const t = useT();
  const { data, error } = useDevData<BugStats>(`/api/v1/dev/boards/${board.board.id}/bugs`, board.board.id);
  if (!data) return <div className={styles.page}>{error ?? t("common.loading")}</div>;
  return (
    <div className={styles.page} data-testid="bugs-view">
      <div className={styles.tiles}>
        <div className={styles.tile}><div className={styles.tileValue} data-testid="bugs-open">{data.open}</div><div className={styles.tileLabel}>{t("dev.bugs.open")}</div></div>
        <div className={styles.tile}><div className={styles.tileValue} data-testid="bugs-resolved">{data.resolved}</div><div className={styles.tileLabel}>{t("dev.bugs.resolved")}</div></div>
        <div className={styles.tile}><div className={styles.tileValue} data-testid="bugs-avg">{days(data.averageDays)}</div><div className={styles.tileLabel}>{t("dev.bugs.avg")}</div></div>
        <div className={styles.tile}><div className={styles.tileValue}>{days(data.medianDays)}</div><div className={styles.tileLabel}>{t("dev.bugs.median")}</div></div>
      </div>
      <table className={styles.table}>
        <thead><tr><th>Bug</th><th>{t("dev.priority")}</th><th>{t("dev.klant")}</th><th>Status</th><th>{t("dev.bugs.reported")}</th><th>{t("dev.bugs.resolvedOn")}</th><th>{t("dev.bugs.ttr")}</th></tr></thead>
        <tbody>
          {data.bugs.map((b) => (
            <tr key={b.id} data-testid="bug-row">
              <td><button type="button" className={styles.link} onClick={() => onOpenItem(b.id)}>{b.name}</button></td>
              <td>{b.prioriteit ? <Chip text={b.prioriteit} color={PRIO_COLORS[b.prioriteit] ?? "#c4c4c4"} /> : null}</td>
              <td>{b.klant ?? ""}</td>
              <td>{b.status}</td>
              <td>{b.createdAt.slice(0, 10)}</td>
              <td>{b.resolvedOn ?? ""}</td>
              <td data-testid="bug-ttr">{days(b.days)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.bugs.length ? <div className={styles.empty}>{t("dev.bugs.none")}</div> : null}
    </div>
  );
}
