"use client";

import { useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { api } from "@/lib/api-client";
import { LabelEditor } from "./menu/label-editor";
import type { DropdownLabel } from "@/server/columns/labels";
import { useT } from "@/lib/i18n/client";
import type { ColumnUi, EditorProps } from "./types";
import { LabelPill } from "./shared";
import styles from "./cells.module.css";

type V = { ids: number[] };
const labelsOf = (s: Record<string, unknown>) => ((s.labels as DropdownLabel[] | undefined) ?? []);
const COLORS = ["#579bfc", "#a25ddc", "#00c875", "#fdab3d", "#ff158a", "#66ccff", "#cab641", "#7f5347"];

function DropdownEditor({ column, board, value, onCommit, onCancel, anchorEl }: EditorProps<V>) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const multi = column.settings.allowMultiple !== false;
  const selected = new Set(value?.ids ?? []);
  const toggle = (id: number) => {
    if (!multi) return onCommit({ ids: selected.has(id) ? [] : [id] });
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onCommit({ ids: [...next] }, { keepOpen: true });
  };
  return (
    <Popover anchorEl={anchorEl} onClose={editing ? () => undefined : onCancel}>
      <div className={styles.optionList} data-testid="dropdown-editor">
        {labelsOf(column.settings).map((l) => (
          <button key={l.id} type="button" className={`${styles.option} ${selected.has(l.id) ? styles.optionSelected : ""}`} onClick={() => toggle(l.id)}>
            <input type="checkbox" readOnly checked={selected.has(l.id)} className={styles.checkbox} />
            <span>{l.text}</span>
          </button>
        ))}
        {!labelsOf(column.settings).length ? <span className={styles.muted} style={{ padding: 8 }}>{t("common.none")}</span> : null}
      </div>
      {board.permissions.editStructure ? (
        <div className={styles.statusFooter}><button type="button" className={styles.btn} data-testid="dropdown-edit-labels" onClick={() => setEditing(true)}>{t("col.labels.edit")}</button></div>
      ) : null}
      {editing ? <LabelEditor column={column} onClose={() => { setEditing(false); onCancel(); }} onSave={(labels) => void api.patch(`/api/v1/columns/${column.id}`, { settings: { labels } })} /> : null}
    </Popover>
  );
}

export const dropdownUi: ColumnUi<V> = {
  align: "left",
  defaultWidth: 170,
  Cell: ({ value, column }) => {
    const labels = labelsOf(column.settings);
    return (
      <div className={styles.cell}>
        <div className={styles.pills}>
          {(value?.ids ?? []).map((id) => {
            const l = labels.find((x) => x.id === id);
            return <LabelPill key={id} text={l?.text ?? String(id)} color={COLORS[id % COLORS.length]} />;
          })}
        </div>
      </div>
    );
  },
  Editor: DropdownEditor,
};
