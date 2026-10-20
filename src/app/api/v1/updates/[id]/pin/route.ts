import { api } from "@/server/http";
import { updates } from "@/server/services";

/** body: { pinned: boolean } */
export const POST = api<{ id: string }>(async ({ actor, params, body }) => updates.setPinned(actor, params.id, (await body()).pinned !== false));
