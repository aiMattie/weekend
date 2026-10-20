"use client";

import { Button, Toggle } from "@vibe/core";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { useIsClient } from "@/lib/use-persistent-state";
import type { ConnectionView, ConnectionsView } from "@/server/services/import-connections";
import styles from "./import.module.css";

type Kind = ConnectionView["kind"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: unknown; error: string }> {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  return { ok: r.ok, data, error: r.ok ? "" : (data as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${r.status}` };
}

/** Admin > Import: link monday.com and Jira and schedule recurring syncs. */
export function ConnectionsPanel({ initial, onJobStarted }: { initial: ConnectionsView; onJobStarted: (jobId: string) => void }) {
  const t = useT();
  const [view, setView] = useState(initial);
  return (
    <div data-testid="import-connections">
      <h2 className={styles.h2} style={{ marginTop: 0 }}>{t("migration.conn.title")}</h2>
      <p className={styles.sub}>{t("migration.conn.subtitle", { tz: view.timeZone })}</p>
      <div className={styles.cards}>
        {view.connections.map((c) => <ConnectionCard key={c.kind} conn={c} onView={setView} onJobStarted={onJobStarted} />)}
      </div>
    </div>
  );
}

function ConnectionCard({ conn, onView, onJobStarted }: { conn: ConnectionView; onView: (v: ConnectionsView) => void; onJobStarted: (id: string) => void }) {
  const t = useT();
  const ready = useIsClient();
  const k: Kind = conn.kind;
  const base = `/api/v1/admin/import/connections/${k}`;
  const [editing, setEditing] = useState(!conn.linked);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(conn.baseUrl ?? "");
  const [email, setEmail] = useState(conn.email ?? "");
  const [scope, setScope] = useState((k === "monday" ? conn.schedule.workspaces : conn.schedule.projects)?.join(", ") ?? "");
  const [anchor, setAnchor] = useState(conn.schedule.sprintCadence?.anchor ?? "");
  const [weeks, setWeeks] = useState(conn.schedule.sprintCadence?.weeks ?? 2);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const act = async (fn: () => Promise<{ ok: boolean; data: unknown; error: string }>, done?: (data: unknown) => void) => {
    setBusy(true); setErr(""); setMsg("");
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    done?.(r.data);
  };
  const connect = () => act(() => call(base, "PUT", k === "monday" ? { apiKey } : { baseUrl, email, apiToken: apiKey }), (d) => { onView(d as ConnectionsView); setApiKey(""); setEditing(false); setMsg(t("migration.conn.linkedOk")); });
  const unlink = () => { if (window.confirm(t("migration.conn.confirmUnlink"))) void act(() => call(base, "DELETE"), (d) => { onView(d as ConnectionsView); setEditing(true); }); };
  const test = () => act(() => call(`${base}/test`, "POST"), (d) => setMsg(t("migration.conn.testOk", { label: (d as { label: string }).label })));
  const schedule = (patch: Record<string, unknown>) => act(() => call(`${base}/schedule`, "PUT", patch), (d) => onView(d as ConnectionsView));
  const saveScope = () => {
    const list = scope.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    void schedule(k === "monday" ? { workspaces: list } : { projects: list });
  };
  const runNow = () => { if (window.confirm(t("migration.conn.confirmRun"))) void act(() => call(`${base}/run`, "POST"), (d) => { setMsg(t("migration.conn.runStarted")); onJobStarted((d as { id: string }).id); }); };

  const s = conn.schedule;
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" }) : "–");
  return (
    <section className={styles.form} data-testid={`conn-${k}`} data-linked={conn.linked ? "1" : "0"}>
      <div className={styles.row} style={{ justifyContent: "space-between" }}>
        <h3 className={styles.h3}>{t(`migration.kind.${k}`)}</h3>
        <span className={conn.linked ? styles.badge : styles.badgeOff} data-testid={`conn-${k}-status`}>
          {conn.linked ? t(conn.source === "env" ? "migration.conn.viaEnv" : "migration.conn.linked") : t("migration.conn.notLinked")}
        </span>
      </div>
      {conn.linked && !editing && (
        <div className={styles.meta}>
          {conn.label && <div>{t("migration.conn.as", { label: conn.label })}</div>}
          {k === "jira" && conn.baseUrl && <div>{conn.baseUrl} · {conn.email}</div>}
          {conn.connectedAt && <div>{t("migration.conn.since", { when: fmt(conn.connectedAt) })}</div>}
          <div className={styles.row}>
            <Button size="small" kind="secondary" onClick={() => void test()} disabled={!ready || busy} data-testid={`conn-${k}-test`}>{t("migration.conn.test")}</Button>
            <Button size="small" kind="tertiary" onClick={() => setEditing(true)} disabled={!ready || busy}>{t("migration.conn.change")}</Button>
            {conn.source === "app" && <Button size="small" kind="tertiary" onClick={unlink} disabled={!ready || busy} data-testid={`conn-${k}-unlink`}>{t("migration.conn.unlink")}</Button>}
          </div>
        </div>
      )}
      {editing && (
        <div className={styles.fields}>
          {k === "jira" && (
            <>
              <label>{t("migration.conn.jiraUrl")}<input className={styles.input} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://jouwbedrijf.atlassian.net" data-testid="conn-jira-url" /></label>
              <label>{t("migration.conn.jiraEmail")}<input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" data-testid="conn-jira-email" /></label>
            </>
          )}
          <label>
            {t(k === "monday" ? "migration.conn.mondayKey" : "migration.conn.jiraToken")}
            <input className={styles.input} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="new-password" data-testid={`conn-${k}-secret`} />
          </label>
          <p className={styles.hint}>{t(k === "monday" ? "migration.conn.mondayHelp" : "migration.conn.jiraHelp")}</p>
          <div className={styles.row}>
            <Button size="small" onClick={() => void connect()} disabled={!ready || busy || !apiKey.trim() || (k === "jira" && (!baseUrl.trim() || !email.trim()))} data-testid={`conn-${k}-connect`}>{t("migration.conn.connect")}</Button>
            {conn.linked && <Button size="small" kind="tertiary" onClick={() => setEditing(false)} disabled={busy}>{t("migration.conn.cancel")}</Button>}
          </div>
        </div>
      )}

      <div className={styles.divider} />
      <div className={styles.row}>
        <Toggle isSelected={s.enabled} onChange={(v: boolean) => void schedule({ enabled: v })} disabled={!ready || busy || !conn.linked} aria-label={t("migration.conn.scheduleOn")} data-testid={`conn-${k}-schedule`} />
        <span>{t("migration.conn.scheduleOn")}</span>
        <select className={styles.select} value={s.frequency} onChange={(e) => void schedule({ frequency: e.target.value })} disabled={!ready || busy} aria-label={t("migration.conn.frequency")} data-testid={`conn-${k}-frequency`}>
          {(["hourly", "daily", "weekly"] as const).map((f) => <option key={f} value={f}>{t(`migration.conn.freq.${f}`)}</option>)}
        </select>
        {s.frequency === "weekly" && (
          <select className={styles.select} value={s.weekday} onChange={(e) => void schedule({ weekday: Number(e.target.value) })} disabled={!ready || busy} aria-label={t("migration.conn.weekday")}>
            {WEEKDAYS.map((d) => <option key={d} value={d}>{t(`migration.conn.day.${d}`)}</option>)}
          </select>
        )}
        {s.frequency !== "hourly" && (
          <select className={styles.select} value={s.hour} onChange={(e) => void schedule({ hour: Number(e.target.value) })} disabled={!ready || busy} aria-label={t("migration.conn.hour")} data-testid={`conn-${k}-hour`}>
            {HOURS.map((h) => <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>)}
          </select>
        )}
      </div>
      <label className={styles.fields}>
        {t(k === "monday" ? "migration.conn.scopeMonday" : "migration.conn.scopeJira")}
        <span className={styles.row}>
          <input className={styles.input} value={scope} onChange={(e) => setScope(e.target.value)} placeholder={t("migration.conn.scopeAll")} data-testid={`conn-${k}-scope`} />
          <Button size="small" kind="secondary" onClick={saveScope} disabled={!ready || busy}>{t("migration.conn.save")}</Button>
        </span>
      </label>
      {k === "jira" && (
        <label className={styles.fields}>
          {t("migration.conn.cadence")}
          <span className={styles.row}>
            <input className={styles.input} type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} aria-label={t("migration.conn.cadenceAnchor")} data-testid="conn-jira-cadence-anchor" />
            <select className={styles.select} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} aria-label={t("migration.conn.cadenceWeeks")} data-testid="conn-jira-cadence-weeks">
              {[1, 2, 3, 4, 6, 8].map((w) => <option key={w} value={w}>{w} {t("migration.conn.cadenceWeeks").toLowerCase()}</option>)}
            </select>
            <Button size="small" kind="secondary" onClick={() => void schedule({ sprintCadence: anchor ? { anchor, weeks } : null })} disabled={!ready || busy}>{t("migration.conn.save")}</Button>
          </span>
          {!s.sprintCadence && <span className={styles.hint}>{t("migration.conn.cadenceOff")}</span>}
        </label>
      )}
      <div className={styles.meta} data-testid={`conn-${k}-runs`}>
        <div>{t("migration.conn.next")}: {s.enabled ? fmt(s.nextRunAt) : t("migration.conn.off")}</div>
        <div>
          {t("migration.conn.last")}: {s.lastJob ? `${fmt(s.lastJob.createdAt)} · ${t(`migration.status.${s.lastJob.status}`)}` : "–"}
          {s.lastJob?.error && <span className={styles.err}> {s.lastJob.error}</span>}
        </div>
      </div>
      <div className={styles.row}>
        <Button size="small" onClick={runNow} disabled={!ready || busy || !conn.linked} data-testid={`conn-${k}-run`}>{t("migration.conn.runNow")}</Button>
      </div>
      {msg && <div className={styles.running} role="status" data-testid={`conn-${k}-msg`}>{msg}</div>}
      {err && <div className={styles.err} role="alert" data-testid={`conn-${k}-error`}>{err}</div>}
    </section>
  );
}
