"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { statusPill } from "./agent-tile";
import type { RunDto } from "./types";
import s from "../ai.module.css";

export function RunHistory({ agentId, refreshKey }: { agentId: string; refreshKey: number }) {
  const t = useT();
  const [runs, setRuns] = useState<RunDto[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => { void api.get<RunDto[]>(`/api/v1/ai/agents/${agentId}/runs`).then(setRuns).catch(() => setRuns([])); }, [agentId]);
  useEffect(() => { load(); }, [load, refreshKey]);
  if (!runs) return null;
  if (!runs.length) return <p className={s.muted} data-testid="runs-empty">{t("ai.ag.runs.none")}</p>;
  return (
    <table className={s.table} data-testid="agent-runs">
      <thead><tr><th>{t("ai.ag.runs.started")}</th><th>{t("ai.ag.runs.trigger")}</th><th>{t("ai.ag.runs.status")}</th><th>{t("ai.ag.runs.steps")}</th><th>{t("ai.ag.runs.credits")}</th></tr></thead>
      <tbody>
        {runs.map((r) => (
          <Fragment key={r.id}>
            <tr data-testid="run-row" data-status={r.status} onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: "pointer" }}>
              <td>{new Date(r.startedAt).toLocaleString("nl-NL")}</td><td>{t(`ai.ag.trig.${r.triggerType}`)}</td>
              <td><span className={`${s.pill} ${statusPill(r.status)}`}>{t(`ai.ag.run.${r.status}`)}</span></td><td>{r.steps}</td><td>{r.credits}</td>
            </tr>
            {open === r.id ? (
              <tr data-testid="run-detail"><td colSpan={5}>
                {r.error ? <p className={s.bad}>{r.error}</p> : null}
                {r.result ? <p className={s.pre}>{r.result}</p> : null}
                {r.toolCalls.map((c, i) => <div key={i} className={s.pre}><strong>{c.name}</strong> {c.error ? "✗" : "✓"} <span className={s.muted}>{c.output.slice(0, 200)}</span></div>)}
              </td></tr>
            ) : null}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
