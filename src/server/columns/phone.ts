import { ValidationError } from "../../lib/errors";
import { TEXT_OPS, testText } from "./ops";
import type { ColumnLogic } from "./types";
import { isObj } from "./util";

/** phone: `{ phone, countryShortName }` (API shape). `phone` keeps the user's formatting. */
export type PhoneValue = { phone: string; countryShortName: string };

const PREFIXES: [string, string][] = [["+31", "NL"], ["+32", "BE"], ["+49", "DE"], ["+33", "FR"], ["+44", "GB"], ["+34", "ES"], ["+39", "IT"], ["+41", "CH"], ["+43", "AT"], ["+1", "US"], ["+46", "SE"], ["+45", "DK"], ["+48", "PL"], ["+351", "PT"]];

export function countryOfPhone(phone: string): string {
  const compact = phone.replace(/[\s()-]/g, "");
  const p = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  return PREFIXES.find(([pre]) => p.startsWith(pre))?.[1] ?? "";
}

export const phoneColumn: ColumnLogic<PhoneValue> = {
  type: "phone",
  label: "Phone",
  category: "essentials",
  icon: "Phone",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined || input === "") return null;
    const raw = String(isObj(input) ? input.phone ?? "" : input).trim();
    if (!raw) return null;
    if (!/^[+\d][\d\s().-]*$/.test(raw) || raw.replace(/\D/g, "").length < 5 || raw.replace(/\D/g, "").length > 15) throw new ValidationError(`Invalid phone number: ${raw}`);
    const given = isObj(input) && typeof input.countryShortName === "string" ? input.countryShortName.toUpperCase() : "";
    return { phone: raw, countryShortName: /^[A-Z]{2}$/.test(given) ? given : countryOfPhone(raw) };
  },
  serialize: (v) => v,
  format: (v) => v?.phone ?? "",
  filter: { operators: TEXT_OPS, test: (v, op, operand) => testText((v?.phone ?? "").replace(/[\s()-]/g, ""), op, String(operand ?? "").replace(/[\s()-]/g, "")) },
  sortKey: (v) => v?.phone ?? null,
};
