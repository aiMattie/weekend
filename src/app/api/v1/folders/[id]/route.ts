import { api } from "@/server/http";
import { folders } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => folders.get(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => folders.update(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => folders.remove(actor, params.id));
