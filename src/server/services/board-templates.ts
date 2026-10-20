/** Create boards from templates ("Add board" dialog). */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { NotFoundError } from "../../lib/errors";
import { idSchema, nameSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { boards, groups } from "../../db/schema/core";
import { getBoardTemplate, listBoardTemplates, templateInfo, type BoardTemplateInfo } from "../templates/registry";
import "../templates/builtin";
import * as boardsSvc from "./boards";
import * as columnsSvc from "./columns";
import * as groupsSvc from "./groups";
import * as itemsSvc from "./items";
import { insertViewRow } from "./views";
import { parse, record, type BoardRow } from "./_shared";

export function list(): BoardTemplateInfo[] {
  return listBoardTemplates().map(templateInfo);
}

const input = z.object({
  templateId: z.string().min(1).default("blank"),
  workspaceId: idSchema,
  folderId: idSchema.nullish(),
  name: nameSchema,
  visibility: z.enum(["public", "private", "share"]).default("public"),
  description: z.string().max(5000).nullish(),
});

/** Creates the board (as `boards.create` does), then replaces the default content with the template. */
export function createBoard(actor: Actor, raw: unknown): BoardRow {
  const d = parse(input, raw);
  const tpl = getBoardTemplate(d.templateId);
  if (!tpl) throw new NotFoundError("Template");
  const b = boardsSvc.create(actor, { workspaceId: d.workspaceId, folderId: d.folderId, name: d.name, visibility: d.visibility, description: d.description ?? null, kind: tpl.kind ?? "board", emptyColumns: true });
  const sys = { ...actor, isSystem: true } as Actor; // permissions were checked by boards.create
  db.transaction(() => {
    // groups: reuse the default one for the first template group
    const existing = groupsSvc.activeGroups(b.id);
    const groupIds: { id: string; title: string }[] = [];
    tpl.groups.forEach((g, i) => {
      if (i === 0 && existing[0]) {
        const row = db.update(groups).set({ title: g.title, ...(g.color ? { color: g.color } : {}) }).where(eq(groups.id, existing[0].id)).returning().get();
        groupIds.push({ id: row.id, title: row.title });
      } else {
        const row = groupsSvc.insertGroupRow(b.id, { title: g.title, color: g.color });
        groupIds.push({ id: row.id, title: row.title });
      }
    });
    for (const c of tpl.columns) {
      columnsSvc.insertColumnRow(b.id, { title: c.title, type: c.type, scope: c.scope ?? "item", settings: c.settings, key: c.key, width: c.width }, { keyBase: c.key ?? c.type });
    }
    if (tpl.columns.some((c) => c.scope === "subitem")) itemsSvc.ensureSubitemColumns(b.id);
    for (const it of tpl.items ?? []) {
      const gid = typeof it.group === "number" ? groupIds[it.group]?.id : groupIds.find((g) => g.title === it.group)?.id;
      const row = itemsSvc.create(sys, { boardId: b.id, groupId: gid ?? groupIds[0].id, name: it.name, values: it.values });
      for (const s of it.subitems ?? []) itemsSvc.create(sys, { boardId: b.id, parentItemId: row.id, name: s.name, values: s.values });
    }
    if (tpl.views?.length) {
      for (const v of tpl.views) insertViewRow(b.id, { name: v.name, type: v.type, settings: v.settings });
    }
    db.update(boards).set({ settings: { ...b.settings, template: tpl.id } }).where(eq(boards.id, b.id)).run();
    tpl.afterCreate?.(actor, b.id);
  });
  record(actor, { type: "board.created", boardId: b.id }, { event: "create_board_from_template", data: { name: b.name, template: tpl.id } });
  return db.select().from(boards).where(eq(boards.id, b.id)).get()!;
}

