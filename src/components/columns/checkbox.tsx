"use client";

import type { ColumnUi } from "./types";
import styles from "./cells.module.css";

type V = { checked: boolean };

/** Checkbox toggles directly from the Cell (no Editor). */
export const checkboxUi: ColumnUi<V> = {
  align: "center",
  defaultWidth: 100,
  Cell: ({ value, onChange, readOnly, column }) => (
    <div className={styles.checkWrap}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={!!value?.checked}
        disabled={readOnly}
        aria-label={column.title}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.checked ? { checked: true } : null)}
      />
    </div>
  ),
};
