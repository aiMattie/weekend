"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, translate, type Locale } from "./index";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** `const t = useT(); t("shell.home")` */
export function useT() {
  const locale = useContext(LocaleContext);
  return useCallback((key: string, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale]);
}

export const useLocale = () => useContext(LocaleContext);
