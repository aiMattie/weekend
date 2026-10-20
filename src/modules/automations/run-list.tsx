"use client";

import { Button } from "@vibe/core";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { RunDto } from "./types";
import type { UiCtx } from "./use-auto-context";
import styles from "./automations.module.css";

export const fmtTime = (iso: string, locale: string) => new Date(iso).toLocaleString(locale === "nl" ? "nl-NL" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function StatusChip({ status }: { status: string }) {
  const t = useT();
  return <span className={`${styles.chip} ${styles[`chip_${status}` as keyof typeof styles] ?? ""}`} data-testid="run-status" data-status={status}>{t(`auto.status.${status}`)}</span>;
}

/** Run history of one automation (automationId) or the whole board. Polls while mounted. */
export function RunList({ ctx, automationId, names }: { ctx: UiCtx; automationId?: string; names?: Record<string, string> }) {
  const t = useT();
  const [runs, setRuns] = useState<RunDto[] | null>(null);
  const url = automationId ? `/api/v1/automations/${automationId}/runs?limit=100` : `/api/v1/automations/runs?boardId=${ctx.boardId}&limit=100`;
  const load = useCallback(() => api.get<RunDto[]>(url).then(setRuns).catch(() => undefined), [url]);
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [load]);
  const itemName = (id: string | null) => (id ? ctx.board.items.find((i) => i.id === id)?.name ?? `#${id}` : "-");
  if (runs === null) return <div className={styles.empty}>{t("common.loading")}</div>;
  if (!runs.length) return <div className={styles.empty} data-testid="run-empty">{t("auto.logEmpty")}</div>;
  return (
    <table className={styles.table} data-testid="run-table">
      <thead><tr><th>{t("auto.col.time")}</th>{automationId ? null : <th>{t("auto.col.automation")}</th>}<th>{t("auto.col.item")}</th><th>{t("auto.col.status")}</th><th>{t("auto.col.result")}</th></tr></thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id} data-testid="run-row" data-status={r.status}>
            <td>{fmtTime(r.startedAt, ctx.locale)}</td>
            {automationId ? null : <td>{names?.[r.automationId] ?? r.automationId}</td>}
            <td>{itemName(r.itemId)}</td>
            <td><StatusChip status={r.status} /></td>
            <td>
              {r.error ? <div className={styles.errText} data-testid="run-error">{r.error}</div> : null}
              <ul className={styles.stepList}>{r.steps.map((s, i) => <li key={i}>{s.block}{s.output ? ` (${s.output})` : ""}{s.status === "failed" ? ` - ${s.error}` : ""}</li>)}</ul>
              {r.status === "failed" ? <Button size="xs" kind="tertiary" onClick={() => void api.post(`/api/v1/automations/runs/${r.id}/retry`).then(load)} data-testid="run-retry">{t("auto.retry")}</Button> : null}
              {r.status === "retrying" && r.nextRetryAt ? <div className={styles.muted}>{t("auto.status.retrying")}: {r.attempt}/{r.maxAttempts}</div> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
