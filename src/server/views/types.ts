export interface ViewTypeDefinition {
  /** stored in views.type */
  type: string;
  /** English label; UI uses i18n `view.type.<type>` first */
  label: string;
  /** @vibe/icons component name */
  icon: string;
  description: string;
  /** default views.settings for a new view of this type */
  defaultSettings(): Record<string, unknown>;
}
