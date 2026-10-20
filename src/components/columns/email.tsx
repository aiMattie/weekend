"use client";

import { InlineInputEditor } from "./text";
import type { ColumnUi, EditorProps } from "./types";
import styles from "./cells.module.css";

type V = { email: string; text: string };

function EmailEditor({ value, onCommit, onCancel }: EditorProps<V>) {
  return <InlineInputEditor initial={value?.email ?? ""} onCommit={(v) => onCommit(v.trim() === "" ? null : v.trim())} onCancel={onCancel} />;
}

export const emailUi: ColumnUi<V> = {
  align: "left",
  editorMode: "inline",
  defaultWidth: 200,
  Cell: ({ value }) => (
    <div className={styles.cell}>
      {value ? <a className={styles.link} href={`mailto:${value.email}`} onClick={(e) => e.stopPropagation()}>{value.text || value.email}</a> : null}
    </div>
  ),
  Editor: EmailEditor,
};
