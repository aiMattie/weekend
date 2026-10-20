import { api } from "@/server/http";
import * as views from "@/server/services/views";

/** "Save as new view". body: { name, personal?, type?, state: { filters, sort, hiddenColumnIds, groupByColumnId, pinnedColumnIds } } */
export const POST = api<{ id: string }>(async ({ actor, params, body }) => views.createFromState(actor, params.id, await body()), { status: 201 });
