/**
 * i18n. `t(locale, key, vars?)` for server code, `useT()` (client) via <I18nProvider locale>.
 * Missing keys fall back to nl, then to the key itself. Variables: "Hallo {name}".
 */
import { en } from "./en";
import { nl, type MessageKey } from "./nl";

export type Locale = "nl" | "en";
export const DEFAULT_LOCALE: Locale = "nl";
export type { MessageKey };

const dicts: Record<Locale, Record<string, string>> = { nl, en };

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const raw = dicts[locale]?.[key] ?? dicts.nl[key] ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : raw;
}

export const t = translate;
