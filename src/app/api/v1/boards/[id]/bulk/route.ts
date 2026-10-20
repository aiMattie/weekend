import { api } from "@/server/http";
import * as bulk from "@/server/services/bulk";

/** body: { action: "duplicate"|"archive"|"delete"|"restore"|"move"|"update", itemIds, groupId?, boardId?, columnId?, value? } */
export const POST = api<{ id: string }>(async ({ actor, params, body }) => bulk.apply(actor, params.id, await body()));
