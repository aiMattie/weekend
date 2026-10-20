import { api } from "@/server/http";
import { guests } from "@/server/services";

type P = { id: string };
export const PUT = api<P>(async ({ actor, params, body }) => guests.setAccess(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => { guests.removeGuest(actor, params.id); });
