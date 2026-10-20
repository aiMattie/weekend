import { api } from "@/server/http";
import { items } from "@/server/services";

/** body: { withUpdates? } */
export const POST = api<{ id: string }>(async ({ actor, params, body }) => items.duplicate(actor, params.id, await body()));
