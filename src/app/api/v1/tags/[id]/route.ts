import { api } from "@/server/http";
import { tags } from "@/server/services";

type P = { id: string };
export const PATCH = api<P>(async ({ actor, params, body }) => tags.update(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => tags.remove(actor, params.id));
