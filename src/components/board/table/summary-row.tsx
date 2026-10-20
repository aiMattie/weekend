"use client";

import type { ComponentType } from "react";
import type { ColumnDto, ItemDto } from "@/lib/board-types";
import { getColumnUi } from "@/components/columns/registry";
import { getColumnLogic } from "@/server/columns/registry";
import type { ColumnSummary } from "@/server/columns/types";
import { CHAT_WIDTH, gridTemplate, useTable } from "./table-context";
import styles from "./table.module.css";

/**
 * Optional hook for column UIs: `ColumnUi.Summary` (not part of the typed contract yet) replaces the default
 * summary renderer of the footer row. It gets the column, the items of the group and the logic summary.
 */
export type SummaryComponent = ComponentType<{ column: ColumnDto; items: ItemDto[]; summary: ColumnSummary | null }>;

function SummaryCell({ column, items }: { column: ColumnDto; items: ItemDto[] }) {
  const logic = getColumnLogic(column.type);
  const s = logic.summarize ? logic.summarize(items.map((i) => (i.values[column.id] ?? null) as never), { id: column.id, key: column.key, title: column.title, type: column.type, settings: column.settings }) : null;
  const Custom = (getColumnUi(column.type) as { Summary?: SummaryComponent }).Summary;
  const total = s?.segments?.reduce((a, b) => a + b.count, 0) ?? 0;
  return (
    <>
      {Custom ? <Custom column={column} items={items} summary={s} /> : s?.segments ? (
        <div className={styles.bar} title={s.segments.map((x) => `${x.label || "-"}: ${x.count}`).join(", ")}>
          {s.segments.map((x, i) => <div key={i} className={styles.barSeg} style={{ background: x.color, width: `${(x.count / total) * 100}%` }} />)}
        </div>
      ) : s?.text ? (
        <>
          <span>{s.text}</span>
          {column.type === "numbers" ? <span className={styles.summaryLabel}>sum</span> : null}
        </>
      ) : null}
    </>
  );
}

/** Footer row: one summary per column (sum, status distribution bar, date range ...). */
export function SummaryRow({ items }: { items: ItemDto[] }) {
  const { columns, pinned, nameWidth, leftWidth, widthOf } = useTable();
  return (
    <div className={`${styles.row} ${styles.summary}`} style={{ gridTemplateColumns: gridTemplate(leftWidth, columns, widthOf, false) }} data-testid="summary-row">
      <div className={styles.left}>
        <div className={styles.strip} />
        <div className={styles.check} />
        <div className={styles.nameCell} style={{ width: nameWidth + CHAT_WIDTH, flex: "none" }} />
        {pinned.map((c) => (
          <div key={c.id} className={`${styles.summaryCell} ${styles.pinnedSummary}`} style={{ width: widthOf(c) }} data-testid={`summary-${c.key}`}><SummaryCell column={c} items={items} /></div>
        ))}
      </div>
      {columns.map((c) => (
        <div key={c.id} className={styles.summaryCell} data-testid={`summary-${c.key}`}><SummaryCell column={c} items={items} /></div>
      ))}
    </div>
  );
}
