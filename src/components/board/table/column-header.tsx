"use client";

import { Icon } from "@vibe/core";
import { Add, DropdownChevronDown } from "@vibe/icons";
import { useRef, useState } from "react";
import { ColumnCenter } from "@/components/columns/menu/column-center";
import { ColumnMenu } from "@/components/columns/menu/column-menu";
import { useT } from "@/lib/i18n/client";
import type { ColumnDto } from "@/lib/board-types";
import { InlineText } from "../ui/inline-text";
import { useTable } from "./table-context";
import styles from "./table.module.css";

export function ColumnHeader({ column }: { column: ColumnDto }) {
  const { board, actions, canEditStructure, setViewState, viewState, widthOf, setWidth } = useTable();
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  const onResizeDown = (e: React.MouseEvent) => {
    if (!canEditStructure) return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = { startX: e.clientX, startW: widthOf(column) };
    let last = drag.current.startW;
    const move = (ev: MouseEvent) => {
      last = Math.max(60, drag.current!.startW + ev.clientX - drag.current!.startX);
      setWidth(column.id, last);
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      void actions.updateColumn(column.id, { width: Math.round(last) });
      drag.current = null;
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  return (
    <div className={styles.colHeader} data-testid={`col-header-${column.key}`} title={column.description ?? undefined}>
      <InlineText value={column.title} disabled={!canEditStructure} editing={renaming} onEditingChange={setRenaming} onCommit={(v) => void actions.updateColumn(column.id, { title: v })} className={styles.colTitle} />
      <button type="button" className={`${styles.expand} ${styles.colMenuBtn}`} aria-label="column menu" data-testid="column-menu" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => setMenuEl(menuEl ? null : e.currentTarget)}>
        <Icon icon={DropdownChevronDown} size={16} ignoreFocusStyle />
      </button>
      {menuEl ? (
        <ColumnMenu column={column} board={board} anchorEl={menuEl} onClose={() => setMenuEl(null)} actions={actions} viewState={viewState} setViewState={setViewState} canEditStructure={canEditStructure} onRename={() => setRenaming(true)} />
      ) : null}
      <div className={styles.resize} onPointerDown={(e) => e.stopPropagation()} onMouseDown={onResizeDown} />
    </div>
  );
}

/** "+" at the end of the header row: opens the Column center. */
export function AddColumnButton() {
  const t = useT();
  const { board, actions, canEditStructure } = useTable();
  const [open, setOpen] = useState(false);
  if (!canEditStructure) return <div className={styles.addCol} />;
  return (
    <div className={styles.addCol}>
      <button type="button" className={styles.addColBtn} onClick={() => setOpen(true)} aria-label={t("table.addColumn")} data-testid="add-column">
        <Icon icon={Add} size={18} ignoreFocusStyle />
      </button>
      {open ? <ColumnCenter board={board} onClose={() => setOpen(false)} onPick={(r) => void actions.createColumn({ title: r.title, type: r.type, settings: Object.keys(r.settings).length ? r.settings : undefined })} /> : null}
    </div>
  );
}
