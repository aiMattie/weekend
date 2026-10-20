"use client";

import { useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ViewProps } from "@/components/views/types";
import { useT } from "@/lib/i18n/client";
import type { Dashboard } from "@/server/services/sprint-reports";
import { useDevData } from "./use-dev";
import { Select } from "./ui";
import styles from "./dev.module.css";

const C = { blue: "#0073ea", green: "#00c875", orange: "#fdab3d", red: "#df2f4a", grey: "#9699a6", purple: "#a25ddc" };

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });

function Tile({ label, value, testId }: { label: string; value: string; testId: string }) {
  return <div className={styles.tile}><div className={styles.tileValue} data-testid={testId}>{value}</div><div className={styles.tileLabel}>{label}</div></div>;
}

/** Sprint dashboard: burndown, velocity, scope change, cycle time, workload per developer, per-klant filter, standup. */
export function DashboardView({ board }: ViewProps) {
  const t = useT();
  const [sprintId, setSprintId] = useState("");
  const [klant, setKlant] = useState("");
  const [unit, setUnit] = useState<"estimate" | "count">("estimate");
  const qs = new URLSearchParams({ ...(sprintId ? { sprintId } : {}), ...(klant ? { klant } : {}), unit });
  const { data, error } = useDevData<Dashboard>(`/api/v1/dev/boards/${board.board.id}/dashboard?${qs}`, board.board.id);
  const [copied, setCopied] = useState(false);

  if (!data) return <div className={styles.page}>{error ? <div className={styles.error}>{error}</div> : t("common.loading")}</div>;
  const sp = data.sprint;
  const u = unit === "count" ? "" : "u";
  const burn = data.burndown.map((p) => ({ ...p, label: shortDate(p.date) }));
  const vel = data.velocity.sprints;
  const wl = data.workload.map((w) => ({ name: w.name, done: unit === "count" ? w.doneCount : w.donePoints, open: unit === "count" ? w.count - w.doneCount : Math.round((w.points - w.donePoints) * 10) / 10 }));
  const cycle = (data.cycle?.items ?? []).slice(0, 12).map((c, i) => ({ name: `#${i + 1}`, days: c.days }));

  return (
    <div className={styles.page} data-testid="dashboard-view">
      <div className={styles.toolbar}>
        <Select value={sprintId || (sp?.id ?? "")} onChange={setSprintId} options={data.sprints.map((s) => ({ value: s.id, label: `${s.name} (${t(`dev.state.${s.state}`)})` }))} placeholder={t("dev.chooseSprint")} testId="dash-sprint" />
        <Select value={klant} onChange={setKlant} options={data.klanten.map((k) => ({ value: k, label: k }))} placeholder={t("dev.allKlanten")} testId="dash-klant" />
        <select className={styles.select} value={unit} onChange={(e) => setUnit(e.target.value as "estimate" | "count")} data-testid="dash-unit" aria-label={t("dev.unit")}>
          <option value="estimate">{t("dev.unitEstimate")}</option>
          <option value="count">{t("dev.unitCount")}</option>
        </select>
      </div>
      {!sp ? <div className={styles.empty}>{t("dev.noSprints")}</div> : (
        <>
          <div className={styles.tiles}>
            <Tile label={t("dev.tile.tasksDone")} value={`${data.totals?.doneCount ?? 0} / ${data.totals?.count ?? 0}`} testId="tile-tasks" />
            <Tile label={t("dev.tile.workDone")} value={unit === "count" ? `${data.totals?.doneCount ?? 0}` : `${data.totals?.donePoints ?? 0} / ${data.totals?.points ?? 0}${u}`} testId="tile-points" />
            <Tile label={t("dev.tile.scopeAdded")} value={`+${unit === "count" ? data.scope?.addedCount ?? 0 : data.scope?.addedPoints ?? 0}`} testId="tile-scope-added" />
            <Tile label={t("dev.tile.scopeRemoved")} value={`-${unit === "count" ? data.scope?.removedCount ?? 0 : data.scope?.removedPoints ?? 0}`} testId="tile-scope-removed" />
            <Tile label={t("dev.tile.cycle")} value={data.cycle?.averageDays !== null && data.cycle ? `${data.cycle.averageDays} d` : "-"} testId="tile-cycle" />
            <Tile label={t("dev.tile.velocity")} value={data.velocity.average !== null ? `${data.velocity.average}${u}` : "-"} testId="tile-velocity" />
          </div>
          <div className={styles.charts}>
            <div className={styles.chartCard} data-testid="chart-burndown">
              <div className={styles.chartTitle}>{t("dev.chart.burndown")} - {sp.name}</div>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={200} initialDimension={{ width: 520, height: 280 }}>
                  <ComposedChart data={burn} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                    <XAxis dataKey="label" fontSize={12} />
                    <YAxis fontSize={12} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Area type="stepAfter" dataKey="scope" name={t("dev.chart.scope")} fill="#e6f0ff" stroke="#b3d4ff" isAnimationActive={false} />
                    <Line type="monotone" dataKey="ideal" name={t("dev.chart.ideal")} stroke={C.grey} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="remaining" name={t("dev.chart.remaining")} stroke={C.blue} strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className={styles.chartCard} data-testid="chart-velocity">
              <div className={styles.chartTitle}>{t("dev.chart.velocity")}</div>
              {vel.length ? (
                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={200} initialDimension={{ width: 520, height: 280 }}>
                    <BarChart data={vel} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis fontSize={12} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="committed" name={t("dev.chart.committed")} fill="#b3d4ff" maxBarSize={56} isAnimationActive={false} />
                      <Bar dataKey="completed" name={t("dev.chart.completed")} fill={C.green} maxBarSize={56} isAnimationActive={false} />
                      {data.velocity.average !== null ? <ReferenceLine y={data.velocity.average} stroke={C.orange} strokeDasharray="4 4" /> : null}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className={styles.empty}>{t("dev.noVelocity")}</div>}
            </div>
            <div className={styles.chartCard} data-testid="chart-workload">
              <div className={styles.chartTitle}>{t("dev.chart.workload")}</div>
              {wl.length ? (
                <div style={{ width: "100%", height: Math.max(180, wl.length * 44 + 60) }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={200} initialDimension={{ width: 520, height: 220 }}>
                    <BarChart data={wl} layout="vertical" margin={{ top: 8, right: 12, bottom: 0, left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                      <XAxis type="number" fontSize={12} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" fontSize={12} width={110} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="done" stackId="a" name={t("dev.chart.done")} fill={C.green} isAnimationActive={false} />
                      <Bar dataKey="open" stackId="a" name={t("dev.chart.open")} fill={C.blue} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className={styles.empty}>{t("dev.noTasks")}</div>}
            </div>
            <div className={styles.chartCard} data-testid="chart-cycle">
              <div className={styles.chartTitle}>{t("dev.chart.cycle")} {data.cycle?.averageDays != null ? `(${t("dev.average")} ${data.cycle.averageDays} d, ${t("dev.median")} ${data.cycle.medianDays} d)` : ""}</div>
              {cycle.length ? (
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={200} initialDimension={{ width: 520, height: 220 }}>
                    <BarChart data={cycle} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="days" name={t("dev.days")} fill={C.purple} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className={styles.empty}>{t("dev.noDone")}</div>}
            </div>
          </div>
        </>
      )}
      <div className={styles.chartCard} style={{ marginTop: 16 }} data-testid="standup-card">
        <div className={styles.chartTitle}>{t("dev.standup")}</div>
        <pre className={styles.standup} data-testid="standup-text">{data.standup.text}</pre>
        <button type="button" className={styles.btn} onClick={() => { void navigator.clipboard?.writeText(data.standup.text).then(() => setCopied(true)); }} data-testid="standup-copy">{copied ? t("dev.copied") : t("dev.copy")}</button>
      </div>
    </div>
  );
}
