/** Advanced actions: epic + first tasks, client workspace from template, invoice task. */
import { z } from "zod";
import { ValidationError } from "../../../lib/errors";
import * as items from "../../services/items";
import * as updates from "../../services/updates";
import { getAutomationHook } from "../hooks";
import { textToHtml } from "./helpers";
import type { AutomationBlock } from "./types";

const t = (nl: string, en: string) => ({ nl, en });
const idish = z.union([z.string(), z.number()]).transform(String);

export const createEpicWithTasks: AutomationBlock<{ epicBoardId: string; epicGroupId?: string; epicName: string; taskBoardId: string; taskGroupId?: string; tasks: string[]; linkColumnId?: string }> = {
  id: "create_epic_with_tasks", kind: "action", label: "Create an epic with first tasks", title: t("Maak een epic met eerste taken", "Create an epic with first tasks"), category: "item",
  configSchema: z.object({
    epicBoardId: idish.pipe(z.string().min(1)), epicGroupId: idish.optional(), epicName: z.string().default("{item}"),
    taskBoardId: idish.pipe(z.string().min(1)), taskGroupId: idish.optional(), tasks: z.array(z.string().min(1)).default([]), linkColumnId: idish.optional(),
  }),
  fields: [
    { key: "epicBoardId", kind: "board", label: t("epic-board", "epics board"), required: true },
    { key: "epicGroupId", kind: "group", boardField: "epicBoardId", label: t("epic-groep", "epic group") },
    { key: "epicName", kind: "text", label: t("naam van de epic", "epic name"), default: "{item}" },
    { key: "taskBoardId", kind: "board", label: t("taken-board", "tasks board"), required: true },
    { key: "taskGroupId", kind: "group", boardField: "taskBoardId", label: t("taken-groep", "tasks group") },
    { key: "tasks", kind: "list", label: t("eerste taken (een per regel)", "first tasks (one per line)"), required: true },
    { key: "linkColumnId", kind: "column", boardField: "taskBoardId", label: t("koppelkolom naar epic (optioneel)", "link column to epic (optional)") },
  ],
  run(ctx) {
    const epic = items.create(ctx.actor, { boardId: ctx.config.epicBoardId, groupId: ctx.config.epicGroupId || undefined, name: ctx.render(ctx.config.epicName) || "Epic" });
    let made = 0;
    for (const name of ctx.config.tasks) {
      const task = items.create(ctx.actor, { boardId: ctx.config.taskBoardId, groupId: ctx.config.taskGroupId || undefined, name: ctx.render(name) });
      made++;
      let linked = false;
      if (ctx.config.linkColumnId) {
        for (const candidate of [[epic.id], { item_ids: [Number(epic.id)] }, { linkedPulseIds: [{ linkedPulseId: Number(epic.id) }] }, epic.name]) {
          try { items.changeColumnValue(ctx.actor, task.id, ctx.config.linkColumnId, candidate); linked = true; break; } catch { /* try next shape */ }
        }
      }
      if (!linked) updates.create(ctx.actor, { itemId: task.id, body: textToHtml(`Epic: ${epic.name}`) });
    }
    return `epic ${epic.id}, ${made} task(s)`;
  },
};

export const createClientWorkspace: AutomationBlock<{ name?: string; templateKey?: string }> = {
  id: "create_client_workspace", kind: "action", label: "Create a client workspace from template", title: t("Maak een klant-workspace vanuit het sjabloon", "Create a client workspace from the template"), category: "item",
  configSchema: z.object({ name: z.string().default("{item}"), templateKey: z.string().optional() }),
  fields: [{ key: "name", kind: "text", label: t("naam van de workspace", "workspace name"), default: "{item}" }],
  async run(ctx) {
    const hook = getAutomationHook("create_client_workspace");
    if (!hook) throw new ValidationError("Client workspace template is not available (hook create_client_workspace is not registered)");
    const it = ctx.item();
    const r = await hook({ actor: ctx.actor, name: ctx.render(ctx.config.name ?? "{item}") || "Klant", sourceItemId: it?.id ?? null, sourceBoardId: ctx.boardId, templateKey: ctx.config.templateKey });
    return `workspace ${r.workspaceId}`;
  },
};

export const advancedActions: AutomationBlock<never>[] = [createEpicWithTasks, createClientWorkspace] as AutomationBlock<never>[];
