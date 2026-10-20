import type { ViewTypeDefinition } from "./types";

/** settings: see src/modules/views/lib/settings.ts (VIEW_FIELDS.form) */
export const formView: ViewTypeDefinition = {
  type: "form",
  label: "Form",
  icon: "Form",
  description: "Form that creates new items",
  defaultSettings: () => ({ title: "", description: "", groupId: "", submitLabel: "", fields: [] }),
};
