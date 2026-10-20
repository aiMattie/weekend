import type { ViewTypeDefinition } from "./types";

/** settings: { hiddenColumnIds?: string[], groupByColumnId?: string | null, columnOrder?: string[] } */
export const tableView: ViewTypeDefinition = {
  type: "table",
  label: "Table",
  icon: "Table",
  description: "Rows and columns, grouped, like a spreadsheet",
  defaultSettings: () => ({ hiddenColumnIds: [] }),
};
