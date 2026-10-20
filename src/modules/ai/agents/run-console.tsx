"use client";

import { Button } from "@vibe/core";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { BuilderProps } from "./agent-builder";
import { statusPill } from "./agent-tile";
import type { RunDto } from "./types";
import s from "../ai.module.css";

/** Test console: run the agent now and watch what it did (transcript, tool calls, cost). */
export function RunConsole({ agent, onRan }: BuilderProps & { onRan: () => void }) {
  const t = useT();
  const [input, setInput] = useState("");
  const [run, setRun] = useState<RunDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr(""); setRun(null);
    try { setRun(await api.post<RunDto>(`/api/v1/ai/agents/${agent.id}/run`, { input: input || undefined })); onRan(); }
    catch (e) { setErr(e instanceof Error ? e.message : t("ai.error")); }
    finally { setBusy(false); }
  };
  return (
    <div data-testid="agent-console" style={{ maxWidth: 860 }}>
      <label className={s.field}><span className={s.label}>{t("ai.ag.test.input")}</span><textarea className={s.text} rows={3} value={input} onChange={(e) => setInput(e.target.value)} data-testid="console-input" /></label>
      <Button size="small" kind="primary" onClick={() => void go()} disabled={busy} data-testid="console-run">{busy ? t("ai.ag.test.running") : t("ai.ag.test.run")}</Button>
      {err ? <div className={s.err} role="alert" style={{ marginTop: 12 }} data-testid="console-error">{err}</div> : null}
      {run ? (
        <div style={{ marginTop: 20 }} data-testid="console-result" data-status={run.status}>
          <div className={s.row} style={{ marginBottom: 8 }}>
            <span className={`${s.pill} ${statusPill(run.status)}`} data-testid="console-status">{t(`ai.ag.run.${run.status}`)}</span>
            <span className={s.muted}>{t("ai.ag.runs.steps")}: {run.steps} · {t("ai.ag.runs.credits")}: {run.credits}</span>
          </div>
          {run.error ? <div className={s.err} role="alert" data-testid="console-run-error">{run.error}</div> : null}
          {run.result ? <div className={s.panelBox}><div className={s.label}>{t("ai.ag.test.result")}</div><p className={s.pre} data-testid="console-output">{run.result}</p></div> : null}
          {run.toolCalls.length ? (
            <div className={s.panelBox}><div className={s.label}>{t("ai.ag.test.tools")}</div>
              {run.toolCalls.map((c, i) => <div key={i} className={s.pre} data-testid="console-toolcall"><strong>{c.name}</strong> <span className={c.error ? s.bad : s.ok}>{c.error ? "✗" : "✓"}</span> <span className={s.muted}>{c.output.slice(0, 160)}</span></div>)}
            </div>
          ) : null}
          <details className={s.panelBox}><summary className={s.label}>{t("ai.ag.test.transcript")}</summary>
            {run.transcript.map((e, i) => <p key={i} className={s.pre} style={{ marginTop: 8 }}><strong>{e.role}</strong>: {e.text}</p>)}
          </details>
        </div>
      ) : null}
    </div>
  );
}
