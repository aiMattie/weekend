import type { ViewTypeDefinition } from "./types";

/** settings: see src/modules/views/lib/settings.ts (VIEW_FIELDS.gantt) */
export const ganttView: ViewTypeDefinition = {
  type: "gantt",
  label: "Gantt",
  icon: "Gantt",
  description: "Project plan with dependencies and critical path",
  defaultSettings: () => ({ timelineColumnId: "", dependencyColumnId: "", milestoneColumnId: "", baselineColumnId: "none", colorColumnId: "", showCriticalPath: true, shiftDependents: true, zoom: "week" }),
};
