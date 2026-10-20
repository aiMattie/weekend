/** Event based triggers ("When ..."). Time based triggers live in triggers-time.ts. */
import { z } from "zod";
import type { PeopleValue } from "../../columns/people";
import type { AutomationBlock } from "./types";

const idish = z.union([z.string(), z.number()]).transform(String);
const optId = idish.optional();
const t = (nl: string, en: string) => ({ nl, en });

const peopleIds = (v: unknown): string[] => ((v as PeopleValue | null)?.personsAndTeams ?? []).filter((p) => p.kind === "person").map((p) => p.id);

type Ev<T extends string> = import("../../../lib/events").AppEvent & { type: T };

export const itemCreated: AutomationBlock<{ groupId?: string }> = {
  id: "item_created", kind: "trigger", label: "When an item is created", title: t("Wanneer een item wordt aangemaakt", "When an item is created"),
  category: "item", configSchema: z.object({ groupId: optId }),
  fields: [{ key: "groupId", kind: "group", label: t("in groep", "in group") }],
  events: ["item.created"],
  matches(event, c, ctx) {
    const e = event as Ev<"item.created">;
    if (e.parentItemId) return false;
    if (!c.groupId) return true;
    return ctx.item(e.itemId)?.groupId === c.groupId;
  },
};

export const subitemCreated: AutomationBlock<Record<string, never>> = {
  id: "subitem_created", kind: "trigger", label: "When a subitem is created", title: t("Wanneer een subitem wordt aangemaakt", "When a subitem is created"),
  category: "subitem", configSchema: z.object({}).strip() as never, fields: [],
  events: ["item.created"],
  matches: (event) => !!(event as Ev<"item.created">).parentItemId,
};

export const columnChanged: AutomationBlock<{ columnId?: string }> = {
  id: "column_changed", kind: "trigger", label: "When a column changes", title: t("Wanneer een kolom verandert", "When a column changes"),
  category: "column", configSchema: z.object({ columnId: optId }),
  fields: [{ key: "columnId", kind: "column", label: t("kolom", "column") }],
  events: ["column_value.changed"],
  matches(event, c, ctx) {
    const e = event as Ev<"column_value.changed">;
    if (ctx.item(e.itemId)?.parentItemId) return false;
    return !c.columnId || e.columnId === c.columnId;
  },
};

export const statusChangesTo: AutomationBlock<{ columnId?: string; labelId?: string; fromLabelId?: string }> = {
  id: "status_changes_to", kind: "trigger", label: "When a status changes to", title: t("Wanneer een status verandert naar", "When a status changes to"),
  category: "status", configSchema: z.object({ columnId: optId, labelId: optId, fromLabelId: optId }),
  fields: [
    { key: "columnId", kind: "column", columnTypes: ["status"], label: t("status", "status"), required: true },
    { key: "labelId", kind: "label", of: "columnId", label: t("naar", "to") },
    { key: "fromLabelId", kind: "label", of: "columnId", label: t("van", "from") },
  ],
  events: ["column_value.changed"],
  matches(event, c, ctx) {
    const e = event as Ev<"column_value.changed">;
    if (e.columnType !== "status") return false;
    if (c.columnId && e.columnId !== c.columnId) return false;
    if (ctx.item(e.itemId)?.parentItemId) return false;
    const to = (e.to as { index?: number } | null)?.index;
    const from = (e.from as { index?: number } | null)?.index;
    if (c.labelId !== undefined && c.labelId !== "" && String(to) !== c.labelId) return false;
    if (c.fromLabelId !== undefined && c.fromLabelId !== "" && String(from) !== c.fromLabelId) return false;
    return true;
  },
};

export const subitemCompleted: AutomationBlock<Record<string, never>> = {
  id: "subitem_completed", kind: "trigger", label: "When a subitem is completed", title: t("Wanneer een subitem klaar is", "When a subitem is completed"),
  category: "subitem", configSchema: z.object({}).strip() as never, fields: [],
  events: ["column_value.changed"],
  matches(event, _c, ctx) {
    const e = event as Ev<"column_value.changed">;
    if (e.columnType !== "status") return false;
    const it = ctx.item(e.itemId);
    if (!it?.parentItemId) return false;
    const col = ctx.column(e.columnId);
    const idx = (e.to as { index?: number } | null)?.index;
    const labels = (col?.settings.labels as { id: number; isDone?: boolean }[] | undefined) ?? [];
    return !!labels.find((l) => l.id === idx)?.isDone;
  },
};

export const personAssigned: AutomationBlock<{ columnId?: string; userId?: string }> = {
  id: "person_assigned", kind: "trigger", label: "When a person is assigned", title: t("Wanneer een persoon wordt toegewezen", "When a person is assigned"),
  category: "people", configSchema: z.object({ columnId: optId, userId: optId }),
  fields: [
    { key: "columnId", kind: "column", columnTypes: ["people"], label: t("kolom", "column") },
    { key: "userId", kind: "user", label: t("persoon", "person") },
  ],
  events: ["column_value.changed"],
  matches(event, c, ctx) {
    const e = event as Ev<"column_value.changed">;
    if (e.columnType !== "people") return false;
    if (c.columnId && e.columnId !== c.columnId) return false;
    if (ctx.item(e.itemId)?.parentItemId) return false;
    const before = new Set(peopleIds(e.from));
    const added = peopleIds(e.to).filter((id) => !before.has(id));
    return c.userId ? added.includes(c.userId) : added.length > 0;
  },
};

export const buttonClicked: AutomationBlock<{ columnId?: string }> = {
  id: "button_clicked", kind: "trigger", label: "When a button is clicked", title: t("Wanneer op een knop wordt geklikt", "When a button is clicked"),
  category: "button", configSchema: z.object({ columnId: optId }),
  fields: [{ key: "columnId", kind: "column", columnTypes: ["button"], label: t("knop", "button"), required: true }],
  events: ["button.clicked"],
  matches: (event, c) => !c.columnId || (event as Ev<"button.clicked">).columnId === c.columnId,
};

export const itemMovedToGroup: AutomationBlock<{ groupId?: string }> = {
  id: "item_moved_to_group", kind: "trigger", label: "When an item is moved to a group", title: t("Wanneer een item naar een groep wordt verplaatst", "When an item is moved to a group"),
  category: "item", configSchema: z.object({ groupId: optId }),
  fields: [{ key: "groupId", kind: "group", label: t("groep", "group"), required: true }],
  events: ["item.moved"],
  matches(event, c, ctx) {
    const e = event as Ev<"item.moved">;
    if (e.parentItemId) return false;
    const mv = ctx.lastMove(e.itemId);
    if (!mv || mv.fromGroupId === mv.toGroupId) return false;
    return !c.groupId || mv.toGroupId === c.groupId;
  },
};

export const updateCreated: AutomationBlock<Record<string, never>> = {
  id: "update_created", kind: "trigger", label: "When an update is posted", title: t("Wanneer een update wordt geplaatst", "When an update is posted"),
  category: "item", configSchema: z.object({}).strip() as never, fields: [], events: ["update.created"],
  matches: () => true,
};

export const sprintStarted: AutomationBlock<Record<string, never>> = {
  id: "sprint_started", kind: "trigger", label: "When a sprint starts", title: t("Wanneer een sprint start", "When a sprint starts"),
  category: "dev", configSchema: z.object({}).strip() as never, fields: [], events: ["sprint.started"], matches: () => true,
};
export const sprintCompleted: AutomationBlock<Record<string, never>> = {
  id: "sprint_completed", kind: "trigger", label: "When a sprint is completed", title: t("Wanneer een sprint wordt afgesloten", "When a sprint is completed"),
  category: "dev", configSchema: z.object({}).strip() as never, fields: [], events: ["sprint.completed"], matches: () => true,
};

export const eventTriggers: AutomationBlock<never>[] = [
  itemCreated, subitemCreated, columnChanged, statusChangesTo, subitemCompleted, personAssigned, buttonClicked,
  itemMovedToGroup, updateCreated, sprintStarted, sprintCompleted,
] as AutomationBlock<never>[];
