import type { ViewTypeDefinition } from "./types";

/** settings: see src/modules/views/lib/settings.ts (VIEW_FIELDS.files) */
export const filesView: ViewTypeDefinition = {
  type: "files",
  label: "Files gallery",
  icon: "Files",
  description: "All files of this board in one place",
  defaultSettings: () => ({ fileColumnId: "" }),
};
