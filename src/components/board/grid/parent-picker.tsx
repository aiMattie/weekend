"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { BoardFull } from "@/lib/board-types";
import { Popover } from "../ui/popover";
import styles from "./grid.module.css";

/** Popover with a search box and the top-level items of the board (target of "convert to subitem"). */
export function ParentPicker({ board, anchorEl, exclude, onPick, onClose }: { board: BoardFull; anchorEl: HTMLElement | null; exclude: string[]; onPick: (itemId: string) => void; onClose: () => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const list = board.items.filter((i) => !i.parentItemId && !exclude.includes(i.id) && i.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <Popover anchorEl={anchorEl} onClose={onClose}>
      <div className={styles.picker} data-testid="parent-picker">
        <div className={styles.pickerTitle}>{t("grid.convert.pickParent")}</div>
        <input className={styles.pickerSearch} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} data-testid="parent-picker-search" />
        <div className={styles.pickerList}>
          {list.map((i) => (
            <button key={i.id} type="button" className={styles.pickerItem} onClick={() => { onClose(); onPick(i.id); }} data-testid="parent-picker-item" data-item-name={i.name}>{i.name}</button>
          ))}
          {list.length === 0 ? <div className={styles.pickerEmpty}>{t("table.noItems")}</div> : null}
        </div>
      </div>
    </Popover>
  );
}
