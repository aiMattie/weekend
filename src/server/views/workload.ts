import type { ViewTypeDefinition } from "./types";

/** settings: see src/modules/views/lib/settings.ts (VIEW_FIELDS.workload) */
export const workloadView: ViewTypeDefinition = {
  type: "workload",
  label: "Workload",
  icon: "Team",
  description: "Capacity per person, hours per day or week",
  defaultSettings: () => ({ peopleColumnId: "", dateColumnId: "", estimateColumnId: "", mode: "hours", capacityPerDay: 8, defaultDailyHours: 4, granularity: "week", capacityByUser: {} }),
};
