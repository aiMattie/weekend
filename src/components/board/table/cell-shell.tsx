"use client";

import { useEffect, useState } from "react";
import { getColumnUi } from "@/components/columns/registry";
import { getColumnLogic } from "@/server/columns/registry";
import type { ColumnDto, ItemDto } from "@/lib/board-types";
import { prefillInput } from "../grid/prefill";
import { useTable } from "./table-context";
import styles from "./table.module.css";

/**
 * One grid cell: renders the column's `Cell`, and mounts its `Editor` on click (see
 * src/components/columns/types.ts). Handles optimistic commit through `actions.setValue`.
 */
export function CellShell({ item, column, className, subitems }: { item: ItemDto; column: ColumnDto; className?: string; subitems?: ItemDto[] }) {
  const { board, actions, canEdit, focus, setFocus, editRequest, clearEditRequest } = useTable();
  const isSub = !!item.parentItemId;
  const focused = !isSub && focus?.itemId === item.id && focus.columnId === column.id;
  const ui = getColumnUi(column.type);
  const logic = getColumnLogic(column.type);
  const readOnly = !canEdit || !!logic.readOnly || column.canEdit === false;
  const [editing, setEditing] = useState(false);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const Editor = ui.Editor;
  const value = (item.values[column.id] ?? null) as never;
  const ctx = { board, column, item, readOnly, subitems: subitems ?? [] };
  const mode = ui.editorMode ?? "popover";

  /** close the editor and hand keyboard focus back to the grid so arrows/Enter keep working */
  const closeEditor = () => {
    setEditing(false);
    if (isSub) return;
    requestAnimationFrame(() => {
      const grid = document.querySelector<HTMLElement>('[data-testid="board-table"]');
      const a = document.activeElement;
      // never steal focus from something the user clicked on meanwhile (search box, dialogs ...)
      const typing = !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || (a as HTMLElement).isContentEditable);
      const editorOpen = !!grid?.querySelector("input:not([type=checkbox]), textarea");
      if (grid && !typing && !editorOpen && (!a || a === document.body || grid.contains(a))) grid.focus({ preventScroll: true });
    });
  };
  const commit = (input: unknown, opts?: { keepOpen?: boolean }) => {
    if (!opts?.keepOpen) closeEditor();
    void actions.setValue(item.id, column.id, input);
  };
  const Cell = ui.Cell;

  // keyboard: Enter / typing on the focused cell opens its editor
  useEffect(() => {
    if (isSub || !editRequest || editRequest.itemId !== item.id || editRequest.columnId !== column.id) return;
    clearEditRequest();
    if (!Editor || readOnly) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditing(true);
    if (editRequest.char && mode === "inline") prefillInput(el, editRequest.char);
  }, [editRequest, isSub, item.id, column.id, Editor, readOnly, clearEditRequest, mode, el]);

  return (
    <div
      ref={setEl}
      className={`${className ?? styles.cell} ${Editor && !readOnly ? styles.cellEditable : ""} ${editing ? styles.cellEditing : ""} ${focused ? styles.cellFocused : ""}`}
      data-testid={`cell-${column.key}`}
      data-column-type={column.type}
      data-cell-key={isSub ? undefined : `${item.id}:${column.id}`}
      data-focused={focused || undefined}
      onMouseDown={() => { if (!isSub) setFocus({ itemId: item.id, columnId: column.id }); }}
      onClick={() => {
        if (Editor && !readOnly && !editing) setEditing(true);
      }}
    >
      {editing && Editor && mode === "inline" ? (
        <Editor {...ctx} value={value} anchorEl={el} onCommit={commit} onCancel={closeEditor} />
      ) : (
        <Cell {...ctx} value={value} onChange={(input) => void actions.setValue(item.id, column.id, input)} />
      )}
      {editing && Editor && mode === "popover" ? (
        <Editor {...ctx} value={value} anchorEl={el} onCommit={commit} onCancel={closeEditor} />
      ) : null}
    </div>
  );
}
