import { api } from "@/server/http";
import { boards } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => boards.get(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => boards.update(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => boards.remove(actor, params.id));
