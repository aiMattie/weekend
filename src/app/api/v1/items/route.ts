import { ValidationError } from "@/lib/errors";
import { api, boolParam, intParam } from "@/server/http";
import { items } from "@/server/services";

/** GET ?boardId=&groupId=&parentItemId=&includeSubitems=&state=&limit=&offset= */
export const GET = api(({ actor, query }) => {
  const boardId = query.get("boardId");
  if (!boardId) throw new ValidationError("boardId is required");
  return items.list(actor, {
    boardId, groupId: query.get("groupId") ?? undefined, parentItemId: query.get("parentItemId") ?? undefined,
    includeSubitems: boolParam(query, "includeSubitems"), state: query.get("state") ?? undefined, limit: intParam(query, "limit"), offset: intParam(query, "offset"),
  });
});
/** body: { boardId, groupId?, parentItemId?, name, values?, beforeId?|afterId?|top? } */
export const POST = api(async ({ actor, body }) => items.create(actor, await body()), { status: 201 });
