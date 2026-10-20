import { api } from "@/server/http";
import { automations } from "@/server/services";

/** POST { approve: boolean } on a run waiting for approval (workflow approval step). */
export const POST = api<{ runId: string }>(async ({ actor, params, body }) => automations.decideRun(actor, params.runId, (await body()).approve === true));
