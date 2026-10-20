import { api } from "@/server/http";
import { columnLookup } from "@/server/services";

/** Item picker (connect boards / dependency): GET ?boardIds=a,b&q=text&limit=50&excludeItemId= */
export const GET = api(({ actor, query }) =>
  columnLookup.searchItems(actor, {
    boardIds: (query.get("boardIds") ?? "").split(",").filter(Boolean),
    q: query.get("q") ?? undefined,
    limit: query.get("limit") ? Number(query.get("limit")) : undefined,
    excludeItemId: query.get("excludeItemId") ?? undefined,
  }));
