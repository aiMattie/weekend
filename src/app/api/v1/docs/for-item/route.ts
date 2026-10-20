import { api } from "@/server/http";
import { docs } from "@/server/services";

/** body: { itemId, columnId? } -> the doc attached to the item (created on first use) */
export const POST = api(async ({ actor, body }) => docs.getOrCreateForItem(actor, await body()));
