"use client";

import { IconButton } from "@vibe/core";
import { NavigationChevronLeft, NavigationChevronRight } from "@vibe/icons";
import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { TimeData, TimeEvent } from "../../widgets/defs/time";
import styles from "../dashboards.module.css";
import { Empty, type RendererProps } from "./shared";

const DAY = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

function Axis({ min, max }: { min: string; max: string }) {
  const days = Math.max(1, (ms(max) - ms(min)) / DAY + 1);
  const ticks = Math.min(8, Math.ceil(days / 7));
  return (
    <div className={styles.axis}>
      {Array.from({ length: ticks + 1 }, (_, i) => <span key={i} style={{ left: `${(i / ticks) * 100}%` }}>{iso(ms(min) + Math.round((days / ticks) * i) * DAY).slice(5)}</span>)}
    </div>
  );
}

function bar(e: TimeEvent, min: string, days: number) {
  return { left: `${((ms(e.start) - ms(min)) / DAY / days) * 100}%`, width: `${Math.max(1.5, ((ms(e.end) - ms(e.start)) / DAY + 1) / days * 100)}%`, background: e.color };
}

function range(data: TimeData) {
  // pad one day each side so single-day items are visible
  const min = iso(ms(data.min!) - DAY), max = iso(ms(data.max!) + DAY);
  return { min, max, days: (ms(max) - ms(min)) / DAY + 1 };
}

export function GanttWidget({ data, openItem }: RendererProps<TimeData>) {
  const [now] = useState(() => Date.now());
  if (!data.events.length) return <Empty />;
  const { min, max, days } = range(data);
  const todayPct = ((now - ms(min)) / DAY / days) * 100;
  return (
    <div className={styles.gantt} data-testid="gantt-widget">
      <div className={styles.ganttRow}><div className={styles.ganttName} /><div className={styles.ganttTrack}><Axis min={min} max={max} /></div></div>
      {data.events.map((e) => (
        <div key={e.id} className={styles.ganttRow} onClick={() => openItem(e.boardId, e.id)}>
          <div className={styles.ganttName} title={e.name}>{e.name}</div>
          <div className={styles.ganttTrack}>
            {todayPct >= 0 && todayPct <= 100 && <i className={styles.todayLine} style={{ left: `${todayPct}%` }} />}
            <span className={styles.ganttBar} style={bar(e, min, days)} title={`${e.start} - ${e.end}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TimelineWidget({ data, openItem }: RendererProps<TimeData>) {
  const groups = useMemo(() => {
    const m = new Map<string, TimeEvent[]>();
    for (const e of data.events) m.set(e.group, [...(m.get(e.group) ?? []), e]);
    return [...m.entries()];
  }, [data.events]);
  if (!data.events.length) return <Empty />;
  const { min, max, days } = range(data);
  return (
    <div className={styles.timeline} data-testid="timeline-widget">
      <Axis min={min} max={max} />
      {groups.map(([g, evs]) => (
        <div key={g} className={styles.lane}>
          <div className={styles.laneTitle}>{g}</div>
          <div className={styles.laneBody} style={{ height: evs.length * 24 + 8 }}>
            {evs.map((e, i) => <button key={e.id} className={styles.timelineBar} style={{ ...bar(e, min, days), top: 4 + i * 24 }} onClick={() => openItem(e.boardId, e.id)} title={`${e.name} (${e.start} - ${e.end})`}>{e.name}</button>)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CalendarWidget({ data, openItem }: RendererProps<TimeData>) {
  const t = useT();
  const [offset, setOffset] = useState(0);
  const base = new Date();
  const first = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const start = first.getTime() - lead * DAY;
  const cells = Array.from({ length: 42 }, (_, i) => iso(start + i * DAY));
  const month = first.getUTCMonth();
  const byDay = new Map<string, TimeEvent[]>();
  for (const e of data.events) for (let d = ms(e.start); d <= Math.min(ms(e.end), ms(e.start) + 62 * DAY); d += DAY) byDay.set(iso(d), [...(byDay.get(iso(d)) ?? []), e]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className={styles.calendar} data-testid="calendar-widget">
      <div className={styles.calHead}>
        <IconButton icon={NavigationChevronLeft} size="xs" kind="tertiary" aria-label={t("dashboards.prev")} onClick={() => setOffset(offset - 1)} />
        <b>{first.toLocaleDateString("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" })}</b>
        <IconButton icon={NavigationChevronRight} size="xs" kind="tertiary" aria-label={t("dashboards.next")} onClick={() => setOffset(offset + 1)} />
        {offset !== 0 && <button className={styles.linkBtn} onClick={() => setOffset(0)}>{t("dashboards.today")}</button>}
      </div>
      <div className={styles.calGrid}>
        {["ma", "di", "wo", "do", "vr", "za", "zo"].map((d) => <div key={d} className={styles.calDow}>{d}</div>)}
        {cells.map((d) => {
          const evs = byDay.get(d) ?? [];
          return (
            <div key={d} className={`${styles.calCell} ${new Date(`${d}T00:00:00Z`).getUTCMonth() !== month ? styles.calOther : ""} ${d === today ? styles.calToday : ""}`}>
              <span className={styles.calNum}>{Number(d.slice(8))}</span>
              {evs.slice(0, 3).map((e) => <button key={e.id} className={styles.calEvent} style={{ background: e.color }} onClick={() => openItem(e.boardId, e.id)} title={e.name}>{e.name}</button>)}
              {evs.length > 3 && <span className={styles.muted}>+{evs.length - 3}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
