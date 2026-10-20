"use client";

import { useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { useT } from "@/lib/i18n/client";
import styles from "./item-panel.module.css";

export interface PickerEntry { id: string; label: string; sub?: string }

/** Small searchable list in a popover (choose a parent item, a target board ...). */
export function Picker({ anchorEl, title, entries, onPick, onClose, testId }: { anchorEl: HTMLElement | null; title: string; entries: PickerEntry[]; onPick: (id: string) => void; onClose: () => void; testId: string }) {
  const t = useT();
  const [q, setQ] = useState("");
  const shown = entries.filter((e) => `${e.label} ${e.sub ?? ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 100);
  return (
    <Popover anchorEl={anchorEl} onClose={onClose} align="end">
      <div className={styles.picker} data-testid={testId}>
        <div className={styles.pickerTitle}>{title}</div>
        <input className={styles.pickerSearch} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} data-testid="picker-search" />
        <div className={styles.pickerList}>
          {shown.map((e) => (
            <button key={e.id} type="button" className={styles.pickerItem} onClick={() => { onClose(); onPick(e.id); }} data-testid="picker-option" data-id={e.id}>
              <span>{e.label}</span>{e.sub ? <small>{e.sub}</small> : null}
            </button>
          ))}
          {shown.length === 0 ? <div className={styles.empty}>{t("common.none")}</div> : null}
        </div>
      </div>
    </Popover>
  );
}
