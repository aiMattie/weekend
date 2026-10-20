import { api, intParam } from "@/server/http";
import { inbox } from "@/server/services";

export const GET = api(({ actor, query }) =>
  inbox.list(actor, { filter: query.get("filter") ?? undefined, limit: intParam(query, "limit"), cursor: query.get("cursor") ?? undefined }));
export const POST = api(async ({ actor, body }) => inbox.create(actor, await body()), { status: 201 });
