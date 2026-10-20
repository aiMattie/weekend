import type { ViewTypeDefinition } from "./types";

/** settings: see src/modules/views/lib/settings.ts (VIEW_FIELDS.cards) */
export const cardsView: ViewTypeDefinition = {
  type: "cards",
  label: "Cards",
  icon: "Gallery",
  description: "Gallery of cards with a cover image",
  defaultSettings: () => ({ coverColumnId: "" }),
};
