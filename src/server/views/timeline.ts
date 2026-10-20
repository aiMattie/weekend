import type { ViewTypeDefinition } from "./types";

/** settings: see src/modules/views/lib/settings.ts (VIEW_FIELDS.timeline) */
export const timelineView: ViewTypeDefinition = {
  type: "timeline",
  label: "Timeline",
  icon: "Timeline",
  description: "Items as bars on a time axis, grouped by group or person",
  defaultSettings: () => ({ timelineColumnId: "", groupBy: "group", zoom: "week", peopleColumnId: "", colorColumnId: "" }),
};
