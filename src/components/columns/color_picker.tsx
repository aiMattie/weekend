"use client";

import { WEEKEND_COLORS } from "@/lib/colors";
import { Popover } from "@/components/board/ui/popover";
import { useT } from "@/lib/i18n/client";
import type { ColumnUi, EditorProps } from "./types";
import pack from "./pack.module.css";
import styles from "./cells.module.css";

type V = { color: { hex: string } };

function ColorEditor({ value, onCommit, onCancel, anchorEl }: EditorProps<V>) {
  const t = useT();
  const cur = value?.color.hex;
  return (
    <Popover anchorEl={anchorEl} onClose={onCancel}>
      <div className={pack.palette} data-testid="color-editor">
        {WEEKEND_COLORS.map((c) => (
          <button key={c.hex} type="button" aria-label={c.name} data-testid={`color-${c.hex.slice(1)}`} className={`${pack.paletteItem} ${cur === c.hex ? pack.paletteOn : ""}`} style={{ background: c.hex }} onClick={() => onCommit({ color: { hex: c.hex } })} />
        ))}
      </div>
      <div className={styles.popPanel} style={{ minWidth: 0, paddingTop: 0 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>{t("col.color.custom")}<input type="color" value={cur ?? "#0073ea"} style={{ width: 40, padding: 0 }} onChange={(e) => onCommit({ color: { hex: e.target.value } }, { keepOpen: true })} /></label>
        <button type="button" className={styles.btn} onClick={() => onCommit(null)}>{t("column.clear")}</button>
      </div>
    </Popover>
  );
}

export const colorPickerUi: ColumnUi<V> = {
  align: "center",
  defaultWidth: 100,
  Cell: ({ value }) => (
    <div className={`${styles.cell} ${styles.center}`}>
      {value ? <span className={pack.swatch} style={{ background: value.color.hex }} title={value.color.hex} data-testid="color-swatch" /> : null}
    </div>
  ),
  Editor: ColorEditor,
};
