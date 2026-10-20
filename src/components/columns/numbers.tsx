"use client";

import { getColumnLogic } from "@/server/columns/registry";
import { InlineInputEditor } from "./text";
import type { ColumnUi, EditorProps } from "./types";
import styles from "./cells.module.css";

function NumbersEditor({ value, onCommit, onCancel }: EditorProps<number>) {
  return <InlineInputEditor initial={value === null ? "" : String(value)} inputMode="decimal" align="right" onCommit={(v) => onCommit(v.trim() === "" ? null : v)} onCancel={onCancel} />;
}

export const numbersUi: ColumnUi<number> = {
  align: "left",
  editorMode: "inline",
  defaultWidth: 130,
  Cell: ({ value, column }) => (
    <div className={styles.cell} style={{ justifyContent: "flex-end" }}>
      {getColumnLogic("numbers").format(value, column)}
    </div>
  ),
  Editor: NumbersEditor,
};
