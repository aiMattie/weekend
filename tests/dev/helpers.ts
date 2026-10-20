import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { sprintItems } from "../../src/db/schema/sprints";
import { createDevWorkspaceTemplate } from "../../src/server/services/dev-template";
import * as itemsSvc from "../../src/server/services/items";
import * as sprintsSvc from "../../src/server/services/sprints";
import type { Ctx } from "../helpers";

export function devSetup(ctx: Ctx) {
  const t = createDevWorkspaceTemplate(ctx.accountId);
  const mkTask = (name: string, est = 3, status = "Ready", extra: Record<string, unknown> = {}) =>
    itemsSvc.create(ctx.sys, { boardId: t.boards.taken, name, values: { status, schatting: est, ...extra } }).id;
  const rows = (sprintId: string) => db.select().from(sprintItems).where(eq(sprintItems.sprintId, sprintId)).all();
  const sprint = (name: string, startsOn?: string, endsOn?: string) => sprintsSvc.createSprint(ctx.sys, { boardId: t.boards.sprints, name, startsOn, endsOn });
  return { t, mkTask, rows, sprint };
}
