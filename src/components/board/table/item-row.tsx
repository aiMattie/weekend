"use client";

/* eslint-disable react-hooks/refs -- dnd-kit hands out callback refs and listeners; the lint rule mistakes them for ref objects */

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Icon } from "@vibe/core";
import { AddUpdate, Comment, Drag, DropdownChevronDown, DropdownChevronRight, Menu } from "@vibe/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { ItemDto } from "@/lib/board-types";
import { prefillInput } from "../grid/prefill";
import { InlineText } from "../ui/inline-text";
import { CellShell } from "./cell-shell";
import { RowMenu } from "./row-menu";
import { SubitemTable } from "./subitem-table";
import { gridTemplate, useTable } from "./table-context";
import styles from "./table.module.css";

interface Props {
  item: ItemDto;
  color: string;
  expanded: boolean;
  onToggleExpand: () => void;
  editable: boolean;
}

export function ItemRow({ item, color, expanded, onToggleExpand, editable }: Props) {
  const t = useT();
  const { actions, columns, pinned, nameColumn, nameWidth, leftWidth, widthOf, subitemsOf, openItemId, onOpenItem, editItemId, setEditItemId, selected, toggleSelect, focus, setFocus, editRequest, clearEditRequest, dragEnabled, dragging, dropTarget, unread } = useTable();
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const [nameEditing, setNameEditing] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const subs = subitemsOf(item.id);
  const isOpen = openItemId === item.id;
  const isSelected = selected.has(item.id);
  const editing = nameEditing || editItemId === item.id;
  const unreadCount = unread[item.id] ?? 0;
  const nameFocused = !!nameColumn && focus?.itemId === item.id && focus.columnId === nameColumn.id;

  const drag = useDraggable({ id: `item:${item.id}`, data: { type: "item", itemId: item.id, groupId: item.groupId }, disabled: !dragEnabled });
  const drop = useDroppable({ id: `row:${item.id}`, data: { type: "row", itemId: item.id, groupId: item.groupId }, disabled: !dragEnabled });
  const setRef = useCallback((el: HTMLDivElement | null) => {
    rowRef.current = el;
    drag.setNodeRef(el);
    drop.setNodeRef(el);
  }, [drag, drop]);

  // keyboard: Enter / typing on the focused name cell starts renaming
  useEffect(() => {
    if (!editRequest || !nameColumn || editRequest.itemId !== item.id || editRequest.columnId !== nameColumn.id || !editable) return;
    clearEditRequest();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNameEditing(true);
    prefillInput(rowRef.current, editRequest.char);
  }, [editRequest, nameColumn, item.id, editable, clearEditRequest]);

  const edge = dropTarget?.kind === "row" && dropTarget.itemId === item.id ? dropTarget.edge : null;

  return (
    <>
      <div
        ref={setRef}
        className={`${styles.row} ${isOpen ? styles.rowOpen : ""} ${isSelected ? styles.rowSelected : ""} ${dragging?.type === "item" && dragging.id === item.id ? styles.rowDragging : ""} ${edge === "top" ? styles.dropTop : ""} ${edge === "bottom" ? styles.dropBottom : ""}`}
        style={{ gridTemplateColumns: gridTemplate(leftWidth, columns, widthOf, false) }}
        data-testid="item-row"
        data-item-id={item.id}
        data-item-name={item.name}
        data-selected={isSelected || undefined}
      >
        <div className={styles.left}>
          <div className={styles.strip} style={{ background: color }} />
          <div className={styles.check}>
            <button
              type="button"
              ref={drag.setActivatorNodeRef}
              className={`${styles.dragHandle} ${dragEnabled ? "" : styles.dragOff}`}
              aria-label={t("grid.drag")}
              data-testid="row-drag-handle"
             
              {...drag.listeners}
              {...drag.attributes}
            >
              <Icon icon={Drag} size={14} ignoreFocusStyle />
            </button>
            <input
              type="checkbox"
              className={styles.rowCheckbox}
              checked={isSelected}
              onChange={() => undefined}
              onClick={(e) => { e.stopPropagation(); toggleSelect(item.id, e.shiftKey); }}
              aria-label={item.name}
              data-testid="row-checkbox"
            />
          </div>
          <div
            className={`${styles.nameCell} ${nameFocused ? styles.cellFocused : ""}`}
            style={{ width: nameWidth, flex: "none" }}
            data-testid="cell-name"
            data-cell-key={nameColumn ? `${item.id}:${nameColumn.id}` : undefined}
            data-focused={nameFocused || undefined}
            onMouseDown={() => nameColumn && setFocus({ itemId: item.id, columnId: nameColumn.id })}
          >
            {subs.length > 0 || expanded ? (
              <button type="button" className={styles.expand} onClick={onToggleExpand} aria-label={t("table.subitems")} data-testid="expand-subitems">
                <Icon icon={expanded ? DropdownChevronDown : DropdownChevronRight} size={16} ignoreFocusStyle />
              </button>
            ) : (
              <span className={styles.expandSpacer} />
            )}
            <span className={styles.nameText}>
              <InlineText
                value={item.name}
                disabled={!editable}
                testId="item-name"
                editing={editing}
                onEditingChange={(e) => {
                  setNameEditing(e);
                  if (!e && editItemId === item.id) setEditItemId(null);
                }}
                onCommit={(v) => void actions.renameItem(item.id, v)}
              />
            </span>
            {item.subitemCount > 0 ? <span className={styles.subBadge} data-testid="subitem-count">{item.subitemCount}</span> : null}
            <button type="button" className={styles.openBtn} onClick={() => onOpenItem(item.id)} data-testid="open-item">{t("table.openItem")}</button>
            <button type="button" className={`${styles.expand} ${styles.rowMenu}`} onClick={(e) => setMenuEl(menuEl ? null : e.currentTarget)} aria-label="menu" data-testid="row-menu">
              <Icon icon={Menu} size={16} ignoreFocusStyle />
            </button>
          </div>
          <div className={styles.chatCell}>
            <button type="button" className={`${styles.bubble} ${item.updateCount > 0 ? styles.bubbleActive : ""}`} onClick={() => onOpenItem(item.id)} aria-label={t("table.updates")} data-testid="update-bubble" data-unread={unreadCount || undefined}>
              <Icon icon={item.updateCount > 0 ? Comment : AddUpdate} size={item.updateCount > 0 ? 22 : 20} ignoreFocusStyle />
              {item.updateCount > 0 ? <span className={styles.bubbleCount}>{item.updateCount}</span> : null}
              {unreadCount > 0 ? <span className={styles.unreadDot} data-testid="unread-dot" /> : null}
            </button>
          </div>
          {pinned.map((c) => (
            <div key={c.id} className={styles.pinnedWrap} style={{ width: widthOf(c) }}>
              <CellShell item={item} column={c} subitems={subs} />
            </div>
          ))}
        </div>
        {columns.map((c) => (
          <CellShell key={c.id} item={item} column={c} subitems={subs} />
        ))}
      </div>
      {menuEl ? <RowMenu item={item} anchorEl={menuEl} onClose={() => setMenuEl(null)} /> : null}
      {expanded ? <SubitemTable parent={item} color={color} /> : null}
    </>
  );
}
