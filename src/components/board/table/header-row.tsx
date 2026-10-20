"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId } from "react";
import type { ColumnDto } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import { AddColumnButton, ColumnHeader } from "./column-header";
import { gridTemplate, LEFT_CHECK, useTable } from "./table-context";
import styles from "./table.module.css";

function SortableHeader({ column, width, fixed }: { column: ColumnDto; width: number; fixed?: boolean }) {
  const { canEditStructure } = useTable();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id, disabled: !canEditStructure });
  return (
    <div
      ref={setNodeRef}
      className={`${styles.colWrap} ${isDragging ? styles.colDragging : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition, ...(fixed ? { width, flex: "none" } : {}) }}
      data-column-id={column.id}
      {...attributes}
      {...listeners}
    >
      <ColumnHeader column={column} />
    </div>
  );
}

interface Props {
  color: string;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: (on: boolean) => void;
}

/** Column header row of one group (sticky). Columns reorder with a horizontal sortable. */
export function HeaderRow({ color, allSelected, someSelected, onToggleAll }: Props) {
  const t = useT();
  const dndId = useId();
  const { actions, columns, pinned, nameColumn, nameWidth, leftWidth, widthOf, canEdit, canEditStructure, setWidth } = useTable();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const ids = [...pinned, ...columns].map((c) => c.id);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    void actions.moveColumn(String(active.id), from < to ? { afterId: String(over.id) } : { beforeId: String(over.id) });
  };

  const onNameResize = (e: React.MouseEvent) => {
    if (!canEditStructure || !nameColumn) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = nameWidth;
    let last = startW;
    const move = (ev: MouseEvent) => {
      last = Math.max(160, startW + ev.clientX - startX);
      setWidth(nameColumn.id, last);
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      void actions.updateColumn(nameColumn.id, { width: Math.round(last) });
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        <div className={`${styles.row} ${styles.headerRow}`} style={{ gridTemplateColumns: gridTemplate(leftWidth, columns, widthOf, true) }} data-testid="header-row">
          <div className={styles.left}>
            <div className={styles.strip} style={{ background: color }} />
            <div className={styles.check} style={{ width: LEFT_CHECK }}>
              <input
                type="checkbox"
                className={styles.rowCheckbox}
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                disabled={!canEdit}
                onChange={(e) => onToggleAll(e.target.checked)}
                aria-label={t("grid.selectGroup")}
                data-testid="group-checkbox"
              />
            </div>
            <div className={styles.colHeaderName} style={{ width: nameWidth, flex: "none" }} data-testid="col-header-name">
              {nameColumn?.title ?? "Item"}
              <div className={styles.resize} onMouseDown={onNameResize} onPointerDown={(e) => e.stopPropagation()} data-testid="resize-name" />
            </div>
            <div className={styles.chatHead} />
            {pinned.map((c) => <SortableHeader key={c.id} column={c} width={widthOf(c)} fixed />)}
          </div>
          {columns.map((c) => <SortableHeader key={c.id} column={c} width={widthOf(c)} />)}
          <AddColumnButton />
        </div>
      </SortableContext>
    </DndContext>
  );
}
