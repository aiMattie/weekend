import type { ViewTypeDefinition } from "./types";

/** settings: see src/modules/views/lib/settings.ts (VIEW_FIELDS.map) */
export const mapView: ViewTypeDefinition = {
  type: "map",
  label: "Map",
  icon: "Location",
  description: "Items with a location on a map",
  defaultSettings: () => ({ locationColumnId: "", colorColumnId: "" }),
};
