import { api } from "@/server/http";
import * as views from "@/server/services/views";

/** "Save to this view". body: { filters, sort, hiddenColumnIds, groupByColumnId, pinnedColumnIds } */
export const PUT = api<{ id: string }>(async ({ actor, params, body }) => views.saveState(actor, params.id, await body()));
