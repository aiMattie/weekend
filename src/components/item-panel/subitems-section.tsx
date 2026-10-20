"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { BoardFull, ItemDto } from "@/lib/board-types";
import type { BoardActions } from "@/components/board/use-board";
import styles from "./item-panel.module.css";

export function SubitemsSection({ board, item, actions, canEdit, onOpenItem }: { board: BoardFull; item: ItemDto; actions: BoardActions; canEdit: boolean; onOpenItem: (id: string | null) => void }) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const subs = board.items.filter((i) => i.parentItemId === item.id).sort((a, b) => a.position - b.position);
  if (!subs.length && !canEdit) return null;
  return (
    <div className={styles.subs} data-testid="panel-subitems">
      <div className={styles.subsTitle}>{t("panel.subitems")} ({subs.length})</div>
      {subs.map((s) => (
        <button key={s.id} type="button" className={styles.subRow} onClick={() => onOpenItem(s.id)}>{s.name}</button>
      ))}
      {canEdit ? (
        <input
          className={styles.subInput}
          value={draft}
          placeholder={t("table.addSubitem")}
          data-testid="panel-add-subitem"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              const name = draft.trim();
              setDraft("");
              void actions.createItem({ groupId: item.groupId ?? "", name, parentItemId: item.id });
            }
          }}
        />
      ) : null}
    </div>
  );
}
