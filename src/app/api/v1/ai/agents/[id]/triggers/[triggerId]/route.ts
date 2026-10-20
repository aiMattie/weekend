import { api } from "@/server/http";
import { agents } from "@/server/services";

type P = { id: string; triggerId: string };
export const PATCH = api<P>(async ({ actor, params, body }) => agents.setTriggerActive(actor, params.id, params.triggerId, (await body()).active !== false));
export const DELETE = api<P>(({ actor, params }) => agents.removeTrigger(actor, params.id, params.triggerId));
