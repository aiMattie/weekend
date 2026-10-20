import { api } from "@/server/http";
import { docs } from "@/server/services";

/** GET ?workspaceId=&itemId= */
export const GET = api(({ actor, query }) => docs.list(actor, { workspaceId: query.get("workspaceId") ?? undefined, itemId: query.get("itemId") ?? undefined }));
/** body: { workspaceId | itemId, columnId?, title?, markdown?, blocks?, cover?, visibility? } */
export const POST = api(async ({ actor, body }) => docs.create(actor, await body()), { status: 201 });
