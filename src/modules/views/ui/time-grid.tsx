"use client";

import { Icon } from "@vibe/core";
import { DropdownChevronDown, DropdownChevronRight } from "@vibe/icons";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/client";
import type { ItemDto } from "@/lib/board-types";
import { axisHeaders, dayToX, formatDay, isWeekend, moveRange, resizeRange, todayDay, xToDay, ZOOM_PX_PER_DAY, type DayRange, type Zoom } from "../lib/dates";
import { monthNames } from "../lib/format";
import styles from "./time-grid.module.css";

export interface TimeRow {
  key: string;
  kind: "group" | "item";
  label: ReactNode;
  color?: string;
  item?: ItemDto;
  range: DayRange | null;
  milestone?: boolean;
  critical?: boolean;
  baseline?: DayRange | null;
  /** extra text shown right of the label (dates in the gantt) */
  meta?: ReactNode;
}
export interface TimeLink { from: string; to: string; critical?: boolean }

interface Props {
  rows: TimeRow[];
  axis: DayRange;
  zoom: Zoom;
  canEdit: boolean;
  labelWidth?: number;
  links?: TimeLink[];
  /** (default) only the dragged row changes; the gantt returns dependents as well */
  resolveDrag?: (rowKey: string, range: DayRange) => Map<string, DayRange>;
  onCommit: (changes: Map<string, DayRange>, rowKey: string) => void;
  onOpen: (itemId: string) => void;
  onCreateRange?: (row: TimeRow, day: number) => void;
  /** gantt: drag from a bar's connector to another bar, `to` then depends on `from` */
  onLink?: (fromKey: string, toKey: string) => void;
  onUnlink?: (fromKey: string, toKey: string) => void;
  collapsed?: string[];
  onToggleGroup?: (key: string) => void;
  testId: string;
}

const ROW_H = 36;
const HEAD_H = 52;

interface Drag { rowKey: string; kind: "move" | "start" | "end"; delta: number }

/** Shared time-axis grid of the Timeline and Gantt views: header, rows, bars, today line, arrows. */
export function TimeGrid({ rows, axis, zoom, canEdit, labelWidth = 240, links = [], resolveDrag, onCommit, onOpen, onCreateRange, onLink, onUnlink, collapsed = [], onToggleGroup, testId }: Props) {
  const locale = useLocale();
  const ppd = ZOOM_PX_PER_DAY[zoom];
  const origin = axis.start;
  const days = axis.end - axis.start + 1;
  const width = days * ppd;
  const today = todayDay();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [linking, setLinking] = useState<{ from: string; x: number; y: number; x0: number; y0: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const headers = useMemo(() => axisHeaders(axis, zoom, monthNames(locale)), [axis, zoom, locale]);

  const visible = useMemo(() => {
    const out: TimeRow[] = [];
    let hide = false;
    for (const r of rows) {
      if (r.kind === "group") { hide = collapsed.includes(r.key); out.push(r); } else if (!hide) out.push(r);
    }
    return out;
  }, [rows, collapsed]);

  // start the view around today
  const first = useRef(true);
  useEffect(() => {
    if (first.current && scroller.current) { scroller.current.scrollLeft = Math.max(0, dayToX(today, origin, ppd) - 240); first.current = false; }
  }, [origin, ppd, today]);

  const changes = useMemo(() => {
    if (!drag) return new Map<string, DayRange>();
    const row = rows.find((r) => r.key === drag.rowKey);
    if (!row?.range) return new Map<string, DayRange>();
    const next = drag.kind === "move" ? moveRange(row.range, drag.delta) : resizeRange(row.range, drag.kind, drag.delta);
    return resolveDrag ? resolveDrag(drag.rowKey, next) : new Map([[drag.rowKey, next]]);
  }, [drag, rows, resolveDrag]);
  const rangeOf = (r: TimeRow): DayRange | null => changes.get(r.key) ?? r.range;

  const startDrag = (e: React.PointerEvent, row: TimeRow, kind: Drag["kind"]) => {
    if (e.button !== 0 || !row.range) return;
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    const x0 = e.clientX;
    let moved = false;
    let delta = 0;
    target.setPointerCapture(e.pointerId);
    const onMove = (m: PointerEvent) => {
      if (!moved && Math.abs(m.clientX - x0) < 4) return;
      if (!canEdit) return;
      moved = true;
      delta = Math.round((m.clientX - x0) / ppd);
      setDrag({ rowKey: row.key, kind, delta });
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      setDrag(null);
      if (!moved) { if (row.item) onOpen(row.item.id); return; }
      if (delta === 0) return;
      const next = kind === "move" ? moveRange(row.range!, delta) : resizeRange(row.range!, kind, delta);
      onCommit(resolveDrag ? resolveDrag(row.key, next) : new Map([[row.key, next]]), row.key);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  const startLink = (e: React.PointerEvent, row: TimeRow) => {
    if (e.button !== 0 || !onLink) return;
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    const b = target.getBoundingClientRect();
    const x0 = b.left + b.width / 2; const y0 = b.top + b.height / 2;
    target.setPointerCapture(e.pointerId);
    const rowAt = (x: number, y: number) => document.elementsFromPoint(x, y).find((el) => el.hasAttribute("data-row-key") && el.getAttribute("data-kind") === "item")?.getAttribute("data-row-key") ?? null;
    const onMove = (m: PointerEvent) => setLinking({ from: row.key, x: m.clientX, y: m.clientY, x0, y0 });
    const onUp = (m: PointerEvent) => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      setLinking(null);
      const to = rowAt(m.clientX, m.clientY);
      if (to && to !== row.key) onLink(row.key, to);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  };

  const rowIndex = new Map(visible.map((r, i) => [r.key, i]));
  const barBox = (r: TimeRow) => {
    const rg = rangeOf(r)!;
    const x = dayToX(rg.start, origin, ppd);
    const w = (rg.end - rg.start + 1) * ppd;
    return { x, w, y: (rowIndex.get(r.key) ?? 0) * ROW_H };
  };
  const rowsByKey = new Map(visible.map((r) => [r.key, r]));

  return (
    <div className={styles.scroller} ref={scroller} data-testid={testId} data-zoom={zoom}>
      <div className={styles.inner} style={{ width: labelWidth + width }}>
        <div className={styles.header} style={{ height: HEAD_H }}>
          <div className={styles.corner} style={{ width: labelWidth }} />
          <div className={styles.axis} style={{ width }}>
            <div className={styles.axisRow}>{headers.top.map((h) => <div key={`${h.start}`} className={styles.axisCell} style={{ left: dayToX(h.start, origin, ppd), width: (h.end - h.start + 1) * ppd }}>{h.label}</div>)}</div>
            <div className={styles.axisRow}>{headers.bottom.map((h) => <div key={`${h.start}`} className={`${styles.axisCell} ${styles.axisSub} ${zoom === "day" && isWeekend(h.start) ? styles.weekendHead : ""}`} style={{ left: dayToX(h.start, origin, ppd), width: (h.end - h.start + 1) * ppd }}>{h.label}</div>)}</div>
          </div>
        </div>
        <div className={styles.body}>
          {visible.map((r) => (
            <div key={r.key} className={`${styles.row} ${r.kind === "group" ? styles.groupRow : ""}`} style={{ height: ROW_H }} data-testid={r.kind === "group" ? "tl-group" : "tl-row"} data-item-id={r.item?.id} data-item-name={r.item?.name} data-row-key={r.key} data-kind={r.kind}>
              <div className={styles.label} style={{ width: labelWidth, borderLeftColor: r.color }} onClick={() => r.kind === "group" ? onToggleGroup?.(r.key) : r.item && onOpen(r.item.id)}>
                {r.kind === "group" ? <Icon icon={collapsed.includes(r.key) ? DropdownChevronRight : DropdownChevronDown} size={14} ignoreFocusStyle /> : null}
                <span className={styles.labelText} style={r.kind === "group" ? { color: r.color } : undefined}>{r.label}</span>
                {r.meta}
              </div>
              <div className={styles.track} style={{ width }}
                onClick={(e) => { if (r.kind === "item" && !r.range && canEdit && onCreateRange) { const b = e.currentTarget.getBoundingClientRect(); onCreateRange(r, xToDay(e.clientX - b.left, origin, ppd)); } }}
                data-testid={r.kind === "item" && !r.range ? "tl-empty-track" : undefined}>
                {zoom === "day" ? Array.from({ length: days }, (_, i) => (isWeekend(origin + i) ? <div key={i} className={styles.weekend} style={{ left: i * ppd, width: ppd }} /> : null)) : null}
                {r.kind === "item" && r.range ? <Bar row={r} range={rangeOf(r)!} ppd={ppd} origin={origin} canEdit={canEdit} dragging={drag?.rowKey === r.key} startDrag={startDrag} startLink={onLink ? startLink : undefined} /> : null}
                {r.kind === "item" && r.baseline ? <div className={styles.baseline} style={{ left: dayToX(r.baseline.start, origin, ppd), width: (r.baseline.end - r.baseline.start + 1) * ppd }} data-testid="tl-baseline" /> : null}
              </div>
            </div>
          ))}
          {today >= axis.start && today <= axis.end ? <div className={styles.today} style={{ left: labelWidth + dayToX(today, origin, ppd) + ppd / 2 }} data-testid="tl-today" /> : null}
          {links.length ? (
            <svg className={styles.links} style={{ left: labelWidth, width, height: visible.length * ROW_H }} data-testid="tl-links">
              <defs>
                <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#676879" /></marker>
                <marker id="arrow-crit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#df2f4a" /></marker>
              </defs>
              {links.map((l) => {
                const a = rowsByKey.get(l.from); const b = rowsByKey.get(l.to);
                if (!a?.range || !b?.range) return null;
                const A = barBox(a); const B = barBox(b);
                const x1 = A.x + A.w - (a.milestone ? ppd / 2 - 7 : 0); const y1 = A.y + ROW_H / 2;
                const x2 = B.x + (b.milestone ? ppd / 2 - 7 : 0); const y2 = B.y + ROW_H / 2;
                const mid = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 12));
                const d = x2 >= x1 + 16 ? `M${x1},${y1} H${mid} V${y2} H${x2}` : `M${x1},${y1} H${x1 + 8} V${(y1 + y2) / 2} H${x2 - 8} V${y2} H${x2}`;
                return <path key={`${l.from}-${l.to}`} d={d} fill="none" stroke={l.critical ? "#df2f4a" : "#676879"} strokeWidth={l.critical ? 2 : 1.5} markerEnd={`url(#${l.critical ? "arrow-crit" : "arrow"})`} className={styles.link} onDoubleClick={() => onUnlink?.(l.from, l.to)} data-testid="tl-link" data-from={a.item?.id} data-to={b.item?.id} />;
              })}
            </svg>
          ) : null}
        </div>
      </div>
      {linking ? <svg className={styles.linking}><line x1={linking.x0} y1={linking.y0} x2={linking.x} y2={linking.y} stroke="#0073ea" strokeWidth="2" strokeDasharray="5 4" /></svg> : null}
    </div>
  );
}

function Bar({ row, range, ppd, origin, canEdit, dragging, startDrag, startLink }: { startLink?: (e: React.PointerEvent, row: TimeRow) => void; row: TimeRow; range: DayRange; ppd: number; origin: number; canEdit: boolean; dragging: boolean; startDrag: (e: React.PointerEvent, row: TimeRow, kind: Drag["kind"]) => void }) {
  const x = dayToX(range.start, origin, ppd);
  const w = (range.end - range.start + 1) * ppd;
  const color = row.critical ? "#df2f4a" : row.color ?? "#579bfc";
  const common = { "data-testid": "tl-bar", "data-item-id": row.item?.id, "data-item-name": row.item?.name, "data-start": formatDay(range.start), "data-end": formatDay(range.end) } as const;
  if (row.milestone) {
    return <div className={`${styles.milestone} ${dragging ? styles.barDrag : ""}`} style={{ left: x + ppd / 2 - 9, background: color }} onPointerDown={(e) => startDrag(e, row, "move")} title={String(row.item?.name ?? "")} {...common}>
      {canEdit && startLink ? <span className={styles.connector} style={{ transform: "rotate(-45deg)" }} data-testid="tl-connector" onPointerDown={(e) => startLink(e, row)} /> : null}
    </div>;
  }
  return (
    <div className={`${styles.bar} ${dragging ? styles.barDrag : ""} ${row.critical ? styles.critical : ""}`} style={{ left: x, width: Math.max(w, 6), background: color }} onPointerDown={(e) => startDrag(e, row, "move")} title={String(row.item?.name ?? "")} {...common}>
      {canEdit ? <span className={`${styles.handle} ${styles.handleL}`} data-testid="tl-resize-start" onPointerDown={(e) => startDrag(e, row, "start")} /> : null}
      <span className={styles.barText}>{row.item?.name}</span>
      {canEdit ? <span className={`${styles.handle} ${styles.handleR}`} data-testid="tl-resize-end" onPointerDown={(e) => startDrag(e, row, "end")} /> : null}
      {canEdit && startLink ? <span className={styles.connector} data-testid="tl-connector" onPointerDown={(e) => startLink(e, row)} /> : null}
    </div>
  );
}
