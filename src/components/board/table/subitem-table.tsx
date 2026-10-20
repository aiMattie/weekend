"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@vibe/core";
import { Drag, Menu } from "@vibe/icons";
import { useId, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { ItemDto } from "@/lib/board-types";
import { getColumnUi } from "@/components/columns/registry";
import { CellShell } from "./cell-shell";
import { InlineText } from "../ui/inline-text";
import { RowMenu } from "./row-menu";
import { useTable } from "./table-context";
import styles from "./table.module.css";

const SUB_NAME_WIDTH = 280;

function SubRow({ sub, template, cols }: { sub: ItemDto; template: string; cols: ReturnType<typeof useTable>["subColumns"] }) {
  const t = useT();
  const { actions, canEdit, onOpenItem } = useTable();
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: sub.id, disabled: !canEdit });
  return (
    <>
      <div ref={setNodeRef} className={`${styles.subRow} ${isDragging ? styles.rowDragging : ""}`} style={{ gridTemplateColumns: template, transform: CSS.Translate.toString(transform), transition }} data-testid="subitem-row" data-item-id={sub.id} data-item-name={sub.name}>
        <div className={styles.subNameCell}>
          <button type="button" ref={setActivatorNodeRef} className={styles.dragHandle} aria-label={t("grid.drag")} data-testid="subitem-drag-handle" {...listeners} {...attributes}>
            <Icon icon={Drag} size={14} ignoreFocusStyle />
          </button>
          <span className={styles.subName}><InlineText value={sub.name} disabled={!canEdit} testId="subitem-name" onCommit={(v) => void actions.renameItem(sub.id, v)} /></span>
          <button type="button" className={styles.openBtn} onClick={() => onOpenItem(sub.id)} data-testid="open-subitem">{t("table.openItem")}</button>
          <button type="button" className={`${styles.expand} ${styles.rowMenu}`} onClick={(e) => setMenuEl(menuEl ? null : e.currentTarget)} aria-label="menu" data-testid="subitem-menu">
            <Icon icon={Menu} size={16} ignoreFocusStyle />
          </button>
        </div>
        {cols.map((c) => <CellShell key={c.id} item={sub} column={c} className={styles.subCell} />)}
      </div>
      {menuEl ? <RowMenu item={sub} anchorEl={menuEl} onClose={() => setMenuEl(null)} /> : null}
    </>
  );
}

/** Subitems of one item: own header (subitem-scope columns), sortable rows and "+ Add subitem". */
export function SubitemTable({ parent, color }: { parent: ItemDto; color: string }) {
  const t = useT();
  const dndId = useId();
  const { actions, canEdit, subColumns, subNameColumn, subitemsOf } = useTable();
  const subs = subitemsOf(parent.id);
  const cols = subColumns.filter((c) => c.type !== "name");
  const widthOf = (c: (typeof cols)[number]) => c.width ?? getColumnUi(c.type).defaultWidth ?? 120;
  const template = `${SUB_NAME_WIDTH}px ${cols.map((c) => `${widthOf(c)}px`).join(" ")}`;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const submit = async () => {
    const name = draft.trim();
    if (!name) return setAdding(false);
    setDraft("");
    await actions.createItem({ groupId: parent.groupId ?? "", name, parentItemId: parent.id });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = subs.findIndex((s) => s.id === active.id);
    const to = subs.findIndex((s) => s.id === over.id);
    void actions.moveItem(String(active.id), from < to ? { afterId: String(over.id) } : { beforeId: String(over.id) });
  };

  return (
    <div className={styles.subWrap} data-testid="subitem-table">
      <div className={styles.subTable} style={{ ["--sub-color" as string]: color }}>
        {cols.length > 0 || subNameColumn ? (
          <div className={`${styles.subRow} ${styles.subHeader}`} style={{ gridTemplateColumns: template }}>
            <div className={styles.subNameCell}>{subNameColumn?.title ?? "Subitem"}</div>
            {cols.map((c) => <div key={c.id} className={styles.subCell}>{c.title}</div>)}
          </div>
        ) : null}
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={subs.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {subs.map((s) => <SubRow key={s.id} sub={s} template={template} cols={cols} />)}
          </SortableContext>
        </DndContext>
        {canEdit ? (
          <div className={styles.subRow} style={{ gridTemplateColumns: template }}>
            <div className={styles.subNameCell} style={{ color: "#9699a6" }}>
              {adding ? (
                <input
                  className={styles.addInput}
                  autoFocus
                  value={draft}
                  data-testid="add-subitem-input"
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => void submit().then(() => setAdding(false))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submit();
                    if (e.key === "Escape") { setDraft(""); setAdding(false); }
                  }}
                />
              ) : (
                <span style={{ cursor: "text", flex: 1 }} onClick={() => setAdding(true)} data-testid="add-subitem">{t("table.addSubitem")}</span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
