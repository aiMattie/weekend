/** table-ux i18n: app frame (top bar, rail). nl is the source; en mirrors the same keys. */
export const shellNl = {
  "frame.workspaceRail": "Workspace",
  "frame.favoritesRail": "Favorites",
  "frame.moreRail": "More",
  "frame.noFavorites": "Nog geen favorieten",
  "frame.noMore": "Geen andere onderdelen",
  "frame.inbox": "Inbox",
  "frame.apps": "Apps",
  "frame.integrations": "Integraties",
  "frame.expandSidebar": "Zijbalk uitklappen",
  "frame.gridMenu": "Apps",
} as const;
export const shellEn: Record<keyof typeof shellNl, string> = {
  "frame.workspaceRail": "Workspace",
  "frame.favoritesRail": "Favorites",
  "frame.moreRail": "More",
  "frame.noFavorites": "No favorites yet",
  "frame.noMore": "No other sections",
  "frame.inbox": "Inbox",
  "frame.apps": "Apps",
  "frame.integrations": "Integrations",
  "frame.expandSidebar": "Expand sidebar",
  "frame.gridMenu": "Apps",
};
