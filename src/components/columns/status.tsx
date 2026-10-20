"use client";

import { useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { api } from "@/lib/api-client";
import { LabelEditor } from "./menu/label-editor";
import { useT } from "@/lib/i18n/client";
import type { StatusLabel } from "@/server/columns/labels";
import type { ColumnUi, EditorProps } from "./types";
import { LabelPill } from "./shared";
import styles from "./cells.module.css";

type V = { index: number };
const labelsOf = (settings: Record<string, unknown>) => ((settings.labels as StatusLabel[] | undefined) ?? []);

/** Status: the label color fills the entire cell . Empty = grey block. */
export const statusUi: ColumnUi<V> = {
  align: "center",
  defaultWidth: 150,
  Cell: ({ value, column }) => {
    const label = value ? labelsOf(column.settings).find((l) => l.id === value.index) : undefined;
    return <LabelPill block text={label?.text ?? ""} color={label?.color ?? "#c4c4c4"} />;
  },
  Editor: StatusEditor,
};

function StatusEditor({ column, board, value, onCommit, onCancel, anchorEl }: EditorProps<V>) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const labels = labelsOf(column.settings).filter((l) => l.text !== "" || l.id === value?.index);
  return (
    <Popover anchorEl={anchorEl} onClose={editing ? () => undefined : onCancel}>
      <div className={styles.statusGrid} data-testid="status-editor">
        {labels.map((l) => (
          <button key={l.id} type="button" className={styles.statusOption} style={{ background: l.color, color: "#fff" }} data-testid="status-option" data-label={l.text} aria-label={l.text || t("column.empty")} onClick={() => onCommit({ index: l.id })}>
            {l.text || t("column.empty")}
          </button>
        ))}
      </div>
      <div className={styles.statusFooter}>
        <button type="button" className={styles.btn} onClick={() => onCommit(null)}>{t("column.clear")}</button>
        {board.permissions.editStructure ? <button type="button" className={styles.btn} data-testid="status-edit-labels" onClick={() => setEditing(true)}>{t("col.labels.edit")}</button> : null}
      </div>
      {editing ? <LabelEditor column={column} onClose={() => { setEditing(false); onCancel(); }} onSave={(labels) => void api.patch(`/api/v1/columns/${column.id}`, { settings: { labels } })} /> : null}
    </Popover>
  );
}
