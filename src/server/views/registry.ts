/**
 * View type registry (server half: metadata + default settings). The React half lives in
 * src/components/views/registry.tsx (the component that renders the view).
 *
 * ADD A VIEW TYPE: add `src/server/views/<type>.ts` exporting a `ViewTypeDefinition`, one import +
 * one array entry below, and the component entry in src/components/views/registry.tsx.
 */
import { tableView } from "./table";
import { kanbanView } from "./kanban";
import { calendarView } from "./calendar";
import { timelineView } from "./timeline";
import { ganttView } from "./gantt";
import { workloadView } from "./workload";
import { cardsView } from "./cards";
import { chartView } from "./chart";
import { mapView } from "./map";
import { filesView } from "./files";
import { formView } from "./form";
import { devViews } from "./dev";
import type { ViewTypeDefinition } from "./types";

const definitions: ViewTypeDefinition[] = [
  tableView,
  kanbanView,
  calendarView,
  timelineView,
  ganttView,
  workloadView,
  cardsView,
  chartView,
  mapView,
  filesView,
  formView,
  ...devViews,
  // <- add new view types above this line
];

const byType = new Map(definitions.map((d) => [d.type, d]));

export const getViewType = (type: string): ViewTypeDefinition | undefined => byType.get(type);
export const listViewTypes = (): ViewTypeDefinition[] => [...definitions];
export type { ViewTypeDefinition } from "./types";
