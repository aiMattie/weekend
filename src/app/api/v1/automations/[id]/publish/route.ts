import { api } from "@/server/http";
import { automations } from "@/server/services";

/** POST { publish?: boolean } publishes (default) or unpublishes a workflow. */
export const POST = api<{ id: string }>(async ({ actor, params, body }) => automations.publishWorkflow(actor, params.id, (await body()).publish !== false));
