"use client";

import { useEffect, useRef, useState } from "react";
import type { ColumnUi, EditorProps } from "./types";
import styles from "./cells.module.css";

/** Plain text cell/editor. Also used as the base for numbers/link inline editing. */
export function InlineInputEditor({ initial, onCommit, onCancel, inputMode, align }: { initial: string; onCommit: (v: string) => void; onCancel: () => void; inputMode?: "decimal" | "text"; align?: "right" }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(v);
    else onCancel();
  };
  return (
    <input
      ref={ref}
      className={styles.inlineInput}
      style={align ? { textAlign: align } : undefined}
      inputMode={inputMode}
      value={v}
      data-testid="cell-input"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        else if (e.key === "Escape") {
          e.stopPropagation();
          finish(false);
        }
      }}
    />
  );
}

function TextEditor({ value, onCommit, onCancel }: EditorProps<string>) {
  return <InlineInputEditor initial={value ?? ""} onCommit={(v) => onCommit(v === "" ? null : v)} onCancel={onCancel} />;
}

export const textUi: ColumnUi<string> = {
  align: "left",
  editorMode: "inline",
  defaultWidth: 180,
  Cell: ({ value }) => <div className={styles.cell}>{value ?? ""}</div>,
  Editor: TextEditor,
};
