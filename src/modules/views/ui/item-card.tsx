"use client";

import type { ReactNode } from "react";
import type { BoardFull, ColumnDto, ItemDto } from "@/lib/board-types";
import { CellValue } from "./cell-value";
import styles from "./views.module.css";

interface Props {
  board: BoardFull;
  item: ItemDto;
  fields: ColumnDto[];
  onOpen: (id: string) => void;
  /** accent color on the left edge */
  accent?: string;
  cover?: ReactNode;
  testId?: string;
}

/** These show as chips/avatars without a caption; free text and numbers keep their label. */
const UNLABELED = new Set(["status", "date", "dropdown", "people", "timeline", "tags", "checkbox", "link", "email", "phone", "rating", "vote"]);

/** Item card used by Kanban, Cards and the map popups: name + the chosen column cells. */
export function ItemCard({ board, item, fields, onOpen, accent, cover, testId = "view-card" }: Props) {
  return (
    <div className={styles.card} style={accent ? { borderLeftColor: accent } : undefined} data-testid={testId} data-item-id={item.id} data-item-name={item.name} onClick={() => onOpen(item.id)}>
      {cover}
      <div className={styles.cardName}>{item.name}</div>
      {fields.map((c) => {
        const empty = item.values[c.id] === undefined || item.values[c.id] === null;
        if (empty) return null;
        return (
          <div key={c.id} className={styles.cardField} data-testid={`card-field-${c.key}`}>
            {UNLABELED.has(c.type) ? null : <span className={styles.cardFieldLabel}>{c.title}</span>}
            <span className={`${styles.cardFieldValue} ${UNLABELED.has(c.type) ? styles.cardFieldValueStart : ""}`}><CellValue board={board} column={c} item={item} /></span>
          </div>
        );
      })}
    </div>
  );
}
