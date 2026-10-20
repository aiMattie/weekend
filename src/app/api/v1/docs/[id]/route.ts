import { api } from "@/server/http";
import { docs } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => docs.get(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => docs.update(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => docs.remove(actor, params.id));
