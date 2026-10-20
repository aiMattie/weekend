"use client";

import { useT } from "@/lib/i18n/client";
import type { NumbersData } from "../../widgets/defs/numbers";
import type { StatusData } from "../../widgets/defs/status";
import styles from "../dashboards.module.css";
import { Empty, nf, useLabel, type RendererProps } from "./shared";

export function NumbersWidget({ data }: RendererProps<NumbersData>) {
  const t = useT();
  return (
    <div className={styles.numbers} data-testid="numbers-widget">
      {data.metrics.map((m, i) => (
        <div key={i} className={styles.numberCell}>
          <div className={styles.bigNumber} data-testid="number-value">{nf.format(m.value)}{data.unit ? ` ${data.unit}` : ""}</div>
          <div className={styles.numberLabel}>{m.label || `${t(`dashboards.agg.${m.aggregation}`)}${m.columnTitle ? ` · ${m.columnTitle}` : ""}`}</div>
        </div>
      ))}
    </div>
  );
}

export function BatteryWidget({ data }: RendererProps<StatusData>) {
  const t = useT();
  const label = useLabel();
  if (!data.total) return <Empty />;
  return (
    <div className={styles.battery} data-testid="battery-widget">
      <div className={styles.batteryBar}>
        {data.segments.map((s) => <div key={s.key} title={`${label(s.label)}: ${s.count}`} style={{ width: `${(s.count / data.total) * 100}%`, background: s.color }} />)}
      </div>
      <div className={styles.batteryText}><b>{nf.format(data.percent)}%</b> {t("dashboards.doneOf", { done: data.done, total: data.total })}</div>
      <div className={styles.legend}>{data.segments.map((s) => <span key={s.key}><i style={{ background: s.color }} />{label(s.label)} ({s.count})</span>)}</div>
    </div>
  );
}

export function StatusOverviewWidget({ data }: RendererProps<StatusData>) {
  const label = useLabel();
  if (!data.total) return <Empty />;
  return (
    <div className={styles.tiles} data-testid="status-overview-widget">
      {data.segments.map((s) => (
        <div key={s.key} className={styles.tile} style={{ background: s.color }}>
          <div className={styles.tileCount}>{s.count}</div>
          <div className={styles.tileLabel}>{label(s.label)}</div>
        </div>
      ))}
    </div>
  );
}

export function ProgressWidget({ data }: RendererProps<{ mode: string; value: number; target: number; percent: number; label: string; columnTitle: string }>) {
  const t = useT();
  return (
    <div className={styles.battery} data-testid="progress-widget">
      <div className={styles.progressPct}>{nf.format(data.percent)}%</div>
      <div className={styles.progressTrack}><div style={{ width: `${Math.min(100, data.percent)}%` }} /></div>
      <div className={styles.numberLabel}>{data.label || (data.mode === "sum" ? `${nf.format(data.value)} / ${nf.format(data.target)} ${data.columnTitle}` : t("dashboards.doneOf", { done: data.value, total: data.target }))}</div>
    </div>
  );
}

export function CounterWidget({ data }: RendererProps<{ days: number | null; label: string; mode: "until" | "since"; targetDate?: string }>) {
  const t = useT();
  if (data.days === null) return <Empty>{t("dashboards.counterSetDate")}</Empty>;
  return (
    <div className={styles.numberCell} style={{ height: "100%", justifyContent: "center" }} data-testid="counter-widget">
      <div className={styles.bigNumber}>{data.days}</div>
      <div className={styles.numberLabel}>{data.label || t(data.mode === "until" ? "dashboards.daysUntil" : "dashboards.daysSince", { date: data.targetDate ?? "" })}</div>
    </div>
  );
}
