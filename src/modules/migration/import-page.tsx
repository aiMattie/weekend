"use client";

import { Button, Checkbox } from "@vibe/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { useIsClient } from "@/lib/use-persistent-state";
import type { ConnectionsView } from "@/server/services/import-connections";
import { ConnectionsPanel } from "./connections-panel";
import styles from "./import.module.css";

type Counts = Record<string, { create: number; update: number; skip: number }>;
export interface JobDto {
  id: string; kind: "monday" | "jira"; mode: "dry_run" | "apply"; status: "running" | "done" | "failed";
  counts: Counts; report: { warnings?: string[]; diff?: string[]; skipped?: Record<string, number>; files?: Record<string, number>; requests?: number; durationMs?: number };
  error: string | null; createdAt: string; finishedAt: string | null;
}

export function ImportPage({ initialJobs, hasKey, connections }: { initialJobs: JobDto[]; hasKey: boolean; connections: ConnectionsView }) {
  const t = useT();
  const [jobs, setJobs] = useState<JobDto[]>(initialJobs);
  const [selected, setSelected] = useState<string | null>(initialJobs[0]?.id ?? null);
  const [workspaces, setWorkspaces] = useState("");
  const [updates, setUpdates] = useState(true);
  const [files, setFiles] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const ready = useIsClient();
  const running = jobs.some((j) => j.status === "running");

  const refresh = useCallback(async () => {
    const r = await fetch("/api/v1/admin/import");
    if (r.ok) setJobs(await r.json());
  }, []);

  useEffect(() => {
    if (!running) { if (timer.current) clearInterval(timer.current); timer.current = null; return; }
    timer.current = setInterval(() => void refresh(), 1500);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [running, refresh]);

  const start = async (apply: boolean) => {
    if (apply && !window.confirm(t("migration.confirmApply"))) return;
    setError("");
    setStarting(true);
    const ids = workspaces.split(",").map((s) => s.trim()).filter(Boolean);
    const apiUrl = (window as unknown as { __mondayApiUrl?: string }).__mondayApiUrl;
    const r = await fetch("/api/v1/admin/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apply, workspaces: ids, includeUpdates: updates, downloadFiles: files, ...(apiUrl ? { apiUrl } : {}) }) });
    setStarting(false);
    if (!r.ok) { setError((await r.json().catch(() => null))?.error?.message ?? "Error"); return; }
    const job = (await r.json()) as JobDto;
    setSelected(job.id);
    await refresh();
  };

  const [klant, setKlant] = useState("");
  const [tplMsg, setTplMsg] = useState("");
  const runTemplate = async (payload: Record<string, unknown>, okKey: (r: { result: { created?: boolean } }) => string) => {
    setError(""); setTplMsg("");
    const r = await fetch("/api/v1/admin/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!r.ok) { setError((await r.json().catch(() => null))?.error?.message ?? "Error"); return; }
    setTplMsg(t(okKey(await r.json())));
  };

  const job = jobs.find((j) => j.id === selected) ?? null;

  return (
    <div className={styles.page} data-testid="import-page">
      <h1 className={styles.title}>{t("migration.title")}</h1>
      <p className={styles.sub}>{t("migration.subtitle")}</p>
      <span className={styles.badge} data-testid="import-readonly">{t("migration.readOnly")}</span>
      <ConnectionsPanel initial={connections} onJobStarted={(id) => { setSelected(id); void refresh(); }} />
      <h2 className={styles.h2}>{t("migration.manual")}</h2>
      {!hasKey && <div className={styles.err} role="alert">{t("migration.noKey")}</div>}
      <div className={styles.form}>
        <label>
          <div>{t("migration.workspaces")}</div>
          <input className={styles.input} value={workspaces} onChange={(e) => setWorkspaces(e.target.value)} data-testid="import-workspaces" />
        </label>
        <div className={styles.row}>
          <Checkbox label={t("migration.includeUpdates")} checked={updates} onChange={(e) => setUpdates(e.target.checked)} />
          <Checkbox label={t("migration.downloadFiles")} checked={files} onChange={(e) => setFiles(e.target.checked)} />
        </div>
        <div className={styles.row}>
          <Button onClick={() => void start(false)} disabled={!ready || starting || running || !hasKey} data-testid="import-dry-run">{t("migration.dryRun")}</Button>
          <Button kind="secondary" onClick={() => void start(true)} disabled={!ready || starting || running || !hasKey} data-testid="import-apply">{t("migration.apply")}</Button>
        </div>
        {running && <div className={styles.running} data-testid="import-running">{t("migration.running")}</div>}
        {error && <div className={styles.err} role="alert" data-testid="import-error">{error}</div>}
      </div>

      <div className={styles.form} data-testid="template-panel">
        <h2 className={styles.h2} style={{ margin: 0 }}>{t("migration.templates")}</h2>
        <p className={styles.sub} style={{ margin: 0 }}>{t("migration.templatesSub")}</p>
        <div className={styles.row}>
          <Button kind="secondary" onClick={() => void runTemplate({ action: "all" }, () => "migration.templatesDone")} disabled={!ready} data-testid="template-all">{t("migration.templatesAll")}</Button>
        </div>
        <div className={styles.row}>
          <input className={styles.input} style={{ maxWidth: 280 }} value={klant} onChange={(e) => setKlant(e.target.value)} placeholder={t("migration.klantnaam")} aria-label={t("migration.klantnaam")} data-testid="template-klant" />
          <Button onClick={() => void runTemplate({ action: "client", klantnaam: klant }, (r) => (r.result.created ? "migration.klantDone" : "migration.klantExisting"))} disabled={!ready || !klant.trim()} data-testid="template-client">{t("migration.klantCreate")}</Button>
        </div>
        {tplMsg && <div className={styles.running} role="status" data-testid="template-result">{tplMsg}</div>}
      </div>

      {job && <JobReport job={job} />}

      <h2 className={styles.h2}>{t("migration.history")}</h2>
      {!jobs.length ? <p data-testid="import-history-empty">{t("migration.noHistory")}</p> : (
        <table className={styles.table} data-testid="import-history">
          <thead><tr><th>{t("migration.when")}</th><th>Type</th><th>Modus</th><th>Status</th><th /></tr></thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} data-testid="import-job" data-job-id={j.id} data-status={j.status}>
                <td>{new Date(j.createdAt).toLocaleString("nl-NL")}</td>
                <td>{t(`migration.kind.${j.kind}`)}</td>
                <td>{t(`migration.mode.${j.mode}`)}</td>
                <td>{t(`migration.status.${j.status}`)}</td>
                <td><button className={styles.link} onClick={() => setSelected(j.id)}>{t("migration.open")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function JobReport({ job }: { job: JobDto }) {
  const t = useT();
  const r = job.report ?? {};
  const rows = Object.entries(job.counts ?? {});
  return (
    <div data-testid="import-report" data-job-id={job.id} data-status={job.status}>
      <h2 className={styles.h2}>{t("migration.report")} ({t(`migration.mode.${job.mode}`)}, {t(`migration.status.${job.status}`)})</h2>
      {job.error && <div className={styles.err} role="alert" data-testid="import-job-error">{job.error}</div>}
      {rows.length > 0 && (
        <>
          <table className={styles.table} data-testid="import-counts">
            <thead><tr><th>{t("migration.entity")}</th><th className={styles.num}>{t("migration.create")}</th><th className={styles.num}>{t("migration.update")}</th><th className={styles.num}>{t("migration.skip")}</th></tr></thead>
            <tbody>
              {rows.map(([k, c]) => (
                <tr key={k} data-entity={k}><td>{k}</td><td className={styles.num} data-col="create">{c.create}</td><td className={styles.num} data-col="update">{c.update}</td><td className={styles.num} data-col="skip">{c.skip}</td></tr>
              ))}
            </tbody>
          </table>
          {r.skipped && Object.keys(r.skipped).length > 0 && <p data-testid="import-skipped">{t("migration.skipped")}: {Object.entries(r.skipped).map(([k, n]) => `${k} ${n}`).join(", ")}</p>}
        </>
      )}
      {!!r.warnings?.length && (
        <>
          <h3 className={styles.h2}>{t("migration.warnings")} ({r.warnings.length})</h3>
          <ul className={styles.list} data-testid="import-warnings">{r.warnings.slice(0, 200).map((w, i) => <li key={i}>{w}</li>)}</ul>
        </>
      )}
      {!!r.diff?.length && (
        <>
          <h3 className={styles.h2}>{t("migration.diff")}</h3>
          <div className={styles.diff} data-testid="import-diff">{r.diff.slice(0, 300).join("\n")}</div>
        </>
      )}
    </div>
  );
}
