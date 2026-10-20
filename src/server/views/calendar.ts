import type { ViewTypeDefinition } from "./types";

/** settings: see src/modules/views/lib/settings.ts (VIEW_FIELDS.calendar) */
export const calendarView: ViewTypeDefinition = {
  type: "calendar",
  label: "Calendar",
  icon: "Calendar",
  description: "Items on a month, week or day calendar by date or timeline",
  defaultSettings: () => ({ dateColumnIds: [], mode: "month", colorColumnId: "" }),
};
