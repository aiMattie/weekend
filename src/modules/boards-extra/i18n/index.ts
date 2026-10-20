/** Aggregates the boards-extra i18n blocks (spread into nl.ts / en.ts with one line each). */
import { dashboardsEn, dashboardsNl } from "./dashboards";
import { docsEn, docsNl } from "./docs";
import { formsEn, formsNl } from "./forms";
import { myworkEn, myworkNl } from "./mywork";
import { navEn, navNl } from "./nav";

export const extraNl = { ...navNl, ...dashboardsNl, ...formsNl, ...docsNl, ...myworkNl } as const;
export const extraEn: Record<keyof typeof extraNl, string> = { ...navEn, ...dashboardsEn, ...formsEn, ...docsEn, ...myworkEn };
