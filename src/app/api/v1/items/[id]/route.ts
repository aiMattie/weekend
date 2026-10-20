import { api } from "@/server/http";
import { items } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => items.get(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => items.update(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => items.remove(actor, params.id));
