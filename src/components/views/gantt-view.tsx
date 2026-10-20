"use client";

import { useMemo } from "react";
import { useLocale, useT } from "@/lib/i18n/client";
import { statusColor } from "@/modules/views/lib/colors";
import { fitAxis, rangeFromValue, todayDay, valueFromRange, type DayRange, type Zoom } from "@/modules/views/lib/dates";
import { formatShort } from "@/modules/views/lib/format";
import { criticalPath, depsFromValue, depsToInput, shiftWithDependencies, wouldCycle, type GanttTask } from "@/modules/views/lib/gantt";
import { bool, oneOf, resolveColumn } from "@/modules/views/lib/settings";
import { EmptyConfig } from "@/modules/views/ui/empty-config";
import { TimeGrid, type TimeLink, type TimeRow } from "@/modules/views/ui/time-grid";
import { useViewSettings } from "@/modules/views/ui/use-view-settings";
import { useVisibleItems } from "@/modules/views/ui/use-visible-items";
import { ViewFrame } from "@/modules/views/ui/view-frame";
import frame from "@/modules/views/ui/views.module.css";
import { ZoomControl } from "./timeline-view";
import type { ViewProps } from "./types";

export function GanttView(props: ViewProps) {
  const { board, view, viewState, actions, onOpenItem, canEdit, canEditStructure } = props;
  const t = useT();
  const locale = useLocale();
  const { settings, patch } = useViewSettings(view, actions, canEditStructure);
  const items = useVisibleItems(board, viewState);
  const col = resolveColumn(board.columns, settings.timelineColumnId, ["timeline", "date"]);
  const depCol = resolveColumn(board.columns, settings.dependencyColumnId, ["dependency"]);
  const msCol = resolveColumn(board.columns, settings.milestoneColumnId, ["checkbox"], false);
  const baseCol = resolveColumn(board.columns, settings.baselineColumnId, ["timeline"], false);
  const colorCol = resolveColumn(board.columns, settings.colorColumnId, ["status"]);
  const zoom = oneOf<Zoom>(settings.zoom, ["day", "week", "month", "quarter"], "week");
  const showCritical = bool(settings.showCriticalPath, true);
  const shiftDependents = bool(settings.shiftDependents, true);

  const { rows, tasks, links } = useMemo(() => {
    const none = { rows: [] as TimeRow[], tasks: [] as GanttTask[], links: [] as TimeLink[] };
    if (!col) return none;
    const visibleIds = new Set(items.map((i) => i.id));
    const tasks: GanttTask[] = [];
    for (const it of items) {
      const range = rangeFromValue(col.type, it.values[col.id]);
      if (range) tasks.push({ id: it.id, range, deps: depCol ? depsFromValue(it.values[depCol.id]).filter((d) => visibleIds.has(d)) : [] });
    }
    const crit = showCritical ? criticalPath(tasks) : new Set<string>();
    const rows: TimeRow[] = [];
    for (const g of board.groups) {
      const mine = items.filter((i) => i.groupId === g.id);
      if (!mine.length) continue;
      rows.push({ key: `g:${g.id}`, kind: "group", label: g.title, color: g.color, range: null });
      for (const it of mine) {
        const range = rangeFromValue(col.type, it.values[col.id]);
        const checked = msCol ? (it.values[msCol.id] as { checked?: unknown } | undefined)?.checked : false;
        const isMs = checked === true || checked === "true";
        rows.push({
          key: it.id, kind: "item", label: it.name, item: it, color: statusColor(colorCol, it) ?? "#579bfc", range: range && isMs ? { start: range.start, end: range.start } : range, milestone: isMs,
          critical: crit.has(it.id), baseline: baseCol ? rangeFromValue("timeline", it.values[baseCol.id]) : null,
          meta: range ? <span className={frame.muted}>{formatShort(locale, range.start)}{range.end !== range.start ? ` – ${formatShort(locale, range.end)}` : ""}</span> : null,
        });
      }
    }
    const links: TimeLink[] = [];
    for (const tk of tasks) for (const d of tk.deps) links.push({ from: d, to: tk.id, critical: crit.has(d) && crit.has(tk.id) });
    return { rows, tasks, links };
  }, [col, depCol, msCol, baseCol, colorCol, items, board.groups, showCritical, locale]);

  const axis = useMemo(() => fitAxis(rows.flatMap((r) => [...(r.range ? [r.range] : []), ...(r.baseline ? [r.baseline] : [])]), todayDay()), [rows]);

  const resolveDrag = (key: string, range: DayRange): Map<string, DayRange> =>
    shiftDependents ? shiftWithDependencies(tasks, key, range) : new Map([[key, range]]);

  const commit = (changes: Map<string, DayRange>) => {
    if (!col) return;
    for (const [id, range] of changes) {
      const item = items.find((i) => i.id === id);
      if (item) void actions.setValue(id, col.id, valueFromRange(col.type, range, item.values[col.id]));
    }
  };

  const link = (from: string, to: string) => {
    const target = items.find((i) => i.id === to);
    if (!depCol || !target || wouldCycle(tasks, from, to)) return;
    const cur = depsFromValue(target.values[depCol.id]);
    if (cur.includes(from)) return;
    void actions.setValue(to, depCol.id, depsToInput([...cur, from]));
    // a new dependency pushes the successor behind its predecessor
    const pred = tasks.find((x) => x.id === from);
    const succ = tasks.find((x) => x.id === to);
    if (shiftDependents && pred && succ && col && succ.range.start <= pred.range.end) {
      const len = succ.range.end - succ.range.start;
      const start = pred.range.end + 1;
      commit(shiftWithDependencies(tasks, to, { start, end: start + len }));
    }
  };
  const unlink = (from: string, to: string) => {
    const target = items.find((i) => i.id === to);
    if (!depCol || !target) return;
    void actions.setValue(to, depCol.id, depsToInput(depsFromValue(target.values[depCol.id]).filter((d) => d !== from)));
  };

  const controls = (
    <>
      <ZoomControl zoom={zoom} onChange={(z) => patch({ zoom: z })} />
      <button type="button" className={`${frame.barBtn} ${showCritical ? frame.barBtnActive : ""}`} aria-pressed={showCritical} onClick={() => patch({ showCriticalPath: !showCritical })} data-testid="gantt-critical-toggle">{t("vw.gantt.critical")}</button>
    </>
  );

  return (
    <ViewFrame props={props} settings={settings} patch={patch} controls={controls} testId="gantt-view">
      {!col ? (
        <EmptyConfig messageKey="vw.gantt.needColumn" createType="timeline" createTitle="Timeline" canCreate={canEditStructure} onCreate={() => void actions.createColumn({ title: "Timeline", type: "timeline" })} />
      ) : (
        <>
          {!depCol ? (
            <div className={frame.muted} style={{ padding: "0 0 8px" }} data-testid="gantt-no-dependency">
              {t("vw.gantt.needDependency")}{" "}
              {canEditStructure ? <button type="button" className={frame.barBtn} onClick={() => void actions.createColumn({ title: "Dependency", type: "dependency" })} data-testid="gantt-add-dependency">{t("vw.addColumn", { title: "Dependency" })}</button> : null}
            </div>
          ) : null}
          <TimeGrid testId="gantt-grid" rows={rows} axis={axis} zoom={zoom} canEdit={canEdit} labelWidth={300} links={links} resolveDrag={resolveDrag} onCommit={commit} onOpen={onOpenItem}
            onLink={depCol && canEdit ? link : undefined} onUnlink={depCol && canEdit ? unlink : undefined}
            onCreateRange={(row, day) => { if (row.item) void actions.setValue(row.item.id, col.id, valueFromRange(col.type, { start: day, end: day + (col.type === "timeline" ? 4 : 0) })); }} />
        </>
      )}
    </ViewFrame>
  );
}
