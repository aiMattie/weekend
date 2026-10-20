"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { ItemDto } from "@/lib/board-types";
import { statusColor } from "@/modules/views/lib/colors";
import { fitAxis, rangeFromValue, todayDay, valueFromRange, type DayRange, type Zoom } from "@/modules/views/lib/dates";
import { assigneesOf } from "@/modules/views/lib/workload";
import { oneOf, resolveColumn } from "@/modules/views/lib/settings";
import { EmptyConfig } from "@/modules/views/ui/empty-config";
import { TimeGrid, type TimeRow } from "@/modules/views/ui/time-grid";
import { useViewSettings } from "@/modules/views/ui/use-view-settings";
import { useVisibleItems } from "@/modules/views/ui/use-visible-items";
import { ViewFrame } from "@/modules/views/ui/view-frame";
import frame from "@/modules/views/ui/views.module.css";
import type { ViewProps } from "./types";

export const ZOOMS: Zoom[] = ["day", "week", "month", "quarter"];

export function ZoomControl({ zoom, onChange }: { zoom: Zoom; onChange: (z: Zoom) => void }) {
  const t = useT();
  return (
    <div className={frame.segmented} role="group" data-testid="zoom-control">
      {ZOOMS.map((z) => <button key={z} type="button" aria-pressed={zoom === z} onClick={() => onChange(z)} data-testid={`zoom-${z}`}>{t(`vw.zoom.${z}`)}</button>)}
    </div>
  );
}

export function TimelineView(props: ViewProps) {
  const { board, view, viewState, actions, onOpenItem, canEdit, canEditStructure } = props;
  const t = useT();
  const { settings, patch } = useViewSettings(view, actions, canEditStructure);
  const items = useVisibleItems(board, viewState);
  const col = resolveColumn(board.columns, settings.timelineColumnId, ["timeline", "date"]);
  const peopleCol = resolveColumn(board.columns, settings.peopleColumnId, ["people"]);
  const colorCol = resolveColumn(board.columns, settings.colorColumnId, ["status"]);
  const zoom = oneOf<Zoom>(settings.zoom, ["day", "week", "month", "quarter"], "week");
  const groupBy = oneOf(settings.groupBy, ["group", "person", "none"] as const, "group");
  const [collapsed, setCollapsed] = useState<string[]>([]);

  const rows = useMemo<TimeRow[]>(() => {
    if (!col) return [];
    const mk = (it: ItemDto, key: string): TimeRow => ({ key, kind: "item", label: it.name, item: it, range: rangeFromValue(col.type, it.values[col.id]), color: statusColor(colorCol, it) ?? "#579bfc" });
    if (groupBy === "none") return items.map((it) => mk(it, it.id));
    if (groupBy === "person" && peopleCol) {
      const out: TimeRow[] = [];
      const people = [...board.users.map((u) => ({ id: u.id, title: u.name })), { id: "none", title: t("toolbar.unassigned") }];
      for (const p of people) {
        const mine = items.filter((it) => { const a = assigneesOf(it, peopleCol.id); return p.id === "none" ? a.length === 0 : a.includes(p.id); });
        if (!mine.length) continue;
        out.push({ key: `g:${p.id}`, kind: "group", label: p.title, color: "#579bfc", range: null });
        for (const it of mine) out.push(mk(it, `${p.id}:${it.id}`));
      }
      return out;
    }
    const out: TimeRow[] = [];
    for (const g of board.groups) {
      const mine = items.filter((it) => it.groupId === g.id);
      if (!mine.length) continue;
      out.push({ key: `g:${g.id}`, kind: "group", label: g.title, color: g.color, range: null });
      for (const it of mine) out.push(mk(it, it.id));
    }
    return out;
  }, [col, colorCol, peopleCol, items, groupBy, board.groups, board.users, t]);

  const axis = useMemo(() => fitAxis(rows.flatMap((r) => (r.range ? [r.range] : [])), todayDay()), [rows]);

  const commit = (changes: Map<string, DayRange>) => {
    if (!col) return;
    for (const [key, range] of changes) {
      const row = rows.find((r) => r.key === key);
      if (row?.item) void actions.setValue(row.item.id, col.id, valueFromRange(col.type, range, row.item.values[col.id]));
    }
  };

  return (
    <ViewFrame props={props} settings={settings} patch={patch} controls={<ZoomControl zoom={zoom} onChange={(z) => patch({ zoom: z })} />} testId="timeline-view">
      {!col ? (
        <EmptyConfig messageKey="vw.tl.needColumn" createType="timeline" createTitle="Timeline" canCreate={canEditStructure} onCreate={() => void actions.createColumn({ title: "Timeline", type: "timeline" })} />
      ) : (
        <TimeGrid testId="timeline-grid" rows={rows} axis={axis} zoom={zoom} canEdit={canEdit} onCommit={commit} onOpen={onOpenItem} collapsed={collapsed}
          onToggleGroup={(k) => setCollapsed((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))}
          onCreateRange={(row, day) => { if (row.item) void actions.setValue(row.item.id, col.id, valueFromRange(col.type, { start: day, end: day + (col.type === "timeline" ? 2 : 0) })); }} />
      )}
    </ViewFrame>
  );
}
