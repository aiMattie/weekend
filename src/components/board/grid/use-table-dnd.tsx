"use client";

import {
  KeyboardSensor, PointerSensor, pointerWithin, closestCenter, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type Over,
} from "@dnd-kit/core";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ItemDto } from "@/lib/board-types";
import type { RenderGroup } from "@/lib/view-state";
import type { DropTarget } from "../table/table-context";
import type { BoardActions } from "../use-board";

interface Opts {
  enabled: boolean;
  actions: BoardActions;
  groups: RenderGroup[];
  collapsed: Set<string>;
  selected: Set<string>;
  rowOrder: string[];
  itemsById: Map<string, ItemDto>;
}

type DragInfo = { type: "item" | "group"; id: string };

/** Pointer Y during/after a drag (keyboard drags fall back to the middle of the dragged rect). */
function pointerY(e: { activatorEvent: Event; delta: { y: number }; active: { rect: { current: { translated: { top: number; height: number } | null } } } }): number {
  const ev = e.activatorEvent as PointerEvent;
  if (typeof ev.clientY === "number") return ev.clientY + e.delta.y;
  const r = e.active.rect.current.translated;
  return r ? r.top + r.height / 2 : 0;
}

/**
 * Drag and drop for rows and groups (columns and subitems have their own nested DndContext).
 * Rows are draggable by their handle and droppable as a whole; the drop edge (before/after) comes
 * from the pointer position over the target row. Nothing moves while dragging (a blue line shows
 * the drop position); the move is committed through `actions.moveItem/moveGroup` on drop.
 */
export function useTableDnd({ enabled, actions, groups, collapsed, selected, rowOrder, itemsById }: Opts) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const [dragging, setDragging] = useState<DragInfo | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dragRef = useRef<DragInfo | null>(null);

  const collision = useCallback<CollisionDetection>((args) => {
    const type = args.active.data.current?.type;
    const ok = args.droppableContainers.filter((c) => {
      const t = c.data.current?.type;
      return type === "group" ? t === "group" : type === "item" ? t === "row" || t === "gtail" || t === "ghead" : false;
    });
    const hit = pointerWithin({ ...args, droppableContainers: ok });
    return hit.length ? hit : closestCenter({ ...args, droppableContainers: ok });
  }, []);

  const targetOf = useCallback((over: Over | null, py: number, d: DragInfo): DropTarget | null => {
    if (!over) return null;
    const data = over.data.current as { type: string; itemId?: string; groupId?: string } | undefined;
    if (!data) return null;
    const mid = over.rect.top + over.rect.height / 2;
    if (d.type === "group") return data.type === "group" && data.groupId && data.groupId !== d.id ? { kind: "group", groupId: data.groupId, edge: py < mid ? "top" : "bottom" } : null;
    if (data.type === "row" && data.itemId && data.itemId !== d.id) return { kind: "row", itemId: data.itemId, edge: py < mid ? "top" : "bottom" };
    if (data.type === "gtail" && data.groupId) return { kind: "group-end", groupId: data.groupId };
    if (data.type === "ghead" && data.groupId) return collapsed.has(data.groupId) ? { kind: "group-end", groupId: data.groupId } : { kind: "group-start", groupId: data.groupId };
    return null;
  }, [collapsed]);

  const onDragStart = useCallback((e: DragStartEvent) => {
    const d = e.active.data.current as { type: "item" | "group"; itemId?: string; groupId?: string } | undefined;
    if (!d) return;
    const info = { type: d.type, id: d.type === "item" ? d.itemId! : d.groupId! };
    dragRef.current = info;
    setDragging(info);
  }, []);

  const onDragMove = useCallback((e: DragMoveEvent) => {
    const cur = dragRef.current;
    if (!cur) return;
    const next = targetOf(e.over, pointerY(e), cur);
    setDropTarget((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [targetOf]);

  const onDragEnd = useCallback((e: DragEndEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(null);
    setDropTarget(null);
    if (!d) return;
    const t = targetOf(e.over, pointerY(e), d);
    if (!t) return;
    if (d.type === "group" && t.kind === "group") {
      void actions.moveGroup(d.id, t.edge === "top" ? { beforeId: t.groupId } : { afterId: t.groupId });
      return;
    }
    if (d.type !== "item") return;
    const ids = selected.has(d.id) && selected.size > 1 ? rowOrder.filter((id) => selected.has(id)) : [d.id];
    void (async () => {
      let prev: string | null = null;
      for (const id of ids) {
        if (t.kind === "row") {
          const r = itemsById.get(t.itemId);
          if (!r) return;
          // several items keep their order: the first goes to the target edge, the others follow it
          const spec = prev ? { afterId: prev } : t.edge === "top" ? { beforeId: r.id } : { afterId: r.id };
          await actions.moveItem(id, { groupId: r.groupId ?? undefined, ...spec });
        } else if (t.kind === "group-end") await actions.moveItem(id, { groupId: t.groupId });
        else await actions.moveItem(id, prev ? { groupId: t.groupId, afterId: prev } : { groupId: t.groupId, top: true });
        prev = id;
      }
    })();
  }, [targetOf, actions, selected, rowOrder, itemsById]);

  const onDragCancel = useCallback(() => {
    dragRef.current = null;
    setDragging(null);
    setDropTarget(null);
  }, []);

  return useMemo(
    () => ({ enabled, sensors, collision, dragging, dropTarget, onDragStart, onDragMove, onDragEnd, onDragCancel, groups }),
    [enabled, sensors, collision, dragging, dropTarget, onDragStart, onDragMove, onDragEnd, onDragCancel, groups],
  );
}
