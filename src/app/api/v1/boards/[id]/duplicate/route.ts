import { api } from "@/server/http";
import { boards } from "@/server/services";

/** body: { name?, withItems?, withUpdates? } */
export const POST = api<{ id: string }>(async ({ actor, params, body }) => boards.duplicate(actor, params.id, await body()), { status: 201 });
