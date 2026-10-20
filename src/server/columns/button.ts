import { OP_IS_EMPTY, OP_NOT_EMPTY } from "./ops";
import type { ColumnLogic } from "./types";

/**
 * button: holds no value. Clicking it calls POST /api/v1/items/:id/values/:columnId/action
 * `{ action: "click" }` (columnActions.click) which emits the `button.clicked` event for automations.
 * settings: { label: string, color: "#rrggbb" }.
 */
export const buttonColumn: ColumnLogic<never> = {
  type: "button",
  label: "Button",
  category: "advanced",
  icon: "Button",
  readOnly: true,
  defaultSettings: () => ({ label: "Click me", color: "#0073ea" }),
  normalizeSettings: (s) => ({ ...s, label: String(s.label ?? "Click me").slice(0, 40) || "Click me", color: /^#[0-9a-f]{6}$/i.test(String(s.color)) ? String(s.color) : "#0073ea" }),
  validate: () => null,
  serialize: () => null,
  format: (_v, c) => String(c.settings.label ?? ""),
  filter: { operators: [OP_IS_EMPTY, OP_NOT_EMPTY], test: () => true },
};
