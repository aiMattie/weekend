/** Condition blocks ("If ..."). */
import { z } from "zod";
import type { PeopleValue } from "../../columns/people";
import type { AutomationBlock, MatchContext } from "./types";
import type { ColumnRow, ItemRow } from "../../services/_shared";

const t = (nl: string, en: string) => ({ nl, en });
const idish = z.union([z.string(), z.number()]).transform(String);
const idReq = idish.pipe(z.string().min(1));

function stored(item: ItemRow | null, column: ColumnRow | null): unknown {
  return item && column ? item.values[column.id] ?? null : null;
}
const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (typeof v === "object" && v !== null && ("personsAndTeams" in v ? !(v as PeopleValue).personsAndTeams.length : "ids" in v ? !(v as { ids: unknown[] }).ids?.length : false));

function equals(ctx: MatchContext, col: ColumnRow, raw: unknown, want: string): boolean {
  if (col.type === "status" || col.type === "dropdown") {
    const idx = col.type === "status" ? (raw as { index?: number } | null)?.index : undefined;
    if (idx !== undefined && String(idx) === want) return true;
    if (col.type === "dropdown" && ((raw as { ids?: number[] } | null)?.ids ?? []).map(String).includes(want)) return true;
  }
  if (col.type === "people") return ((raw as PeopleValue | null)?.personsAndTeams ?? []).some((p) => p.id === want);
  if (col.type === "checkbox") return String(!!(raw as { checked?: boolean } | null)?.checked) === want;
  return ctx.format(col, raw).trim().toLowerCase() === want.trim().toLowerCase();
}

export const columnEquals: AutomationBlock<{ columnId: string; value: string }> = {
  id: "column_equals", kind: "condition", label: "column equals", title: t("kolom is gelijk aan", "column equals"), category: "condition",
  configSchema: z.object({ columnId: idReq, value: idish.default("") }),
  fields: [{ key: "columnId", kind: "column", label: t("kolom", "column"), required: true }, { key: "value", kind: "value", of: "columnId", label: t("waarde", "value") }],
  evaluate: ({ item, config, ctx }) => {
    const col = ctx.column(config.columnId);
    return !!col && equals(ctx, col, stored(item, col), String(config.value));
  },
};

export const columnNotEquals: AutomationBlock<{ columnId: string; value: string }> = {
  ...columnEquals, id: "column_not_equals", label: "column does not equal", title: t("kolom is niet gelijk aan", "column does not equal"),
  evaluate: ({ item, config, ctx }) => {
    const col = ctx.column(config.columnId);
    return !!col && !equals(ctx, col, stored(item, col), String(config.value));
  },
} as AutomationBlock<{ columnId: string; value: string }>;

export const columnContains: AutomationBlock<{ columnId: string; text: string }> = {
  id: "column_contains", kind: "condition", label: "column contains", title: t("kolom bevat", "column contains"), category: "condition",
  configSchema: z.object({ columnId: idReq, text: z.string().default("") }),
  fields: [{ key: "columnId", kind: "column", label: t("kolom", "column"), required: true }, { key: "text", kind: "text", label: t("tekst", "text") }],
  evaluate: ({ item, config, ctx }) => {
    const col = ctx.column(config.columnId);
    return !!col && ctx.format(col, stored(item, col)).toLowerCase().includes(config.text.toLowerCase());
  },
};

export const columnIsEmpty: AutomationBlock<{ columnId: string }> = {
  id: "column_is_empty", kind: "condition", label: "column is empty", title: t("kolom is leeg", "column is empty"), category: "condition",
  configSchema: z.object({ columnId: idReq }),
  fields: [{ key: "columnId", kind: "column", label: t("kolom", "column"), required: true }],
  evaluate: ({ item, config, ctx }) => isEmpty(stored(item, ctx.column(config.columnId))),
};

export const columnNotEmpty: AutomationBlock<{ columnId: string }> = {
  ...columnIsEmpty, id: "column_not_empty", label: "column is not empty", title: t("kolom is niet leeg", "column is not empty"),
  evaluate: ({ item, config, ctx }) => !isEmpty(stored(item, ctx.column(config.columnId))),
} as AutomationBlock<{ columnId: string }>;

export const itemInGroup: AutomationBlock<{ groupId: string }> = {
  id: "item_in_group", kind: "condition", label: "item is in group", title: t("item staat in groep", "item is in group"), category: "condition",
  configSchema: z.object({ groupId: idReq }),
  fields: [{ key: "groupId", kind: "group", label: t("groep", "group"), required: true }],
  evaluate: ({ item, config }) => item?.groupId === config.groupId,
};

export const allSubitemsDone: AutomationBlock<Record<string, never>> = {
  id: "all_subitems_done", kind: "condition", label: "all subitems are done", title: t("alle subitems klaar zijn", "all subitems are done"), category: "condition",
  configSchema: z.object({}).strip() as never, fields: [],
  evaluate: ({ item, ctx }) => {
    const parentId = item?.parentItemId ?? item?.id;
    if (!parentId) return false;
    const s = ctx.subitemsDone(parentId);
    return s.total > 0 && s.done === s.total;
  },
};

export const conditionBlocks: AutomationBlock<never>[] = [columnEquals, columnNotEquals, columnContains, columnIsEmpty, columnNotEmpty, itemInGroup, allSubitemsDone] as AutomationBlock<never>[];
