import { api } from "@/server/http";
import { groups } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => groups.get(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => groups.update(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => groups.remove(actor, params.id));
