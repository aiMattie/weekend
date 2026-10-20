import { api } from "@/server/http";
import { notetaker } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => notetaker.get(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => notetaker.update(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => notetaker.remove(actor, params.id));
