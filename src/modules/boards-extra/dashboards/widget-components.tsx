"use client";

/** Client half of the widget registry: type -> React renderer. Add a line per new widget type. */
import type { ComponentType } from "react";
import { ChartWidget } from "./renderers/chart";
import { ActivityWidget, FilesWidget, ListWidget, TableWidget } from "./renderers/lists";
import { EmbedWidget, TextWidget, WorkloadWidget } from "./renderers/misc";
import { BatteryWidget, CounterWidget, NumbersWidget, ProgressWidget, StatusOverviewWidget } from "./renderers/numbers";
import type { RendererProps } from "./renderers/shared";
import { CalendarWidget, GanttWidget, TimelineWidget } from "./renderers/time";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const widgetComponents: Record<string, ComponentType<RendererProps<any, any>>> = {
  chart: ChartWidget,
  numbers: NumbersWidget,
  battery: BatteryWidget,
  status_overview: StatusOverviewWidget,
  progress: ProgressWidget,
  counter: CounterWidget,
  list: ListWidget,
  table: TableWidget,
  timeline: TimelineWidget,
  gantt: GanttWidget,
  workload: WorkloadWidget,
  calendar: CalendarWidget,
  files: FilesWidget,
  activity: ActivityWidget,
  text: TextWidget,
  embed: EmbedWidget,
  // <- add new widget renderers above this line
};
