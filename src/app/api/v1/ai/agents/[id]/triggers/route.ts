import { api } from "@/server/http";
import { agents } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => agents.listTriggers(actor, { agent_id: params.id }));
export const POST = api<P>(async ({ actor, params, body }) => agents.addTrigger(actor, params.id, await body()), { status: 201 });
