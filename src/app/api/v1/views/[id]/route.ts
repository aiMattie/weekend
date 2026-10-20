import { api } from "@/server/http";
import { views } from "@/server/services";

type P = { id: string };
export const PATCH = api<P>(async ({ actor, params, body }) => views.update(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => views.remove(actor, params.id));
