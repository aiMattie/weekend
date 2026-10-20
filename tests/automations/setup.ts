import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { automationRuns } from "../../src/db/schema/automations";
import { drain, setEngineClock } from "../../src/server/automations/engine";
import { setMailTransport, type Mail } from "../../src/server/automations/mailer";
import * as automations from "../../src/server/services/automations";
import * as columns from "../../src/server/services/columns";
import * as groups from "../../src/server/services/groups";
import * as items from "../../src/server/services/items";
import { startEngine } from "../../src/server/automations/engine";
import { freshCtx, type Ctx } from "../helpers";

export interface AutoCtx extends Ctx {
  statusId: string; peopleId: string; dateId: string;
  doneLabel: string; workingLabel: string; stuckLabel: string;
  todoGroup: string; doneGroup: string;
  mails: Mail[];
}

export async function autoCtx(): Promise<AutoCtx> {
  const c = await freshCtx();
  setEngineClock(null);
  startEngine();
  const mails: Mail[] = [];
  setMailTransport(async (m) => { mails.push(m); });
  const cols = columns.list(c.admin, c.boardId);
  const status = cols.find((x) => x.key === "status")!;
  const labels = status.settings.labels as { id: number; text: string }[];
  const gs = groups.list(c.admin, c.boardId);
  const done = groups.create(c.admin, c.boardId, { title: "Afgerond" });
  return {
    ...c, mails,
    statusId: status.id, peopleId: cols.find((x) => x.key === "people")!.id, dateId: cols.find((x) => x.key === "date")!.id,
    doneLabel: String(labels.find((l) => l.text === "Done")!.id), workingLabel: String(labels.find((l) => l.text === "Working on it")!.id), stuckLabel: String(labels.find((l) => l.text === "Stuck")!.id),
    todoGroup: gs[0].id, doneGroup: done.id,
  };
}

export async function settle(): Promise<void> { await drain(); }

export const runsOf = (automationId: string) => db.select().from(automationRuns).where(eq(automationRuns.automationId, automationId)).all();

export function makeAutomation(c: AutoCtx, input: Record<string, unknown>) {
  return automations.create(c.admin, { boardId: c.boardId, name: "test", ...input });
}
export const newItem = (c: AutoCtx, name = "Taak", extra: Record<string, unknown> = {}) => items.create(c.admin, { boardId: c.boardId, name, ...extra });
