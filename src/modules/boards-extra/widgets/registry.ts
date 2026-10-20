/**
 * Widget registry (server + shared, pure). ADD A WIDGET: create defs/<name>.ts exporting a
 * `WidgetDefinition` (type, label, category, configSchema (zod), fields, query) and add it to
 * `definitions` below, plus a React component in ../dashboards/widget-components.tsx.
 */
import { z } from "zod";
import { chartWidget } from "./defs/chart";
import { numbersWidget } from "./defs/numbers";
import { batteryWidget, progressWidget, statusOverviewWidget } from "./defs/status";
import { listWidget, tableWidget } from "./defs/items";
import { calendarWidget, counterWidget, ganttWidget, timelineWidget } from "./defs/time";
import { workloadWidget } from "./defs/workload";
import { activityWidget, embedWidget, filesWidget, textWidget } from "./defs/misc";
import type { WidgetDefinition } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const definitions: WidgetDefinition<any>[] = [
  chartWidget,
  numbersWidget,
  batteryWidget,
  statusOverviewWidget,
  progressWidget,
  counterWidget,
  listWidget,
  tableWidget,
  timelineWidget,
  ganttWidget,
  workloadWidget,
  calendarWidget,
  filesWidget,
  activityWidget,
  textWidget,
  embedWidget,
  // <- add new widgets above this line
];

const byType = new Map(definitions.map((d) => [d.type, d]));

export const listWidgetDefinitions = () => [...definitions];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getWidgetDefinition = (type: string): WidgetDefinition<any> | undefined => byType.get(type);
export const widgetTypes = () => definitions.map((d) => d.type);
export const defaultWidgetSettings = (type: string): Record<string, unknown> => (byType.get(type)?.configSchema.parse({}) ?? {}) as Record<string, unknown>;

/** JSON-schema registry of every widget (for MCP `all_widgets_schema` and the REST docs). */
export function allWidgetsSchema() {
  return definitions.map((d) => ({
    type: d.type,
    label: d.label,
    description: d.description,
    category: d.category,
    defaultLayout: d.defaultLayout,
    settingsSchema: z.toJSONSchema(d.configSchema, { unrepresentable: "any", io: "input" }),
  }));
}
