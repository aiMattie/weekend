import { api } from "@/server/http";
import { automations } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => automations.get(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => automations.update(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => automations.remove(actor, params.id));
