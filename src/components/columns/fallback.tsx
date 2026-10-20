"use client";

import { useT } from "@/lib/i18n/client";
import { getColumnLogic } from "@/server/columns/registry";
import type { ColumnUi } from "./types";
import styles from "./cells.module.css";

/** Unknown/unimplemented column types: show the formatted raw value muted, not editable. */
export const fallbackUi: ColumnUi = {
  align: "left",
  defaultWidth: 140,
  Cell: function FallbackCell({ value, column }) {
    const t = useT();
    const text = getColumnLogic(column.type).format(value, column);
    return (
      <div className={styles.cell} title={t("table.unsupportedColumn")} style={{ color: "#9699a6" }}>
        {text}
      </div>
    );
  },
};
