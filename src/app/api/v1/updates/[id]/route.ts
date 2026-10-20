import { api } from "@/server/http";
import { updates } from "@/server/services";

type P = { id: string };
export const PATCH = api<P>(async ({ actor, params, body }) => updates.edit(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => updates.remove(actor, params.id));
