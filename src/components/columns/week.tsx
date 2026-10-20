"use client";

import { useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { useT } from "@/lib/i18n/client";
import { isoWeekOf } from "@/server/columns/util";
import type { ColumnUi, EditorProps } from "./types";
import styles from "./cells.module.css";

type V = { week: { startDate: string; endDate: string } };

const weekInput = (v: V | null) => {
  if (!v) return "";
  const w = isoWeekOf(v.week.startDate);
  return `${w.year}-W${String(w.week).padStart(2, "0")}`;
};

function WeekEditor({ value, onCommit, onCancel, anchorEl }: EditorProps<V>) {
  const t = useT();
  const [w, setW] = useState(weekInput(value));
  return (
    <Popover anchorEl={anchorEl} onClose={onCancel}>
      <div className={styles.popPanel} data-testid="week-editor">
        <input type="week" autoFocus value={w} data-testid="week-input" onChange={(e) => { setW(e.target.value); if (e.target.value) onCommit(e.target.value); }} />
        <div className={styles.popRow}><button className={styles.btn} type="button" onClick={() => onCommit(null)}>{t("column.clear")}</button></div>
      </div>
    </Popover>
  );
}

export const weekUi: ColumnUi<V> = {
  align: "center",
  defaultWidth: 130,
  Cell: ({ value }) => {
    const label = value ? `Week ${isoWeekOf(value.week.startDate).week}` : "";
    return <div className={`${styles.cell} ${styles.center}`} title={value ? `${value.week.startDate} - ${value.week.endDate}` : undefined}>{label}</div>;
  },
  Editor: WeekEditor,
};
