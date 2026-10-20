"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { BoardFull, ColumnDto, ItemDto, NavData } from "@/lib/board-types";
import { getColumnUi } from "@/components/columns/registry";
import { getColumnLogic } from "@/server/columns/registry";
import { Popover } from "../ui/popover";
import styles from "./grid.module.css";

/** Choose a column to update on every selected item, then enter the value with the column's own editor. */
export function UpdateColumnPicker({ board, anchorEl, onApply, onClose }: { board: BoardFull; anchorEl: HTMLElement | null; onApply: (columnId: string, value: unknown) => void; onClose: () => void }) {
  const t = useT();
  const [column, setColumn] = useState<ColumnDto | null>(null);
  const pending = useRef<{ value: unknown } | null>(null);
  const cols = board.columns.filter((c) => c.scope === "item" && c.type !== "name" && !getColumnLogic(c.type).readOnly && !!getColumnUi(c.type).Editor);

  if (!column) {
    return (
      <Popover anchorEl={anchorEl} onClose={onClose}>
        <div className={styles.picker} data-testid="bulk-column-picker">
          <div className={styles.pickerTitle}>{t("bulk.pickColumn")}</div>
          <div className={styles.pickerList}>
            {cols.map((c) => <button key={c.id} type="button" className={styles.pickerItem} onClick={() => setColumn(c)} data-testid={`bulk-column-${c.key}`}>{c.title}</button>)}
          </div>
        </div>
      </Popover>
    );
  }
  const ui = getColumnUi(column.type);
  const Editor = ui.Editor!;
  const dummy: ItemDto = { id: "bulk", boardId: board.board.id, groupId: null, parentItemId: null, name: "", values: {}, position: 0, creatorId: null, createdAt: "", updatedAt: "", subitemCount: 0, updateCount: 0 };
  const props = {
    board, column, item: dummy, readOnly: false, subitems: [] as ItemDto[], value: null, anchorEl,
    onCommit: (value: unknown, opts?: { keepOpen?: boolean }) => {
      if (opts?.keepOpen) pending.current = { value };
      else { onClose(); onApply(column.id, value); }
    },
    onCancel: () => {
      onClose();
      if (pending.current) onApply(column.id, pending.current.value);
    },
  };
  if ((ui.editorMode ?? "popover") === "popover") return <Editor {...props} />;
  return (
    <Popover anchorEl={anchorEl} onClose={props.onCancel}>
      <div style={{ padding: 8, minWidth: 220 }} data-testid="bulk-value-inline"><Editor {...props} anchorEl={null} /></div>
    </Popover>
  );
}

/** Move the selection to a group of this board or to another board. */
export function MoveToPicker({ board, anchorEl, onMove, onClose }: { board: BoardFull; anchorEl: HTMLElement | null; onMove: (to: { groupId?: string; boardId?: string }) => void; onClose: () => void }) {
  const t = useT();
  const [nav, setNav] = useState<NavData | null>(null);
  useEffect(() => {
    let alive = true;
    api.get<NavData>("/api/v1/nav").then((n) => alive && setNav(n)).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const others = nav?.boards.filter((b) => b.id !== board.board.id && b.kind === "board") ?? [];
  const wsName = (id: string) => nav?.workspaces.find((w) => w.id === id)?.name ?? "";
  return (
    <Popover anchorEl={anchorEl} onClose={onClose}>
      <div className={styles.picker} data-testid="bulk-move-picker">
        <div className={styles.pickerTitle}>{t("bulk.moveToGroup")}</div>
        <div className={styles.pickerList}>
          {board.groups.map((g) => (
            <button key={g.id} type="button" className={styles.pickerItem} onClick={() => { onClose(); onMove({ groupId: g.id }); }} data-testid={`bulk-move-group-${g.id}`}>
              <span className={styles.dot} style={{ background: g.color }} /> {g.title}
            </button>
          ))}
        </div>
        <div className={styles.pickerTitle}>{t("bulk.moveToBoard")}</div>
        <div className={styles.pickerList}>
          {others.map((b) => (
            <button key={b.id} type="button" className={styles.pickerItem} onClick={() => { onClose(); onMove({ boardId: b.id }); }} data-testid={`bulk-move-board-${b.id}`} data-board-name={b.name}>
              {b.name} <span className={styles.muted}>{wsName(b.workspaceId)}</span>
            </button>
          ))}
          {nav && others.length === 0 ? <div className={styles.pickerEmpty}>{t("bulk.noOtherBoards")}</div> : null}
        </div>
      </div>
    </Popover>
  );
}
