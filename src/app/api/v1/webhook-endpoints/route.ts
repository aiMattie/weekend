import { api } from "@/server/http";
import { webhooks } from "@/server/services";

export const GET = api(({ actor, query }) => webhooks.list(actor, { boardId: query.get("boardId") }));
export const POST = api(async ({ actor, body }) => webhooks.create(actor, await body()), { status: 201 });
