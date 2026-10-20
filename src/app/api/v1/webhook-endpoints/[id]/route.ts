import { api } from "@/server/http";
import { webhooks } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => webhooks.get(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => webhooks.update(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => webhooks.remove(actor, params.id));
