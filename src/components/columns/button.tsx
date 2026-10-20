"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { contrastText } from "@/lib/colors";
import type { ColumnUi } from "./types";
import pack from "./pack.module.css";
import styles from "./cells.module.css";

export const buttonUi: ColumnUi<unknown> = {
  align: "center",
  defaultWidth: 140,
  Cell: function ButtonCell({ column, item, board }) {
    const [busy, setBusy] = useState(false);
    const color = String(column.settings.color ?? "#0073ea");
    const label = String(column.settings.label ?? "Click me");
    const can = board.permissions.editItems && column.canEdit !== false;
    return (
      <div className={`${styles.cell} ${styles.center}`}>
        <button
          type="button"
          className={pack.btnCell}
          style={{ background: color, color: contrastText(color) }}
          disabled={!can || busy}
          data-testid="button-cell"
          onClick={(e) => {
            e.stopPropagation();
            setBusy(true);
            void api.post(`/api/v1/items/${item.id}/values/${column.id}/action`, { action: "click" }).finally(() => setBusy(false));
          }}
        >
          {label}
        </button>
      </div>
    );
  },
};
