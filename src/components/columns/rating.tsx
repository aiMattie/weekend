"use client";

import type { ColumnUi } from "./types";
import pack from "./pack.module.css";
import styles from "./cells.module.css";

type V = { rating: number };

export const ratingUi: ColumnUi<V> = {
  align: "center",
  defaultWidth: 150,
  Cell: ({ value, column, onChange, readOnly }) => {
    const max = Number(column.settings.max ?? 5);
    const cur = value?.rating ?? 0;
    return (
      <div className={`${styles.cell} ${styles.center}`}>
        <div className={`${pack.stars} ${readOnly ? "" : pack.starsHover}`} data-testid="rating-stars">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" disabled={readOnly} aria-label={`${n}`} data-testid={`rating-${n}`} className={`${pack.star} ${n <= cur ? pack.starOn : ""}`}
              onClick={(e) => { e.stopPropagation(); onChange(n === cur ? null : n); }}>{"★"}</button>
          ))}
        </div>
      </div>
    );
  },
};
