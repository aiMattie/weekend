import { api } from "@/server/http";
import { integrations } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => integrations.get(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => integrations.update(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => integrations.remove(actor, params.id));
