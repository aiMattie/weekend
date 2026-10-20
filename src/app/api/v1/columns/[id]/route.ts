import { api } from "@/server/http";
import { columns } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => columns.get(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => columns.update(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => columns.remove(actor, params.id));
