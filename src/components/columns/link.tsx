"use client";

import { useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { useT } from "@/lib/i18n/client";
import type { ColumnUi, EditorProps } from "./types";
import styles from "./cells.module.css";

type V = { url: string; text?: string };

function LinkEditor({ value, onCommit, onCancel, anchorEl }: EditorProps<V>) {
  const t = useT();
  const [url, setUrl] = useState(value?.url ?? "");
  const [text, setText] = useState(value?.text ?? "");
  const save = () => onCommit(url.trim() ? { url: url.trim(), text: text.trim() || undefined } : null);
  return (
    <Popover anchorEl={anchorEl} onClose={onCancel}>
      <div className={styles.popPanel}>
        <input type="url" autoFocus placeholder="https://" value={url} data-testid="link-url" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        <input type="text" placeholder="Text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        <div className={styles.popRow}>
          <button className={styles.btn} type="button" onClick={() => onCommit(null)}>{t("column.clear")}</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={save}>{t("common.save")}</button>
        </div>
      </div>
    </Popover>
  );
}

export const linkUi: ColumnUi<V> = {
  align: "left",
  defaultWidth: 180,
  Cell: ({ value }) => (
    <div className={styles.cell}>
      {value ? (
        <a className={styles.link} href={value.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          {value.text || value.url}
        </a>
      ) : null}
    </div>
  ),
  Editor: LinkEditor,
};
