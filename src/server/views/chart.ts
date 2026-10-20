import type { ViewTypeDefinition } from "./types";

/** settings: see src/modules/views/lib/settings.ts (VIEW_FIELDS.chart) */
export const chartView: ViewTypeDefinition = {
  type: "chart",
  label: "Chart",
  icon: "Graph",
  description: "Bar, pie, line and stacked charts of your items",
  defaultSettings: () => ({ chartType: "bar", xColumnId: "", stackColumnId: "none", metric: "count", yColumnId: "" }),
};
