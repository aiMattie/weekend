"use client";

import type { ColumnUi } from "./types";
import styles from "./cells.module.css";

/** Read-only progress of the subitems: done / total (done = subitem status label with isDone). */
export const subtasksUi: ColumnUi = {
  align: "center",
  defaultWidth: 130,
  Cell: ({ subitems, board }) => {
    if (!subitems.length) return <div className={styles.cell} />;
    const status = board.columns.find((c) => c.scope === "subitem" && c.type === "status");
    const labels = ((status?.settings.labels as { id: number; isDone?: boolean }[] | undefined) ?? []);
    const done = subitems.filter((s) => {
      const idx = (s.values[status?.id ?? ""] as { index?: number } | undefined)?.index;
      return labels.find((l) => l.id === idx)?.isDone;
    }).length;
    return (
      <div className={styles.cell}>
        <div className={styles.progress}>
          <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${(done / subitems.length) * 100}%` }} /></div>
          <span className={styles.progressText}>{done}/{subitems.length}</span>
        </div>
      </div>
    );
  },
};
