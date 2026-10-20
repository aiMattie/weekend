"use client";

import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Icon } from "@vibe/core";
import { Add, DropdownChevronDown, DropdownChevronRight } from "@vibe/icons";
import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { ItemDto } from "@/lib/board-types";
import { buildLanes, defaultKanbanColumn, inputAfterLaneMove, isKanbanColumn, NO_VALUE_LANE, type Lane } from "@/modules/views/lib/kanban";
import { bool, pickColumn, resolveCardFields, strList } from "@/modules/views/lib/settings";
import { EmptyConfig } from "@/modules/views/ui/empty-config";
import { ItemCard } from "@/modules/views/ui/item-card";
import { useViewSettings } from "@/modules/views/ui/use-view-settings";
import { useVisibleItems } from "@/modules/views/ui/use-visible-items";
import { ViewFrame } from "@/modules/views/ui/view-frame";
import styles from "@/modules/views/ui/kanban.module.css";
import type { ViewProps } from "./types";

export function KanbanView(props: ViewProps) {
  const { board, view, viewState, actions, onOpenItem, canEdit, canEditStructure } = props;
  const t = useT();
  const { settings, patch } = useViewSettings(view, actions, canEditStructure);
  const items = useVisibleItems(board, viewState);
  const column = pickColumn(board.columns, settings.columnId) ?? defaultKanbanColumn(board.columns);
  const fields = useMemo(() => resolveCardFields(board.columns, settings.cardFieldIds, column ? [column.id] : []), [board.columns, settings.cardFieldIds, column]);
  const collapsed = strList(settings.collapsedLaneIds);
  const hideNoValue = bool(settings.hideNoValueLane, false);
  const lanes = useMemo(() => (column && isKanbanColumn(column) ? buildLanes(column, items, board.users).filter((l) => !(l.isNoValue && hideNoValue && !l.items.length)) : []), [column, items, board.users, hideNoValue]);
  const [dragging, setDragging] = useState<ItemDto | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const toggleLane = (key: string) => patch({ collapsedLaneIds: collapsed.includes(key) ? collapsed.filter((k) => k !== key) : [...collapsed, key] });

  const onDragStart = (e: DragStartEvent) => setDragging(items.find((i) => i.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (!column || !e.over || !canEdit) return;
    const from = String(e.active.data.current?.laneKey);
    const to = String(e.over.id).replace(/^lane:/, "");
    const item = items.find((i) => i.id === e.active.id);
    if (!item || from === to) return;
    void actions.setValue(item.id, column.id, inputAfterLaneMove(column, item, from, to));
  };

  const addCard = async (lane: Lane, name: string) => {
    const group = board.groups[0];
    if (!column || !group || !name.trim()) return;
    const item = await actions.createItem({ groupId: group.id, name: name.trim() });
    if (item && !lane.isNoValue) await actions.setValue(item.id, column.id, inputAfterLaneMove(column, item, NO_VALUE_LANE, lane.key));
  };

  return (
    <ViewFrame props={props} settings={settings} patch={patch} testId="kanban-view">
      {!column ? (
        <EmptyConfig messageKey="vw.kanban.needColumn" createType="status" createTitle="Status" canCreate={canEditStructure} onCreate={() => void actions.createColumn({ title: "Status", type: "status" })} />
      ) : (
        <DndContext id="kanban-dnd" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className={styles.lanes}>
            {lanes.map((lane) => (
              <LaneColumn key={lane.key} lane={lane} title={lane.isNoValue ? t("vw.kanban.noValue") : lane.title} collapsed={collapsed.includes(lane.key)} onToggle={() => toggleLane(lane.key)} canEdit={canEdit} onAdd={(n) => addCard(lane, n)}>
                {lane.items.map((it) => <DraggableCard key={it.id} item={it} laneKey={lane.key} disabled={!canEdit}><ItemCard board={board} item={it} fields={fields} onOpen={onOpenItem} accent={lane.color} testId="kanban-card" /></DraggableCard>)}
              </LaneColumn>
            ))}
          </div>
          <DragOverlay dropAnimation={null}>{dragging ? <div className={styles.overlay}><ItemCard board={board} item={dragging} fields={fields} onOpen={() => undefined} testId="kanban-card-overlay" /></div> : null}</DragOverlay>
        </DndContext>
      )}
    </ViewFrame>
  );
}

function DraggableCard({ item, laneKey, disabled, children }: { item: ItemDto; laneKey: string; disabled: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, data: { laneKey }, disabled });
  return <div ref={setNodeRef} {...attributes} {...listeners} className={`${styles.cardWrap} ${isDragging ? styles.dragging : ""}`}>{children}</div>;
}

function LaneColumn({ lane, title, collapsed, onToggle, canEdit, onAdd, children }: { lane: Lane; title: string; collapsed: boolean; onToggle: () => void; canEdit: boolean; onAdd: (name: string) => void; children: React.ReactNode }) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${lane.key}` });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const submit = () => { if (name.trim()) onAdd(name); setName(""); setAdding(false); };
  return (
    <div ref={setNodeRef} className={`${styles.lane} ${collapsed ? styles.laneCollapsed : ""} ${isOver ? styles.laneOver : ""}`} data-testid="kanban-lane" data-lane-key={lane.key} data-lane-title={title}>
      <div className={styles.laneHead} style={{ background: lane.color }} onClick={onToggle} title={collapsed ? t("vw.kanban.expand") : t("vw.kanban.collapse")} data-testid="kanban-lane-head">
        <Icon icon={collapsed ? DropdownChevronRight : DropdownChevronDown} size={14} ignoreFocusStyle />
        <span className={styles.laneTitle}>{title}</span>
        <span className={styles.laneCount} data-testid="kanban-lane-count">{lane.items.length}</span>
      </div>
      {collapsed ? null : (
        <div className={styles.laneBody}>
          {children}
          {canEdit ? (adding ? (
            <input autoFocus className={styles.addInput} value={name} placeholder={t("vw.kanban.cardName")} onChange={(e) => setName(e.target.value)} onBlur={submit} onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setName(""); setAdding(false); } }} data-testid="kanban-add-input" />
          ) : (
            <button type="button" className={styles.addBtn} onClick={() => setAdding(true)} data-testid="kanban-add-card"><Icon icon={Add} size={14} ignoreFocusStyle />{t("vw.kanban.addCard")}</button>
          )) : null}
        </div>
      )}
    </div>
  );
}
