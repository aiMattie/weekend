"use client";

import { Icon } from "@vibe/core";
import { DropdownChevronLeft, DropdownChevronRight } from "@vibe/icons";
import { useMemo, useRef, useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { useLocale, useT } from "@/lib/i18n/client";
import type { ColumnDto, ItemDto } from "@/lib/board-types";
import { buildCalEvents } from "@/modules/views/lib/calendar";
import { SERIES_COLORS, statusColor } from "@/modules/views/lib/colors";
import { addMonths, formatDay, layoutWeek, monthGrid, moveRange, resizeRange, startOfWeek, todayDay, valueFromRange, ymdOf, type CalEvent, type DayRange } from "@/modules/views/lib/dates";
import { formatDayTitle, formatMonthTitle, formatWeekTitle, weekdayNames } from "@/modules/views/lib/format";
import { itemColumns, oneOf, resolveColumn, strList } from "@/modules/views/lib/settings";
import { EmptyConfig } from "@/modules/views/ui/empty-config";
import { useViewSettings } from "@/modules/views/ui/use-view-settings";
import { useVisibleItems } from "@/modules/views/ui/use-visible-items";
import { ViewFrame } from "@/modules/views/ui/view-frame";
import styles from "@/modules/views/ui/calendar.module.css";
import frame from "@/modules/views/ui/views.module.css";
import type { ViewProps } from "./types";

type Mode = "month" | "week" | "day";
interface DragState { key: string; kind: "move" | "start" | "end"; delta: number; moved: boolean }

export function CalendarView(props: ViewProps) {
  const { board, view, viewState, actions, onOpenItem, canEdit, canEditStructure } = props;
  const t = useT();
  const locale = useLocale();
  const { settings, patch } = useViewSettings(view, actions, canEditStructure);
  const mode = oneOf<Mode>(settings.mode, ["month", "week", "day"], "month");
  const [anchor, setAnchor] = useState(todayDay());
  const items = useVisibleItems(board, viewState);
  const dateCols = useMemo<ColumnDto[]>(() => {
    const picked = strList(settings.dateColumnIds).map((id) => board.columns.find((c) => c.id === id)).filter((c): c is ColumnDto => !!c);
    if (picked.length || Array.isArray(settings.dateColumnIds) && settings.dateColumnIds.length) return picked;
    return itemColumns(board.columns).filter((c) => c.type === "date" || c.type === "timeline"); // never configured: show every date column
  }, [board.columns, settings.dateColumnIds]);
  const colorCol = resolveColumn(board.columns, settings.colorColumnId, ["status"]);
  const events = useMemo(() => buildCalEvents(items, dateCols), [items, dateCols]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [adding, setAdding] = useState<{ day: number; el: HTMLElement } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const rows = mode === "month" ? monthGrid(anchor) : mode === "week" ? [Array.from({ length: 7 }, (_, i) => startOfWeek(anchor) + i)] : [[anchor]];
  const cols = rows[0].length;
  const today = todayDay();
  const step = (dir: 1 | -1) => setAnchor((a) => (mode === "month" ? addMonths(a, dir) : a + dir * (mode === "week" ? 7 : 1)));
  const title = mode === "month" ? formatMonthTitle(locale, anchor) : mode === "week" ? formatWeekTitle(locale, rows[0][0], rows[0][6]) : formatDayTitle(locale, anchor);

  const previewRange = (ev: CalEvent): DayRange => {
    if (!drag || drag.key !== ev.id) return ev.range;
    return drag.kind === "move" ? moveRange(ev.range, drag.delta) : resizeRange(ev.range, drag.kind, drag.delta);
  };
  const dayAt = (x: number, y: number): number | null => {
    const el = document.elementsFromPoint(x, y).find((e) => e.hasAttribute("data-day"));
    return el ? Number(el.getAttribute("data-day")) : null;
  };

  const startDrag = (e: React.PointerEvent, ev: CalEvent, kind: DragState["kind"]) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const item = itemById.get(ev.itemId);
    if (!item) return;
    const target = e.currentTarget as HTMLElement;
    const x0 = e.clientX; const y0 = e.clientY;
    const origin = dayAt(x0, y0) ?? ev.range.start;
    let moved = false;
    let delta = 0;
    target.setPointerCapture(e.pointerId);
    const onMove = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return;
      if (!canEdit) return;
      moved = true;
      const d = dayAt(m.clientX, m.clientY);
      if (d === null) return;
      delta = d - origin;
      setDrag({ key: ev.id, kind, delta, moved: true });
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      setDrag(null);
      if (!moved) { onOpenItem(ev.itemId); return; }
      if (delta === 0) return;
      const col = board.columns.find((c) => c.id === ev.columnId);
      if (!col) return;
      const next = kind === "move" ? moveRange(ev.range, delta) : resizeRange(ev.range, kind, delta);
      void actions.setValue(ev.itemId, col.id, valueFromRange(col.type, next, item.values[col.id]));
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  const colorOf = (ev: CalEvent, item: ItemDto): string => statusColor(colorCol, item) ?? SERIES_COLORS[Math.max(0, dateCols.findIndex((c) => c.id === ev.columnId)) % SERIES_COLORS.length];

  const addItem = async (day: number, name: string) => {
    const group = board.groups[0];
    const col = dateCols[0];
    if (!group || !col || !name.trim()) return;
    const item = await actions.createItem({ groupId: group.id, name: name.trim() });
    if (item) await actions.setValue(item.id, col.id, valueFromRange(col.type, { start: day, end: day }));
  };

  const controls = (
    <>
      <button type="button" className={frame.navBtn} onClick={() => setAnchor(todayDay())} data-testid="cal-today">{t("vw.cal.today")}</button>
      <button type="button" className={frame.navBtn} onClick={() => step(-1)} aria-label={t("vw.prev")} data-testid="cal-prev"><Icon icon={DropdownChevronLeft} size={16} ignoreFocusStyle /></button>
      <button type="button" className={frame.navBtn} onClick={() => step(1)} aria-label={t("vw.next")} data-testid="cal-next"><Icon icon={DropdownChevronRight} size={16} ignoreFocusStyle /></button>
      <h3 className={frame.periodTitle} data-testid="cal-title">{title}</h3>
      <div className={frame.segmented} role="group">
        {(["month", "week", "day"] as Mode[]).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => patch({ mode: m })} data-testid={`cal-mode-${m}`}>{t(`vw.cal.${m}`)}</button>)}
      </div>
    </>
  );

  const weekdays = weekdayNames(locale, "short");
  return (
    <ViewFrame props={props} settings={settings} patch={patch} controls={controls} testId="calendar-view">
      {!dateCols.length ? (
        <EmptyConfig messageKey="vw.cal.needColumn" createType="date" createTitle="Date" canCreate={canEditStructure} onCreate={() => void actions.createColumn({ title: "Date", type: "date" })} />
      ) : (
        <div className={`${styles.grid} ${drag?.moved ? styles.dragging : ""}`} ref={gridRef} data-testid="cal-grid" data-mode={mode}>
          <div className={styles.head} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {rows[0].map((d, i) => <div key={d} className={styles.headCell}>{mode === "day" ? weekdays[((d + 3) % 7 + 7) % 7] : weekdays[i]}</div>)}
          </div>
          {rows.map((week) => {
            const placed = layoutWeek(events.map((ev) => ({ ...ev, range: previewRange(ev) })), week[0], cols);
            const lanes = placed.reduce((m, p) => Math.max(m, p.lane + 1), 0);
            return (
              <div key={week[0]} className={styles.week} style={{ minHeight: mode === "month" ? Math.max(104, 34 + lanes * 26) : Math.max(320, 34 + lanes * 26) }}>
                <div className={styles.cells} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                  {week.map((d) => {
                    const y = ymdOf(d);
                    const other = mode === "month" && y.month !== ymdOf(anchor).month;
                    return (
                      <div key={d} className={`${styles.cell} ${other ? styles.otherMonth : ""} ${d === today ? styles.today : ""}`} data-day={d} data-date={formatDay(d)} data-testid="cal-day"
                        onClick={(e) => { if (canEdit) setAdding({ day: d, el: e.currentTarget }); }}>
                        <span className={styles.dayNum}>{y.day}</span>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.layer}>
                  {placed.map((p) => {
                    const ev = p.event as CalEvent;
                    const item = itemById.get(ev.itemId);
                    if (!item) return null;
                    const color = colorOf(ev, item);
                    return (
                      <div key={ev.id} className={`${styles.event} ${drag?.key === ev.id ? styles.eventDrag : ""}`}
                        style={{ left: `calc(${(p.startCol / cols) * 100}% + 3px)`, width: `calc(${((p.endCol - p.startCol + 1) / cols) * 100}% - 6px)`, top: 30 + p.lane * 26, background: color, borderRadius: `${p.clippedStart ? 0 : 4}px ${p.clippedEnd ? 0 : 4}px ${p.clippedEnd ? 0 : 4}px ${p.clippedStart ? 0 : 4}px` }}
                        data-testid="cal-event" data-item-id={ev.itemId} data-item-name={item.name} data-start={formatDay(ev.range.start)} data-end={formatDay(ev.range.end)}
                        title={item.name} onPointerDown={(e) => startDrag(e, ev, "move")}>
                        {ev.resizable && canEdit && !p.clippedStart ? <span className={`${styles.handle} ${styles.handleL}`} data-testid="cal-resize-start" onPointerDown={(e) => startDrag(e, ev, "start")} /> : null}
                        <span className={styles.eventText}>{item.name}</span>
                        {ev.resizable && canEdit && !p.clippedEnd ? <span className={`${styles.handle} ${styles.handleR}`} data-testid="cal-resize-end" onPointerDown={(e) => startDrag(e, ev, "end")} /> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {colorCol && dateCols.length ? (
        <div className={styles.legend} data-testid="cal-legend">
          {((colorCol.settings.labels as { id: number; text: string; color: string }[] | undefined) ?? []).filter((l) => l.text && items.some((i) => (i.values[colorCol.id] as { index?: number } | undefined)?.index === l.id)).map((l) => <span key={l.id} className={styles.legendItem}><i style={{ background: l.color }} />{l.text}</span>)}
        </div>
      ) : null}
      {adding ? <AddPopover anchorEl={adding.el} day={adding.day} onClose={() => setAdding(null)} onAdd={(n) => { void addItem(adding.day, n); setAdding(null); }} /> : null}
    </ViewFrame>
  );
}

function AddPopover({ anchorEl, day, onClose, onAdd }: { anchorEl: HTMLElement; day: number; onClose: () => void; onAdd: (name: string) => void }) {
  const t = useT();
  const [name, setName] = useState("");
  return (
    <Popover anchorEl={anchorEl} onClose={onClose} ignoreAnchor={false}>
      <form className={styles.addForm} onSubmit={(e) => { e.preventDefault(); if (name.trim()) onAdd(name); }}>
        <div className={frame.muted}>{formatDay(day)}</div>
        <input autoFocus className={styles.addInput} placeholder={t("vw.cal.newItem")} value={name} onChange={(e) => setName(e.target.value)} data-testid="cal-add-input" />
      </form>
    </Popover>
  );
}

