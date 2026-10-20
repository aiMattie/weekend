import { api } from "@/server/http";
import { whiteboards } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => whiteboards.get(actor, params.id));
/** body: { name?, data?, patch?: { upsert?, remove?, view? }, baseVersion? } */
export const PATCH = api<P>(async ({ actor, params, body }) => whiteboards.update(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => whiteboards.remove(actor, params.id));
