/** Item / column actions ("Then ..."). All work goes through services as the automation system actor. */
import { z } from "zod";
import { ValidationError } from "../../../lib/errors";
import { getColumnLogic } from "../../columns/registry";
import * as columnsSvc from "../../services/columns";
import * as groupsSvc from "../../services/groups";
import * as items from "../../services/items";
import * as updates from "../../services/updates";
import { ON_PARENT_FIELD, resolveUsers, targetItem, textToHtml } from "./helpers";
import type { AutomationBlock, FieldSpec, RunContext } from "./types";
import type { PeopleValue } from "../../columns/people";

const t = (nl: string, en: string) => ({ nl, en });
const idish = z.union([z.string(), z.number()]).transform(String);
const idReq = idish.pipe(z.string().min(1));
const on = z.enum(["item", "parent"]).default("item");
const num = z.coerce.number();

/** Turn a mapping {targetColumn: template | "@col:<sourceColumn>"} into raw input values. */
export function buildValues(ctx: RunContext<unknown>, boardId: string, mapping: Record<string, unknown> | undefined, scope: "item" | "subitem" = "item"): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const src = ctx.item();
  const targetCols = columnsSvc.list(ctx.actor, boardId, scope);
  for (const [ref, spec] of Object.entries(mapping ?? {})) {
    const target = targetCols.find((c) => c.id === ref || c.key === ref);
    if (!target || target.type === "name") continue;
    if (typeof spec === "string" && spec.startsWith("@col:") && src) {
      const sourceCol = columnsSvc.get(ctx.actor, spec.slice(5));
      const raw = src.values[sourceCol.id] ?? null;
      out[target.id] = sourceCol.type === target.type ? raw : getColumnLogic(sourceCol.type).format(raw as never, sourceCol);
    } else out[target.id] = typeof spec === "string" ? ctx.render(spec) : spec;
  }
  return out;
}

export const changeColumnValue: AutomationBlock<{ columnId: string; value?: unknown; on?: string }> = {
  id: "change_column_value", kind: "action", label: "Change a column value", title: t("Wijzig een kolomwaarde", "Change a column value"), category: "column", needsItem: true,
  configSchema: z.object({ columnId: idReq, value: z.unknown().optional(), on }),
  fields: [{ key: "columnId", kind: "column", label: t("kolom", "column"), required: true }, { key: "value", kind: "value", of: "columnId", label: t("naar", "to") }, ON_PARENT_FIELD],
  run(ctx) {
    const it = targetItem(ctx);
    const v = typeof ctx.config.value === "string" ? ctx.render(ctx.config.value) : ctx.config.value ?? null;
    items.changeColumnValue(ctx.actor, it.id, ctx.config.columnId, v === "" ? null : v);
  },
};

export const setStatus: AutomationBlock<{ columnId: string; labelId: string; on?: string }> = {
  id: "set_status", kind: "action", label: "Set a status", title: t("Zet een status", "Set a status"), category: "status", needsItem: true,
  configSchema: z.object({ columnId: idReq, labelId: idReq, on }),
  fields: [{ key: "columnId", kind: "column", columnTypes: ["status"], label: t("status", "status"), required: true }, { key: "labelId", kind: "label", of: "columnId", label: t("naar", "to"), required: true }, ON_PARENT_FIELD],
  run(ctx) {
    items.changeColumnValue(ctx.actor, targetItem(ctx).id, ctx.config.columnId, { index: Number(ctx.config.labelId) });
  },
};

export const assignPerson: AutomationBlock<{ columnId: string; userIds: string[]; mode?: string; on?: string }> = {
  id: "assign_person", kind: "action", label: "Assign a person", title: t("Wijs een persoon toe", "Assign a person"), category: "people", needsItem: true,
  configSchema: z.object({ columnId: idReq, userIds: z.array(idish).default([]), mode: z.enum(["add", "replace"]).default("add"), on }),
  fields: [
    { key: "columnId", kind: "column", columnTypes: ["people"], label: t("kolom", "column"), required: true },
    { key: "userIds", kind: "users", label: t("persoon", "person"), required: true },
    { key: "mode", kind: "select", label: t("wijze", "mode"), default: "add", options: [{ value: "add", label: t("toevoegen", "add") }, { value: "replace", label: t("vervangen", "replace") }] },
    ON_PARENT_FIELD,
  ],
  run(ctx) {
    const it = targetItem(ctx);
    const ids = resolveUsers(ctx, ctx.config.userIds);
    if (!ids.length) throw new ValidationError("No person to assign");
    const col = columnsSvc.get(ctx.actor, ctx.config.columnId);
    const cur = ((it.values[col.id] as PeopleValue | undefined)?.personsAndTeams ?? []).map((p) => (p.kind === "person" ? p.id : `team:${p.id}`));
    const next = ctx.config.mode === "replace" ? ids : [...new Set([...cur.filter((c) => !c.startsWith("team:")), ...ids])];
    items.changeColumnValue(ctx.actor, it.id, ctx.config.columnId, next);
  },
};

const mappingField: FieldSpec = { key: "mapping", kind: "mapping", boardField: "boardId", label: t("kolommen invullen", "fill columns") };

export const createItem: AutomationBlock<{ boardId?: string; groupId?: string; name?: string; mapping?: Record<string, unknown> }> = {
  id: "create_item", kind: "action", label: "Create an item", title: t("Maak een item aan", "Create an item"), category: "item",
  configSchema: z.object({ boardId: idish.optional(), groupId: idish.optional(), name: z.string().default("{item}"), mapping: z.record(z.string(), z.unknown()).default({}) }),
  fields: [
    { key: "boardId", kind: "board", label: t("op board", "on board") },
    { key: "groupId", kind: "group", boardField: "boardId", label: t("in groep", "in group") },
    { key: "name", kind: "text", label: t("naam", "name"), default: "{item}" },
    mappingField,
  ],
  run(ctx) {
    const boardId = ctx.config.boardId || ctx.boardId;
    if (!boardId) throw new ValidationError("No board to create the item on");
    const created = items.create(ctx.actor, { boardId, groupId: ctx.config.groupId || undefined, name: ctx.render(ctx.config.name ?? "{item}") || "Item", values: buildValues(ctx, boardId, ctx.config.mapping) });
    return `item ${created.id}`;
  },
};

export const createSubitem: AutomationBlock<{ name?: string; mapping?: Record<string, unknown>; on?: string }> = {
  id: "create_subitem", kind: "action", label: "Create a subitem", title: t("Maak een subitem aan", "Create a subitem"), category: "subitem", needsItem: true,
  configSchema: z.object({ name: z.string().default("Subitem"), mapping: z.record(z.string(), z.unknown()).default({}), on }),
  fields: [{ key: "name", kind: "text", label: t("naam", "name"), required: true, default: "Subitem" }, ON_PARENT_FIELD],
  run(ctx) {
    const it = targetItem(ctx);
    items.ensureSubitemColumns(it.boardId);
    const s = items.create(ctx.actor, { boardId: it.boardId, parentItemId: it.id, name: ctx.render(ctx.config.name ?? "Subitem") || "Subitem", values: buildValues(ctx, it.boardId, ctx.config.mapping, "subitem") });
    return `subitem ${s.id}`;
  },
};

export const moveToGroup: AutomationBlock<{ groupId: string }> = {
  id: "move_item_to_group", kind: "action", label: "Move item to group", title: t("Verplaats item naar groep", "Move item to group"), category: "item", needsItem: true,
  configSchema: z.object({ groupId: idReq }),
  fields: [{ key: "groupId", kind: "group", label: t("groep", "group"), required: true }],
  run(ctx) {
    const it = targetItem(ctx as RunContext<{ on?: string }>);
    items.move(ctx.actor, it.id, { groupId: groupsSvc.get(ctx.actor, ctx.config.groupId).id });
  },
};

export const moveToBoard: AutomationBlock<{ boardId: string; groupId?: string }> = {
  id: "move_item_to_board", kind: "action", label: "Move item to board", title: t("Verplaats item naar board", "Move item to board"), category: "item", needsItem: true,
  configSchema: z.object({ boardId: idReq, groupId: idish.optional() }),
  fields: [{ key: "boardId", kind: "board", label: t("board", "board"), required: true }, { key: "groupId", kind: "group", boardField: "boardId", label: t("groep", "group") }],
  run(ctx) {
    const it = targetItem(ctx as RunContext<{ on?: string }>);
    items.move(ctx.actor, it.id, { boardId: ctx.config.boardId, groupId: ctx.config.groupId || undefined });
  },
};

export const duplicateItem: AutomationBlock<Record<string, never>> = {
  id: "duplicate_item", kind: "action", label: "Duplicate item", title: t("Dupliceer item", "Duplicate item"), category: "item", needsItem: true,
  configSchema: z.object({}).strip() as never, fields: [],
  run(ctx) { items.duplicate(ctx.actor, targetItem(ctx as RunContext<{ on?: string }>).id); },
};

export const archiveItem: AutomationBlock<Record<string, never>> = {
  id: "archive_item", kind: "action", label: "Archive item", title: t("Archiveer item", "Archive item"), category: "item", needsItem: true,
  configSchema: z.object({}).strip() as never, fields: [],
  run(ctx) { items.archive(ctx.actor, targetItem(ctx as RunContext<{ on?: string }>).id); },
};

export const deleteItem: AutomationBlock<Record<string, never>> = {
  id: "delete_item", kind: "action", label: "Delete item", title: t("Verwijder item", "Delete item"), category: "item", needsItem: true,
  configSchema: z.object({}).strip() as never, fields: [],
  run(ctx) { items.remove(ctx.actor, targetItem(ctx as RunContext<{ on?: string }>).id); },
};

export const createUpdate: AutomationBlock<{ text: string; on?: string }> = {
  id: "create_update", kind: "action", label: "Post an update", title: t("Plaats een update", "Post an update"), category: "item", needsItem: true,
  configSchema: z.object({ text: z.string().min(1), on }),
  fields: [{ key: "text", kind: "longtext", label: t("tekst", "text"), required: true, placeholder: t("Gebruik {item}, {board}, {from}, {to}", "Use {item}, {board}, {from}, {to}") }, ON_PARENT_FIELD],
  run(ctx) { updates.create(ctx.actor, { itemId: targetItem(ctx).id, body: textToHtml(ctx.render(ctx.config.text)) }); },
};

export const setDate: AutomationBlock<{ columnId: string; base?: string; fromColumnId?: string; offsetValue?: number; offsetUnit?: string; direction?: string; on?: string }> = {
  id: "set_date", kind: "action", label: "Set a date", title: t("Zet een datum", "Set a date"), category: "time", needsItem: true,
  configSchema: z.object({ columnId: idReq, base: z.enum(["now", "column"]).default("now"), fromColumnId: idish.optional(), offsetValue: num.default(0), offsetUnit: z.enum(["days", "hours"]).default("days"), direction: z.enum(["after", "before"]).default("after"), on }),
  fields: [
    { key: "columnId", kind: "column", columnTypes: ["date"], label: t("datumkolom", "date column"), required: true },
    { key: "base", kind: "select", label: t("t.o.v.", "relative to"), default: "now", options: [{ value: "now", label: t("nu", "now") }, { value: "column", label: t("andere datum", "other date") }] },
    { key: "fromColumnId", kind: "column", columnTypes: ["date"], label: t("andere datum", "other date") },
    { key: "offsetValue", kind: "number", label: t("aantal", "amount"), default: 0 },
    { key: "offsetUnit", kind: "select", label: t("eenheid", "unit"), default: "days", options: [{ value: "days", label: t("dagen", "days") }, { value: "hours", label: t("uren", "hours") }] },
    { key: "direction", kind: "select", label: t("richting", "direction"), default: "after", options: [{ value: "after", label: t("later", "after") }, { value: "before", label: t("eerder", "before") }] },
  ],
  run(ctx) {
    const it = targetItem(ctx);
    let base = ctx.now();
    if (ctx.config.base === "column" && ctx.config.fromColumnId) {
      const d = (it.values[ctx.config.fromColumnId] as { date?: string; time?: string } | undefined);
      if (!d?.date) throw new ValidationError("The source date column is empty");
      base = new Date(`${d.date}T${d.time ?? "00:00:00"}Z`);
    }
    const sign = ctx.config.direction === "before" ? -1 : 1;
    const ms = (ctx.config.offsetValue ?? 0) * (ctx.config.offsetUnit === "hours" ? 3_600_000 : 86_400_000) * sign;
    const at = new Date(base.getTime() + ms).toISOString();
    items.changeColumnValue(ctx.actor, it.id, ctx.config.columnId, ctx.config.offsetUnit === "hours" ? { date: at.slice(0, 10), time: at.slice(11, 19) } : { date: at.slice(0, 10) });
  },
};

export const incrementNumber: AutomationBlock<{ columnId: string; by?: number; on?: string }> = {
  id: "increment_number", kind: "action", label: "Increment a number", title: t("Verhoog een getal", "Increment a number"), category: "column", needsItem: true,
  configSchema: z.object({ columnId: idReq, by: num.default(1), on }),
  fields: [{ key: "columnId", kind: "column", columnTypes: ["numbers"], label: t("getalkolom", "number column"), required: true }, { key: "by", kind: "number", label: t("met", "by"), default: 1 }, ON_PARENT_FIELD],
  run(ctx) {
    const it = targetItem(ctx);
    const cur = Number(it.values[ctx.config.columnId] ?? 0) || 0;
    items.changeColumnValue(ctx.actor, it.id, ctx.config.columnId, cur + (ctx.config.by ?? 1));
  },
};

const timer = (command: "start" | "stop"): AutomationBlock<{ columnId: string }> => ({
  id: `${command}_timer`, kind: "action", label: `${command === "start" ? "Start" : "Stop"} the timer`, title: command === "start" ? t("Start de timer", "Start the timer") : t("Stop de timer", "Stop the timer"), category: "time", needsItem: true,
  configSchema: z.object({ columnId: idReq }),
  fields: [{ key: "columnId", kind: "column", columnTypes: ["time_tracking"], label: t("tijdregistratie", "time tracking"), required: true }],
  run(ctx) { items.changeColumnValue(ctx.actor, ctx.item()!.id, ctx.config.columnId, { command }); },
});
export const startTimer = timer("start");
export const stopTimer = timer("stop");

export const createFromTemplate: AutomationBlock<{ templateItemId: string; boardId?: string; groupId?: string; name?: string }> = {
  id: "create_item_from_template", kind: "action", label: "Create an item from a template", title: t("Maak een item vanuit een sjabloon", "Create an item from a template"), category: "item",
  configSchema: z.object({ templateItemId: idReq, boardId: idish.optional(), groupId: idish.optional(), name: z.string().default("{item}") }),
  fields: [
    { key: "templateItemId", kind: "item", label: t("sjabloonitem", "template item"), required: true },
    { key: "boardId", kind: "board", label: t("op board", "on board") },
    { key: "groupId", kind: "group", boardField: "boardId", label: t("in groep", "in group") },
    { key: "name", kind: "text", label: t("naam", "name"), default: "{item}" },
  ],
  run(ctx) {
    const copy = items.duplicate(ctx.actor, ctx.config.templateItemId);
    const name = ctx.render(ctx.config.name ?? "{item}");
    if (name && name !== copy.name) items.update(ctx.actor, copy.id, { name });
    const targetBoard = ctx.config.boardId || copy.boardId;
    if (targetBoard !== copy.boardId || (ctx.config.groupId && ctx.config.groupId !== copy.groupId)) items.move(ctx.actor, copy.id, { boardId: targetBoard, groupId: ctx.config.groupId || undefined });
    return `item ${copy.id}`;
  },
};

export const itemActions: AutomationBlock<never>[] = [
  changeColumnValue, setStatus, assignPerson, createItem, createSubitem, moveToGroup, moveToBoard, duplicateItem, archiveItem, deleteItem,
  createUpdate, setDate, incrementNumber, startTimer, stopTimer, createFromTemplate,
] as AutomationBlock<never>[];
