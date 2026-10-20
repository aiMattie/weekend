"use client";

import { useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { useLocale, useT } from "@/lib/i18n/client";
import type { ColumnUi, EditorProps } from "./types";
import styles from "./cells.module.css";

type V = { date: string; time?: string };

export function formatDateShort(v: V, locale: string): string {
  const [y, m, d] = v.date.split("-").map(Number);
  const text = new Date(y, m - 1, d).toLocaleDateString(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "short", ...(new Date().getFullYear() === y ? {} : { year: "numeric" }) });
  return v.time ? `${text} ${v.time.slice(0, 5)}` : text;
}

function DateEditor({ value, onCommit, onCancel, anchorEl }: EditorProps<V>) {
  const t = useT();
  const [date, setDate] = useState(value?.date ?? "");
  const [time, setTime] = useState(value?.time?.slice(0, 5) ?? "");
  const commit = (d: string, tm: string) => onCommit(d ? { date: d, ...(tm ? { time: tm } : {}) } : null);
  return (
    <Popover anchorEl={anchorEl} onClose={onCancel}>
      <div className={styles.popPanel}>
        <input type="date" autoFocus value={date} data-testid="date-input" onChange={(e) => { setDate(e.target.value); if (e.target.value && !time) commit(e.target.value, ""); }} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} onBlur={() => date && time && commit(date, time)} />
        <div className={styles.popRow}>
          <button className={styles.btn} type="button" onClick={() => onCommit(null)}>{t("column.clear")}</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={() => commit(date, time)}>{t("common.save")}</button>
        </div>
      </div>
    </Popover>
  );
}

export const dateUi: ColumnUi<V> = {
  align: "center",
  defaultWidth: 140,
  Cell: function DateCell({ value }) {
    const locale = useLocale();
    return <div className={`${styles.cell} ${styles.center}`}>{value ? formatDateShort(value, locale) : ""}</div>;
  },
  Editor: DateEditor,
};
