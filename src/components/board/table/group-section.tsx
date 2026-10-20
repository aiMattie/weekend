"use client";

/* eslint-disable react-hooks/refs -- dnd-kit hands out callback refs and listeners; the lint rule mistakes them for ref objects */

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Icon } from "@vibe/core";
import { Drag, DropdownChevronDown, Menu } from "@vibe/icons";
import { useCallback, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { RenderGroup } from "@/lib/view-state";
import { InlineText } from "../ui/inline-text";
import { AddItemRow } from "./add-item-row";
import { GroupMenu } from "./group-menu";
import { HeaderRow } from "./header-row";
import { ItemRow } from "./item-row";
import { SummaryRow } from "./summary-row";
import { useTable } from "./table-context";
import styles from "./table.module.css";

interface Props {
  rg: RenderGroup;
  allGroups: RenderGroup[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSetAllCollapsed: (all: boolean) => void;
  expanded: Set<string>;
  toggleExpanded: (id: string) => void;
}

export function GroupSection({ rg, allGroups, collapsed, onToggleCollapse, onSetAllCollapsed, expanded, toggleExpanded }: Props) {
  const t = useT();
  const { actions, canEdit, canEditStructure, selected, setSelection, dragEnabled, dragging, dropTarget } = useTable();
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const { group, items, virtual } = rg;
  const structural = canEditStructure && !virtual;
  const groupDragEnabled = structural && !!dragEnabled;
  const ids = items.map((i) => i.id);
  const selectedCount = ids.filter((id) => selected.has(id)).length;

  const gdrag = useDraggable({ id: `group:${group.id}`, data: { type: "group", groupId: group.id }, disabled: !groupDragEnabled });
  const gdrop = useDroppable({ id: `grp:${group.id}`, data: { type: "group", groupId: group.id }, disabled: !groupDragEnabled });
  const hdrop = useDroppable({ id: `ghead:${group.id}`, data: { type: "ghead", groupId: group.id }, disabled: !dragEnabled || !!virtual });
  const setSection = useCallback((el: HTMLElement | null) => { gdrop.setNodeRef(el); gdrag.setNodeRef(el); }, [gdrop, gdrag]);

  const groupEdge = dropTarget?.kind === "group" && dropTarget.groupId === group.id ? dropTarget.edge : null;
  const headOver = (dropTarget?.kind === "group-start" || dropTarget?.kind === "group-end") && dropTarget.groupId === group.id && (collapsed || dropTarget.kind === "group-start");
  const isDragged = dragging?.type === "group" && dragging.id === group.id;

  return (
    <section ref={setSection} className={`${styles.group} ${isDragged ? styles.rowDragging : ""} ${groupEdge === "top" ? styles.groupDropTop : ""} ${groupEdge === "bottom" ? styles.groupDropBottom : ""}`} data-testid={`group-${group.id}`} data-group-title={group.title}>
      <div ref={hdrop.setNodeRef} className={`${styles.groupHeader} ${headOver ? styles.groupHeaderOver : ""}`} data-testid="group-header">
        <div className={styles.groupHeaderInner}>
          {groupDragEnabled ? (
            <button type="button" ref={gdrag.setActivatorNodeRef} className={`${styles.chevron} ${styles.groupDragHandle}`} aria-label={t("grid.drag")} data-testid="group-drag-handle" {...gdrag.listeners} {...gdrag.attributes}>
              <Icon icon={Drag} size={16} ignoreFocusStyle />
            </button>
          ) : null}
          <button type="button" className={styles.chevron} onClick={onToggleCollapse} aria-label={collapsed ? t("table.expandGroup") : t("table.collapseGroup")} data-testid="group-toggle" style={{ color: group.color }}>
            <Icon icon={DropdownChevronDown} size={20} ignoreFocusStyle className={`${styles.chevronIcon} ${collapsed ? styles.chevronCollapsed : ""}`} />
          </button>
          <span className={styles.groupTitle} style={{ color: group.color }} data-testid="group-title">
            <InlineText value={group.title} disabled={!structural} editing={renaming} onEditingChange={setRenaming} onCommit={(v) => void actions.updateGroup(group.id, { title: v })} />
          </span>
          <span className={`${styles.groupCount} ${collapsed ? styles.groupCountShown : ""}`}>{items.length} {items.length === 1 ? t("table.item") : t("table.items")}</span>
          {!virtual ? (
            <button type="button" className={`${styles.chevron} ${styles.groupMenu}`} onClick={(e) => setMenuEl(menuEl ? null : e.currentTarget)} aria-label="group menu" data-testid="group-menu">
              <Icon icon={Menu} size={18} ignoreFocusStyle />
            </button>
          ) : null}
        </div>
      </div>
      {menuEl ? <GroupMenu group={group} allGroups={allGroups} itemIds={ids} anchorEl={menuEl} onClose={() => setMenuEl(null)} onRename={() => setRenaming(true)} onSetAllCollapsed={onSetAllCollapsed} /> : null}

      {collapsed ? null : (
        <>
          <HeaderRow color={group.color} allSelected={ids.length > 0 && selectedCount === ids.length} someSelected={selectedCount > 0} onToggleAll={(on) => setSelection(ids, on)} />
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              color={group.color}
              expanded={expanded.has(item.id)}
              onToggleExpand={() => toggleExpanded(item.id)}
              editable={canEdit}
            />
          ))}
          {canEdit && !virtual ? <AddItemRow groupId={group.id} color={group.color} /> : null}
          <SummaryRow items={items} />
        </>
      )}
    </section>
  );
}
