import { api } from "@/server/http";
import { whiteboards } from "@/server/services";

export const GET = api(({ actor, query }) => whiteboards.list(actor, { workspaceId: query.get("workspaceId") ?? undefined }));
/** body: { workspaceId, name?, data? } */
export const POST = api(async ({ actor, body }) => whiteboards.create(actor, await body()), { status: 201 });
