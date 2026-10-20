import { ValidationError } from "../../lib/errors";
import { TEXT_OPS, testText } from "./ops";
import type { ColumnLogic } from "./types";

/** link: `{ url, text? }`. */
export type LinkValue = { url: string; text?: string };

export const linkColumn: ColumnLogic<LinkValue> = {
  type: "link",
  label: "Link",
  category: "essentials",
  icon: "Link",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined || input === "") return null;
    const o = typeof input === "string" ? { url: input } : (input as { url?: unknown; text?: unknown });
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!url) return null;
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) throw new ValidationError("Link must start with http://, https://, mailto: or tel:");
    return { url, ...(typeof (o as { text?: unknown }).text === "string" && (o as { text: string }).text ? { text: (o as { text: string }).text } : {}) };
  },
  serialize: (v) => v,
  format: (v) => (v ? (v.text ? `${v.text} (${v.url})` : v.url) : ""),
  filter: { operators: TEXT_OPS, test: (v, op, operand) => testText(v ? `${v.text ?? ""} ${v.url}`.trim() : "", op, operand) },
  sortKey: (v) => (v ? (v.text ?? v.url).toLowerCase() : null),
};
