import { ValidationError } from "../../lib/errors";
import { TEXT_OPS, testText } from "./ops";
import type { ColumnLogic } from "./types";
import { isObj } from "./util";

/** email: `{ email, text }` (API shape; `text` is the display label). */
export type EmailValue = { email: string; text: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const emailColumn: ColumnLogic<EmailValue> = {
  type: "email",
  label: "Email",
  category: "essentials",
  icon: "Email",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined || input === "") return null;
    const email = String(isObj(input) ? input.email ?? "" : input).trim();
    if (!email) return null;
    if (!EMAIL_RE.test(email)) throw new ValidationError(`Invalid email address: ${email}`);
    const text = isObj(input) && typeof input.text === "string" && input.text.trim() ? input.text.trim() : email;
    return { email, text };
  },
  serialize: (v) => v,
  format: (v) => v?.email ?? "",
  filter: { operators: TEXT_OPS, test: (v, op, operand) => testText(v?.email ?? "", op, operand) },
  sortKey: (v) => (v ? v.email.toLowerCase() : null),
};
