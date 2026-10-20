"use client";

import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Icon } from "@vibe/core";
import { DropdownChevronDown, DropdownChevronLeft, DropdownChevronRight } from "@vibe/icons";
import { useMemo, useState } from "react";
import { UserAvatar } from "@/components/columns/shared";
import { useLocale, useT } from "@/lib/i18n/client";
import type { ItemDto } from "@/lib/board-types";
import { formatDay, isoWeek, rangesOverlap, startOfWeek, todayDay, type DayRange } from "@/modules/views/lib/dates";
import { formatShort } from "@/modules/views/lib/format";
import { aggregateWorkload, bucketLoad, capacityFor, LEVEL_COLORS, reassignInput, UNASSIGNED, type PersonLoad, type WorkloadConfig } from "@/modules/views/lib/workload";
import { num, oneOf, resolveColumn } from "@/modules/views/lib/settings";
import { EmptyConfig } from "@/modules/views/ui/empty-config";
import { useViewSettings } from "@/modules/views/ui/use-view-settings";
import { useVisibleItems } from "@/modules/views/ui/use-visible-items";
import { ViewFrame } from "@/modules/views/ui/view-frame";
import frame from "@/modules/views/ui/views.module.css";
import styles from "@/modules/views/ui/workload.module.css";
import type { ViewProps } from "./types";

export function WorkloadView(props: ViewProps) {
  const { board, view, viewState, actions, onOpenItem, canEdit, canEditStructure } = props;
  const t = useT();
  const locale = useLocale();
  const { settings, patch } = useViewSettings(view, actions, canEditStructure);
  const items = useVisibleItems(board, viewState);
  const peopleCol = resolveColumn(board.columns, settings.peopleColumnId, ["people"]);
  const dateCol = resolveColumn(board.columns, settings.dateColumnId, ["timeline", "date"]);
  const estimateCol = resolveColumn(board.columns, settings.estimateColumnId, ["numbers"], false);
  const gran = oneOf(settings.granularity, ["day", "week"] as const, "week");
  const cfg: WorkloadConfig = useMemo(() => ({
    mode: oneOf(settings.mode, ["hours", "items"] as const, "hours"),
    capacityPerDay: num(settings.capacityPerDay, 8),
    defaultDailyHours: num(settings.defaultDailyHours, 4),
    capacityByUser: (settings.capacityByUser as Record<string, number> | undefined) ?? {},
  }), [settings.mode, settings.capacityPerDay, settings.defaultDailyHours, settings.capacityByUser]);
  const unit = cfg.mode === "hours" ? "u" : "";
  const [anchor, setAnchor] = useState(startOfWeek(todayDay()));
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const buckets: DayRange[] = useMemo(() => (gran === "week"
    ? Array.from({ length: 8 }, (_, i) => ({ start: anchor + i * 7, end: anchor + i * 7 + 6 }))
    : Array.from({ length: 14 }, (_, i) => ({ start: anchor + i, end: anchor + i }))), [anchor, gran]);
  const period: DayRange = { start: buckets[0].start, end: buckets[buckets.length - 1].end };

  const loads = useMemo(() => (peopleCol && dateCol ? aggregateWorkload(items, peopleCol.id, dateCol, estimateCol ?? null, cfg) : new Map<string, PersonLoad>()), [items, peopleCol, dateCol, estimateCol, cfg]);
  const people = useMemo(() => [...board.users.filter((u) => !u.isAiAgent).map((u) => ({ id: u.id, name: u.name, user: u })), { id: UNASSIGNED, name: t("toolbar.unassigned"), user: null }], [board.users, t]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    if (!e.over || !peopleCol || !canEdit) return;
    const from = String(e.active.data.current?.personId);
    const to = String(e.over.id).replace(/^person:/, "");
    const item = itemById.get(String(e.active.data.current?.itemId));
    if (!item || from === to) return;
    void actions.setValue(item.id, peopleCol.id, reassignInput(item, peopleCol.id, from, to));
  };

  const step = (dir: 1 | -1) => setAnchor((a) => a + dir * (gran === "week" ? 28 : 7));
  const controls = (
    <>
      <button type="button" className={frame.navBtn} onClick={() => setAnchor(startOfWeek(todayDay()))} data-testid="wl-today">{t("vw.cal.today")}</button>
      <button type="button" className={frame.navBtn} onClick={() => step(-1)} aria-label={t("vw.prev")} data-testid="wl-prev"><Icon icon={DropdownChevronLeft} size={16} ignoreFocusStyle /></button>
      <button type="button" className={frame.navBtn} onClick={() => step(1)} aria-label={t("vw.next")} data-testid="wl-next"><Icon icon={DropdownChevronRight} size={16} ignoreFocusStyle /></button>
      <div className={frame.segmented} role="group">
        {(["day", "week"] as const).map((g) => <button key={g} type="button" aria-pressed={gran === g} onClick={() => patch({ granularity: g })} data-testid={`wl-gran-${g}`}>{t(`vw.zoom.${g}`)}</button>)}
      </div>
      <span className={styles.legend}>
        {(["low", "ok", "over"] as const).map((l) => <span key={l} className={styles.legendItem}><i style={{ background: LEVEL_COLORS[l] }} />{t(`vw.wl.${l}`)}</span>)}
      </span>
    </>
  );

  const label = (b: DayRange) => (gran === "week" ? `W${isoWeek(b.start + 3)} · ${formatShort(locale, b.start)}` : `${formatShort(locale, b.start)}`);
  const dragging = dragId ? itemById.get(dragId) : null;

  return (
    <ViewFrame props={props} settings={settings} patch={patch} controls={controls} testId="workload-view">
      {!peopleCol || !dateCol ? (
        <EmptyConfig messageKey="vw.wl.needColumns" createType={!peopleCol ? "people" : "timeline"} createTitle={!peopleCol ? "People" : "Timeline"} canCreate={canEditStructure} onCreate={() => void actions.createColumn(!peopleCol ? { title: "People", type: "people" } : { title: "Timeline", type: "timeline" })} />
      ) : (
        <DndContext id="workload-dnd" sensors={sensors} onDragStart={(e) => setDragId(String(e.active.data.current?.itemId))} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
          <div className={styles.table} data-testid="workload-table">
            <div className={styles.headRow} style={{ gridTemplateColumns: `220px repeat(${buckets.length}, minmax(${gran === "week" ? 96 : 64}px, 1fr))` }}>
              <div className={styles.headCell} />
              {buckets.map((b) => <div key={b.start} className={`${styles.headCell} ${b.start <= todayDay() && todayDay() <= b.end ? styles.headToday : ""}`}>{label(b)}</div>)}
            </div>
            {people.map((p) => {
              const load = loads.get(p.id);
              const mine = (load?.items ?? []).filter((l) => rangesOverlap(l.range, period));
              if (p.id === UNASSIGNED && !mine.length) return null;
              const isCollapsed = collapsed.includes(p.id);
              return (
                <PersonBlock key={p.id} id={p.id} testName={p.name}>
                  <div className={styles.row} style={{ gridTemplateColumns: `220px repeat(${buckets.length}, minmax(${gran === "week" ? 96 : 64}px, 1fr))` }} data-testid="wl-row" data-person={p.id} data-person-name={p.name}>
                    <div className={styles.person} onClick={() => setCollapsed((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))}>
                      <Icon icon={isCollapsed ? DropdownChevronRight : DropdownChevronDown} size={14} ignoreFocusStyle />
                      {p.user ? <UserAvatar user={p.user} size="xs" /> : null}
                      <span className={styles.personName}>{p.name}</span>
                      {p.user ? <CapacityInput value={capacityFor(p.id, cfg)} unit={unit} disabled={!canEditStructure} onChange={(v) => patch({ capacityByUser: { ...(cfg.capacityByUser ?? {}), [p.id]: v } })} /> : null}
                    </div>
                    {buckets.map((b) => {
                      const bl = bucketLoad(load ?? { id: p.id, perDay: new Map(), items: [] }, b, cfg);
                      const hasCap = p.id !== UNASSIGNED;
                      return (
                        <div key={b.start} className={styles.cell} data-testid="wl-cell" data-person={p.id} data-bucket={formatDay(b.start)} data-level={bl.level} data-load={bl.load}>
                          {bl.load > 0 ? (
                            <div className={styles.fill} style={{ background: hasCap ? LEVEL_COLORS[bl.level] : "#e1e3ea", width: `${Math.min(100, hasCap && bl.capacity ? (bl.load / bl.capacity) * 100 : 100)}%` }} />
                          ) : null}
                          <span className={styles.cellText}>{bl.load > 0 ? `${bl.load}${unit}${hasCap ? ` / ${bl.capacity}${unit}` : ""}` : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                  {isCollapsed || !mine.length ? null : (
                    <div className={styles.chips} data-testid="wl-items">
                      {mine.map((l) => { const it = itemById.get(l.itemId); return it ? <Chip key={l.itemId} item={it} personId={p.id} total={l.total} unit={unit} range={l.range} canEdit={canEdit} onOpen={onOpenItem} /> : null; })}
                    </div>
                  )}
                </PersonBlock>
              );
            })}
          </div>
          <DragOverlay dropAnimation={null}>{dragging ? <div className={`${styles.chip} ${styles.chipOverlay}`}>{dragging.name}</div> : null}</DragOverlay>
        </DndContext>
      )}
    </ViewFrame>
  );
}

function PersonBlock({ id, testName, children }: { id: string; testName: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `person:${id}` });
  return <div ref={setNodeRef} className={`${styles.block} ${isOver ? styles.blockOver : ""}`} data-testid="wl-person" data-person={id} data-person-name={testName}>{children}</div>;
}

function Chip({ item, personId, total, unit, range, canEdit, onOpen }: { item: ItemDto; personId: string; total: number; unit: string; range: DayRange; canEdit: boolean; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${personId}:${item.id}`, data: { itemId: item.id, personId }, disabled: !canEdit });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={`${styles.chip} ${isDragging ? styles.chipDrag : ""}`} data-testid="wl-item" data-item-id={item.id} data-item-name={item.name} title={`${formatDay(range.start)} – ${formatDay(range.end)}`} onClick={() => onOpen(item.id)}>
      <span className={styles.chipName}>{item.name}</span>
      <span className={styles.chipHours}>{Math.round(total * 10) / 10}{unit}</span>
    </div>
  );
}

function CapacityInput({ value, unit, disabled, onChange }: { value: number; unit: string; disabled: boolean; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => { const n = Number(draft); setDraft(null); if (Number.isFinite(n) && n > 0 && n <= 24 && n !== value) onChange(n); };
  return (
    <span className={styles.cap} onClick={(e) => e.stopPropagation()} title="capacity / day">
      <input className={styles.capInput} type="number" min={1} max={24} disabled={disabled} value={draft ?? value} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} data-testid="wl-capacity" />
      <span>{unit}/d</span>
    </span>
  );
}

