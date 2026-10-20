"use client";

import { useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { useT } from "@/lib/i18n/client";
import type { ColumnUi, EditorProps } from "./types";
import styles from "./cells.module.css";

type V = { text: string };

function LongTextEditor({ value, onCommit, onCancel, anchorEl }: EditorProps<V>) {
  const t = useT();
  const [text, setText] = useState(value?.text ?? "");
  return (
    <Popover anchorEl={anchorEl} onClose={onCancel}>
      <div className={styles.popPanel} style={{ width: 320 }}>
        <textarea rows={6} autoFocus value={text} data-testid="cell-textarea" onChange={(e) => setText(e.target.value)} />
        <div className={styles.popRow}>
          <button className={styles.btn} type="button" onClick={onCancel}>{t("common.cancel")}</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={() => onCommit(text.trim() === "" ? null : text)}>{t("common.save")}</button>
        </div>
      </div>
    </Popover>
  );
}

export const longTextUi: ColumnUi<V> = {
  align: "left",
  defaultWidth: 200,
  Cell: ({ value }) => <div className={styles.cell} title={value?.text}>{value?.text.replace(/\s*\n\s*/g, " ") ?? ""}</div>,
  Editor: LongTextEditor,
};
