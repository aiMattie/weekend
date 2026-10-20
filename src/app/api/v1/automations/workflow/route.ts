import { api } from "@/server/http";
import { ai, automations } from "@/server/services";

/** POST { boardId, name?, text? | definition? } creates a draft workflow (text = natural language plan, Claude first). */
export const POST = api(async ({ actor, body }) => {
  const b = await body();
  return b.text && !b.definition ? ai.nl.createWorkflow(actor, b) : automations.createWorkflow(actor, b);
}, { status: 201 });
