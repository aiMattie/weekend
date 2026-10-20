/** Admin > AI: limits, kill switch, model, usage. */
import { api } from "@/server/http";
import { ai } from "@/server/services";

export const GET = api(({ actor }) => ({ settings: ai.getSettings(actor.accountId), status: ai.status(actor), usage: ai.usageSummary(actor) }));
export const PATCH = api(async ({ actor, body }) => ({ settings: ai.updateSettings(actor, await body()), status: ai.status(actor) }));
