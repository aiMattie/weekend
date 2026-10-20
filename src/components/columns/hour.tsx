"use client";

import { useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { useT } from "@/lib/i18n/client";
import type { ColumnUi, EditorProps } from "./types";
import styles from "./cells.module.css";

type V = { hour: number; minute: number };
const pad = (n: number) => String(n).padStart(2, "0");

function HourEditor({ value, onCommit, onCancel, anchorEl }: EditorProps<V>) {
  const t = useT();
  const [v, setV] = useState(value ? `${pad(value.hour)}:${pad(value.minute)}` : "");
  return (
    <Popover anchorEl={anchorEl} onClose={onCancel}>
      <div className={styles.popPanel} data-testid="hour-editor">
        <input type="time" autoFocus value={v} data-testid="hour-input" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onCommit(v || null)} />
        <div className={styles.popRow}>
          <button className={styles.btn} type="button" onClick={() => onCommit(null)}>{t("column.clear")}</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={() => onCommit(v || null)} data-testid="hour-save">{t("common.save")}</button>
        </div>
      </div>
    </Popover>
  );
}

export const hourUi: ColumnUi<V> = {
  align: "center",
  defaultWidth: 100,
  Cell: ({ value }) => <div className={`${styles.cell} ${styles.center}`}>{value ? `${pad(value.hour)}:${pad(value.minute)}` : ""}</div>,
  Editor: HourEditor,
};
