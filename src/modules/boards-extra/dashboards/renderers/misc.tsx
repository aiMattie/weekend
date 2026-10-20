"use client";

import { Avatar } from "@vibe/core";
import type { WorkloadData } from "../../widgets/defs/workload";
import styles from "../dashboards.module.css";
import { Empty, nf, useLabel, type RendererProps } from "./shared";

export function WorkloadWidget({ data }: RendererProps<WorkloadData>) {
  const label = useLabel();
  if (!data.people.length) return <Empty />;
  return (
    <div className={styles.workload} data-testid="workload-widget">
      {data.people.map((p) => (
        <div key={p.key} className={styles.workRow}>
          <div className={styles.workWho}><Avatar type="text" text={label(p.label).slice(0, 2)} size="xs" withoutTooltip /><span>{label(p.label)}</span></div>
          <div className={styles.workBar}>
            {p.segments.map((s) => <div key={s.key} style={{ width: `${data.max ? (s.value / data.max) * 100 : 0}%`, background: s.color }} title={`${label(s.label)}: ${nf.format(s.value)}`} />)}
          </div>
          <div className={styles.workTotal}>{nf.format(p.total)}</div>
        </div>
      ))}
    </div>
  );
}

export function TextWidget({ data }: RendererProps<{ text: string; size: "small" | "medium" | "large" }>) {
  const size = data.size === "large" ? 22 : data.size === "small" ? 12 : 15;
  return <div className={styles.textWidget} style={{ fontSize: size }} data-testid="text-widget">{data.text || <span className={styles.muted}>…</span>}</div>;
}

export function EmbedWidget({ data }: RendererProps<{ url: string; embedUrl: string | null }>) {
  if (!data.embedUrl) return <Empty>{data.url ? "URL niet toegestaan" : "Geen URL"}</Empty>;
  return <iframe className={styles.embed} src={data.embedUrl} title="embed" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" referrerPolicy="no-referrer" allowFullScreen data-testid="embed-widget" />;
}
