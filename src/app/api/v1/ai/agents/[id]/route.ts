import { api } from "@/server/http";
import { agents } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => agents.get(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => agents.update(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => agents.remove(actor, params.id));
