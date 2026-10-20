/** Time based triggers: the scheduler (scheduler.ts) fires these. */
import { z } from "zod";
import type { AutomationBlock } from "./types";

const t = (nl: string, en: string) => ({ nl, en });
const idish = z.union([z.string(), z.number()]).transform(String);
const num = z.coerce.number();

const UNITS = [{ value: "minutes", label: t("minuten", "minutes") }, { value: "hours", label: t("uren", "hours") }, { value: "days", label: t("dagen", "days") }];

export const dateArrives: AutomationBlock<{ columnId?: string; direction?: string; offsetValue?: number; offsetUnit?: string; time?: string }> = {
  id: "date_arrives", kind: "trigger", label: "When a date arrives", title: t("Wanneer een datum aanbreekt", "When a date arrives"),
  category: "time", schedule: true,
  configSchema: z.object({ columnId: idish.optional(), direction: z.enum(["before", "after", "at"]).default("at"), offsetValue: num.default(0), offsetUnit: z.enum(["minutes", "hours", "days"]).default("days"), time: z.string().regex(/^\d{1,2}:\d{2}$/).optional() }),
  fields: [
    { key: "columnId", kind: "column", columnTypes: ["date", "timeline"], label: t("datum", "date"), required: true },
    { key: "offsetValue", kind: "number", label: t("aantal", "amount"), default: 0 },
    { key: "offsetUnit", kind: "select", label: t("eenheid", "unit"), options: UNITS, default: "days" },
    { key: "direction", kind: "select", label: t("voor/na", "before/after"), default: "at", options: [{ value: "before", label: t("voor", "before") }, { value: "after", label: t("na", "after") }, { value: "at", label: t("op", "on") }] },
    { key: "time", kind: "time", label: t("om", "at"), default: "09:00" },
  ],
};

export const recurring: AutomationBlock<{ every?: string; weekday?: number; dayOfMonth?: number; time?: string }> = {
  id: "recurring", kind: "trigger", label: "Every period", title: t("Elke periode", "Every period"),
  category: "time", schedule: true,
  configSchema: z.object({ every: z.enum(["day", "weekday", "week", "month"]).default("day"), weekday: num.min(1).max(7).optional(), dayOfMonth: num.min(1).max(31).optional(), time: z.string().regex(/^\d{1,2}:\d{2}$/).default("09:00") }),
  fields: [
    { key: "every", kind: "select", label: t("elke", "every"), default: "day", options: [{ value: "day", label: t("dag", "day") }, { value: "weekday", label: t("werkdag", "weekday") }, { value: "week", label: t("week", "week") }, { value: "month", label: t("maand", "month") }] },
    { key: "weekday", kind: "select", label: t("op", "on"), default: "1", options: [["1", "maandag", "Monday"], ["2", "dinsdag", "Tuesday"], ["3", "woensdag", "Wednesday"], ["4", "donderdag", "Thursday"], ["5", "vrijdag", "Friday"], ["6", "zaterdag", "Saturday"], ["7", "zondag", "Sunday"]].map(([value, nl, en]) => ({ value, label: t(nl, en) })) },
    { key: "dayOfMonth", kind: "number", label: t("dag van de maand", "day of month"), default: 1 },
    { key: "time", kind: "time", label: t("om", "at"), default: "09:00" },
  ],
};

/** Item has been in a status for N days (e.g. "Wacht op klant" > 5 dagen). */
export const statusDuration: AutomationBlock<{ columnId?: string; labelId?: string; days?: number }> = {
  id: "status_duration", kind: "trigger", label: "When a status lasts too long", title: t("Wanneer een status te lang duurt", "When a status lasts too long"),
  category: "time", schedule: true,
  configSchema: z.object({ columnId: idish.optional(), labelId: idish.optional(), days: num.min(0).default(5) }),
  fields: [
    { key: "columnId", kind: "column", columnTypes: ["status"], label: t("status", "status"), required: true },
    { key: "labelId", kind: "label", of: "columnId", label: t("is", "is"), required: true },
    { key: "days", kind: "number", label: t("langer dan (dagen)", "longer than (days)"), default: 5 },
  ],
};

export const timeTriggers: AutomationBlock<never>[] = [dateArrives, recurring, statusDuration] as AutomationBlock<never>[];
