"use client";

/**
 * CLIENT view registry: views.type -> component. The server half (labels, default settings) is
 * src/server/views/registry.ts.
 * ADD A VIEW: create `src/components/views/<type>-view.tsx` exporting a component taking
 * `ViewProps` (./types), then add ONE import and ONE entry to `components` below.
 */
import type { ComponentType } from "react";
import { TableView } from "./table-view";
import { KanbanView } from "./kanban-view";
import { CalendarView } from "./calendar-view";
import { TimelineView } from "./timeline-view";
import { GanttView } from "./gantt-view";
import { WorkloadView } from "./workload-view";
import { CardsView } from "./cards-view";
import { FilesView } from "./files-view";
import { devViewComponents } from "@/modules/dev/views";
import { ChartView } from "./chart-view";
import { MapView } from "./map-view";
import { FormView } from "./form-view";
import type { ViewProps } from "./types";

const components: Record<string, ComponentType<ViewProps>> = {
  table: TableView,
  kanban: KanbanView,
  calendar: CalendarView,
  timeline: TimelineView,
  gantt: GanttView,
  workload: WorkloadView,
  cards: CardsView,
  files: FilesView,
  ...devViewComponents,
  chart: ChartView,
  map: MapView,
  form: FormView,
  // <- add new views above this line
};

/** Unknown view types fall back to the table. */
export const getViewComponent = (type: string): ComponentType<ViewProps> => components[type] ?? TableView;

/** Renders the component registered for `props.view.type`. */
export function ViewRenderer(props: ViewProps) {
  const C = components[props.view.type] ?? TableView;
  return <C {...props} />;
}
export const hasViewComponent = (type: string): boolean => type in components;
export type { ViewProps } from "./types";
