/** Aggregates the table-ux i18n blocks (spread into nl.ts / en.ts with one line each). */
import { chromeEn, chromeNl } from "./tableux/chrome";
import { gridEn, gridNl } from "./tableux/grid";
import { panelEn, panelNl } from "./tableux/panel";
import { shellEn, shellNl } from "./tableux/shell";
import { tableEn, tableNl } from "./tableux/table";

export const tableuxNl = { ...tableNl, ...gridNl, ...panelNl, ...chromeNl, ...shellNl } as const;
export const tableuxEn: Record<keyof typeof tableuxNl, string> = { ...tableEn, ...gridEn, ...panelEn, ...chromeEn, ...shellEn };
