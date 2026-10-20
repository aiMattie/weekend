"use client";

import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { ColumnDto, ItemDto } from "@/lib/board-types";
import { buildRenderGroups } from "@/lib/view-state";
import type { ViewProps } from "@/components/views/types";
import { BulkBar } from "../grid/bulk-bar";
import { useBoardRuntime } from "../grid/runtime-store";
import { UndoToast } from "../grid/undo-toast";
import { useGridKeys } from "../grid/use-grid-keys";
import { useTableDnd } from "../grid/use-table-dnd";
import { GroupSection } from "./group-section";
import { CHAT_WIDTH, defaultWidthFor, DEFAULT_NAME_WIDTH, LEFT_CHECK, LEFT_STRIP, TableProvider, type EditRequest, type FocusCell, type TableCtx } from "./table-context";
import styles from "./table.module.css";

const storageKey = (boardId: string) => `weekend:collapsed:${boardId}`;

/** The table view: colored groups, column headers, rows, subitems, summary. */
export function BoardTable({ board, viewState, setViewState, actions, onOpenItem, openItemId, editItemId, setEditItemId, canEdit, canEditStructure }: ViewProps) {
  const t = useT();
  const boardId = board.board.id;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [focus, setFocus] = useState<FocusCell | null>(null);
  const [editRequest, setEditRequest] = useState<EditRequest | null>(null);
  const lastSelected = useRef<string | null>(null);
  const runtime = useBoardRuntime(boardId);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(boardId));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch { /* storage unavailable */ }
  }, [boardId]);

  const persistCollapsed = useCallback((next: Set<string>) => {
    setCollapsed(next);
    try { localStorage.setItem(storageKey(boardId), JSON.stringify([...next])); } catch { /* ignore */ }
  }, [boardId]);

  const itemColumns = useMemo(() => board.columns.filter((c) => c.scope === "item").sort((a, b) => a.position - b.position), [board.columns]);
  const nameColumn = itemColumns.find((c) => c.type === "name");
  const visible = useMemo(() => itemColumns.filter((c) => c.type !== "name" && !viewState.hiddenColumnIds.includes(c.id)), [itemColumns, viewState.hiddenColumnIds]);
  const pinIds = useMemo(() => viewState.pinnedColumnIds ?? [], [viewState.pinnedColumnIds]);
  const pinned = useMemo(() => visible.filter((c) => pinIds.includes(c.id)), [visible, pinIds]);
  const columns = useMemo(() => visible.filter((c) => !pinIds.includes(c.id)), [visible, pinIds]);
  const subCols = useMemo(() => board.columns.filter((c) => c.scope === "subitem").sort((a, b) => a.position - b.position), [board.columns]);
  const subNameColumn = subCols.find((c) => c.type === "name");

  const subMap = useMemo(() => {
    const m = new Map<string, ItemDto[]>();
    for (const i of board.items) if (i.parentItemId) m.set(i.parentItemId, [...(m.get(i.parentItemId) ?? []), i]);
    for (const list of m.values()) list.sort((a, b) => a.position - b.position);
    return m;
  }, [board.items]);
  const itemsById = useMemo(() => new Map(board.items.map((i) => [i.id, i])), [board.items]);

  const groups = useMemo(
    () => buildRenderGroups(board.groups, board.items, itemColumns, viewState, board.users),
    [board.groups, board.items, itemColumns, viewState, board.users],
  );
  const rowOrder = useMemo(() => groups.filter((g) => !collapsed.has(g.group.id)).flatMap((g) => g.items.map((i) => i.id)), [groups, collapsed]);
  const colOrder = useMemo<ColumnDto[]>(() => [...(nameColumn ? [nameColumn] : []), ...pinned, ...columns], [nameColumn, pinned, columns]);

  const widthOf = useCallback((c: { id: string; width: number | null; type: string }) => widths[c.id] ?? defaultWidthFor(c as never), [widths]);
  const nameWidth = nameColumn ? (widths[nameColumn.id] ?? nameColumn.width ?? DEFAULT_NAME_WIDTH) : DEFAULT_NAME_WIDTH;
  const leftWidth = LEFT_STRIP + LEFT_CHECK + nameWidth + CHAT_WIDTH + pinned.reduce((a, c) => a + widthOf(c), 0);

  const toggleSet = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };

  const toggleSelect = useCallback((id: string, shift?: boolean) => {
    const last = lastSelected.current; // read now: state updaters run later
    setSelected((cur) => {
      const n = new Set(cur);
      if (shift && last && last !== id && rowOrder.includes(last) && rowOrder.includes(id)) {
        const a = rowOrder.indexOf(last);
        const b = rowOrder.indexOf(id);
        const on = !cur.has(id);
        for (const rid of rowOrder.slice(Math.min(a, b), Math.max(a, b) + 1)) {
          if (on) n.add(rid);
          else n.delete(rid);
        }
      } else if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    lastSelected.current = id;
  }, [rowOrder]);
  const setSelection = useCallback((ids: string[], on: boolean) => {
    setSelected((cur) => {
      const n = new Set(cur);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  }, []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // forget selection of items that disappeared (deleted, archived, moved away)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected((cur) => (cur.size && [...cur].some((id) => !itemsById.has(id)) ? new Set([...cur].filter((id) => itemsById.has(id))) : cur));
  }, [itemsById]);

  const requestEdit = useCallback((f: FocusCell, char?: string) => setEditRequest({ ...f, char, nonce: Date.now() }), []);
  const onKeyDown = useGridKeys({ rowOrder, colOrder, itemsById, actions, canEdit, focus, setFocus, requestEdit, toggleSelect, selected, clearSelection, onOpenItem });

  const dragEnabled = canEdit && !viewState.groupByColumnId && viewState.sort.length === 0;
  const dnd = useTableDnd({ enabled: dragEnabled, actions, groups, collapsed, selected, rowOrder, itemsById });

  const ctx: TableCtx = {
    board, actions, viewState, setViewState, canEdit, canEditStructure, openItemId, onOpenItem, editItemId, setEditItemId,
    columns, pinned, nameColumn, nameWidth, leftWidth, subColumns: subCols, subNameColumn,
    subitemsOf: (id) => subMap.get(id) ?? [],
    widthOf: widthOf as TableCtx["widthOf"],
    setWidth: (id, w) => setWidths((cur) => ({ ...cur, [id]: w })),
    selected, toggleSelect, setSelection,
    focus, setFocus, editRequest, clearEditRequest: () => setEditRequest(null),
    dragEnabled, dragging: dnd.dragging, dropTarget: dnd.dropTarget,
    unread: runtime.unread, rowOrder,
  };

  const draggedItem = dnd.dragging?.type === "item" ? itemsById.get(dnd.dragging.id) : undefined;
  const draggedGroup = dnd.dragging?.type === "group" ? board.groups.find((g) => g.id === dnd.dragging!.id) : undefined;
  const allCollapsed = dnd.dragging?.type === "group" ? new Set(groups.map((g) => g.group.id)) : null;

  return (
    <TableProvider value={ctx}>
      <DndContext id={`board-dnd-${boardId}`} sensors={dnd.sensors} collisionDetection={dnd.collision} onDragStart={dnd.onDragStart} onDragMove={dnd.onDragMove} onDragEnd={dnd.onDragEnd} onDragCancel={dnd.onDragCancel}>
        <div className={styles.scroll} data-testid="board-table" tabIndex={0} onKeyDown={onKeyDown}>
          <div className={styles.table}>
            {groups.length === 0 ? <div className={styles.empty}>{t("table.emptyFiltered")}</div> : null}
            {groups.map((rg) => (
              <GroupSection
                key={rg.group.id}
                rg={rg}
                allGroups={groups}
                collapsed={(allCollapsed ?? collapsed).has(rg.group.id)}
                onToggleCollapse={() => persistCollapsed(toggleSet(collapsed, rg.group.id))}
                onSetAllCollapsed={(all) => persistCollapsed(all ? new Set(groups.map((g) => g.group.id)) : new Set())}
                expanded={expanded}
                toggleExpanded={(id) => setExpanded((s) => toggleSet(s, id))}
              />
            ))}
            {canEditStructure && !viewState.groupByColumnId ? (
              <button type="button" className={styles.addGroupBtn} onClick={() => void actions.createGroup({ top: false })} data-testid="add-group">
                {t("table.addGroup")}
              </button>
            ) : null}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {draggedItem ? <div className={styles.dragCard} data-testid="drag-overlay">{selected.has(draggedItem.id) && selected.size > 1 ? `${selected.size} items` : draggedItem.name}</div> : null}
          {draggedGroup ? <div className={styles.dragCard} style={{ borderLeft: `4px solid ${draggedGroup.color}`, color: draggedGroup.color }}>{draggedGroup.title}</div> : null}
        </DragOverlay>
      </DndContext>
      <BulkBar selected={selected} rowOrder={rowOrder} itemsById={itemsById} onClear={clearSelection} />
      <UndoToast boardId={boardId} onUndo={() => void actions.undo()} onRedo={() => void actions.redo()} />
    </TableProvider>
  );
}
