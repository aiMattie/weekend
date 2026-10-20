"use client";

import { Icon } from "@vibe/core";
import { DropdownChevronDown, DropdownChevronRight } from "@vibe/icons";
import { useState } from "react";
import { getColumnUi } from "@/components/columns/registry";
import type { BoardActions } from "@/components/board/use-board";
import { useT } from "@/lib/i18n/client";
import type { BoardFull, ColumnDto, ItemDto } from "@/lib/board-types";
import { getColumnLogic } from "@/server/columns/registry";
import styles from "./item-panel.module.css";

function DetailRow({ board, item, column, canEdit, actions }: { board: BoardFull; item: ItemDto; column: ColumnDto; canEdit: boolean; actions: BoardActions }) {
  const ui = getColumnUi(column.type);
  const logic = getColumnLogic(column.type);
  const readOnly = !canEdit || !!logic.readOnly;
  const [editing, setEditing] = useState(false);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const Editor = ui.Editor;
  const Cell = ui.Cell;
  const value = (item.values[column.id] ?? null) as never;
  const ctx = { board, column, item, readOnly, subitems: board.items.filter((i) => i.parentItemId === item.id) };
  const commit = (input: unknown, opts?: { keepOpen?: boolean }) => {
    if (!opts?.keepOpen) setEditing(false);
    void actions.setValue(item.id, column.id, input);
  };
  return (
    <div className={styles.detailRow} data-testid={`panel-field-${column.key}`}>
      <div className={styles.detailLabel} title={column.title}>{column.title}</div>
      <div ref={setEl} className={`${styles.detailValue} ${Editor && !readOnly ? styles.detailEditable : ""}`} onClick={() => { if (Editor && !readOnly && !editing) setEditing(true); }}>
        {editing && Editor && ui.editorMode === "inline" ? (
          <Editor {...ctx} value={value} anchorEl={el} onCommit={commit} onCancel={() => setEditing(false)} />
        ) : (
          <Cell {...ctx} value={value} onChange={(input) => void actions.setValue(item.id, column.id, input)} />
        )}
        {editing && Editor && ui.editorMode !== "inline" ? <Editor {...ctx} value={value} anchorEl={el} onCommit={commit} onCancel={() => setEditing(false)} /> : null}
      </div>
    </div>
  );
}

/** Collapsible list of the item's column values (shown as "item details" in the panel). */
export function ItemDetails({ board, item, canEdit, actions }: { board: BoardFull; item: ItemDto; canEdit: boolean; actions: BoardActions }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const scope = item.parentItemId ? "subitem" : "item";
  const cols = board.columns.filter((c) => c.scope === scope && c.type !== "name").sort((a, b) => a.position - b.position);
  if (!cols.length) return null;
  return (
    <div className={styles.details} data-testid="panel-details">
      <button type="button" className={styles.detailsToggle} onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="panel-details-toggle">
        <Icon icon={open ? DropdownChevronDown : DropdownChevronRight} size={16} ignoreFocusStyle /> {t("panel.details")} ({cols.length})
      </button>
      {open ? <div className={styles.detailsBody}>{cols.map((c) => <DetailRow key={c.id} board={board} item={item} column={c} canEdit={canEdit} actions={actions} />)}</div> : null}
    </div>
  );
}
