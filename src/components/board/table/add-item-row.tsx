"use client";

/* eslint-disable react-hooks/refs -- dnd-kit hands out callback refs and listeners; the lint rule mistakes them for ref objects */

import { useDroppable } from "@dnd-kit/core";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { valuesFromFilters } from "@/lib/view-state";
import { CHAT_WIDTH, gridTemplate, useTable } from "./table-context";
import styles from "./table.module.css";

/** "+ Add item" row. Enter creates the item and keeps the input focused for the next one. Also the drop zone at the end of a group. */
export function AddItemRow({ groupId, color }: { groupId: string; color: string }) {
  const t = useT();
  const { actions, columns, board, viewState, nameWidth, leftWidth, widthOf, pinned, dropTarget, dragEnabled } = useTable();
  const allColumns = board.columns;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const drop = useDroppable({ id: `gtail:${groupId}`, data: { type: "gtail", groupId }, disabled: !dragEnabled });
  const over = dropTarget?.kind === "group-end" && dropTarget.groupId === groupId;

  const submit = async () => {
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    await actions.createItem({ groupId, name, values: valuesFromFilters(allColumns, viewState.filters) });
  };

  return (
    <div ref={drop.setNodeRef} className={`${styles.row} ${styles.addRow} ${over ? styles.dropTop : ""}`} style={{ gridTemplateColumns: gridTemplate(leftWidth, columns, widthOf, false) }} data-testid="add-item-row">
      <div className={styles.left}>
        <div className={styles.strip} style={{ background: color, opacity: 0.4 }} />
        <div className={styles.check}><input type="checkbox" className={styles.rowCheckbox} disabled aria-hidden tabIndex={-1} /></div>
        <div className={styles.nameCell} style={{ width: nameWidth + CHAT_WIDTH + pinned.reduce((a, c) => a + widthOf(c), 0), flex: "none" }} onClick={() => setEditing(true)}>
          {editing ? (
            <input
              className={styles.addInput}
              autoFocus
              value={draft}
              placeholder={t("table.addItemPlaceholder")}
              data-testid="add-item-input"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (draft.trim()) void submit();
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
                else if (e.key === "Escape") {
                  setDraft("");
                  setEditing(false);
                }
              }}
            />
          ) : (
            <span className={styles.addPlaceholder} data-testid="add-item">{t("table.addItem")}</span>
          )}
        </div>
      </div>
      <div className={styles.addRowCells} />
    </div>
  );
}
