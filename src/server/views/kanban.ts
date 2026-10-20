import type { ViewTypeDefinition } from "./types";

/** settings: see src/modules/views/lib/settings.ts (VIEW_FIELDS.kanban) */
export const kanbanView: ViewTypeDefinition = {
  type: "kanban",
  label: "Kanban",
  icon: "Layout",
  description: "Cards in lanes per status, drag cards between lanes",
  defaultSettings: () => ({ columnId: "", hideNoValueLane: false, collapsedLaneIds: [] }),
};
