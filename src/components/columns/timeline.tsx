"use client";

import { useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { useLocale, useT } from "@/lib/i18n/client";
import type { ColumnUi, EditorProps } from "./types";
import pack from "./pack.module.css";
import styles from "./cells.module.css";

type V = { from: string; to: string };

const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];

/** "1 - 5 okt" or "28 sep - 3 okt" (year appended when it is not the current year). */
export function formatTimelineShort(v: V, locale: string): string {
  const l = locale === "nl" ? "nl-NL" : "en-GB";
  const [y1, m1, d1] = parts(v.from);
  const [y2, m2, d2] = parts(v.to);
  const mon = (y: number, m: number) => new Date(y, m - 1, 1).toLocaleDateString(l, { month: "short" }).replace(".", "");
  const yr = new Date().getFullYear();
  const suffix = y2 !== yr || y1 !== yr ? ` ${y2}` : "";
  if (v.from === v.to) return `${d1} ${mon(y1, m1)}${suffix}`;
  if (y1 === y2 && m1 === m2) return `${d1} - ${d2} ${mon(y2, m2)}${suffix}`;
  return `${d1} ${mon(y1, m1)} - ${d2} ${mon(y2, m2)}${suffix}`;
}

function TimelineEditor({ value, onCommit, onCancel, anchorEl }: EditorProps<V>) {
  const t = useT();
  const [from, setFrom] = useState(value?.from ?? "");
  const [to, setTo] = useState(value?.to ?? "");
  const bad = !!from && !!to && to < from;
  const save = () => (from ? onCommit({ from, to: to || from }) : onCommit(null));
  return (
    <Popover anchorEl={anchorEl} onClose={onCancel}>
      <div className={styles.popPanel} data-testid="timeline-editor">
        <label>{t("col.timeline.start")}<input type="date" autoFocus value={from} data-testid="timeline-from" onChange={(e) => { setFrom(e.target.value); if (!to || to < e.target.value) setTo(e.target.value); }} /></label>
        <label>{t("col.timeline.end")}<input type="date" value={to} min={from || undefined} data-testid="timeline-to" onChange={(e) => setTo(e.target.value)} /></label>
        {bad ? <span className={pack.err2}>{t("col.timeline.invalid")}</span> : null}
        <div className={styles.popRow}>
          <button className={styles.btn} type="button" onClick={() => onCommit(null)}>{t("column.clear")}</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" disabled={bad} onClick={save} data-testid="timeline-save">{t("common.save")}</button>
        </div>
      </div>
    </Popover>
  );
}

export const timelineUi: ColumnUi<V> = {
  align: "center",
  defaultWidth: 170,
  Cell: function TimelineCell({ value }) {
    const locale = useLocale();
    return (
      <div className={`${styles.cell} ${styles.center}`}>
        {value ? <span className={pack.timelinePill} title={`${value.from} - ${value.to}`}>{formatTimelineShort(value, locale)}</span> : <span className={pack.timelineEmpty}>-</span>}
      </div>
    );
  },
  Editor: TimelineEditor,
};
