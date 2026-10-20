import { api } from "@/server/http";
import { docs } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => docs.listComments(actor, params.id));
/** body: { body, blockId?, parentId? } */
export const POST = api<P>(async ({ actor, params, body }) => docs.addComment(actor, params.id, await body()), { status: 201 });
