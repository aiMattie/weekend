import { api } from "@/server/http";
import { docs } from "@/server/services";

type P = { id: string; commentId: string };
/** body: { resolved: boolean } */
export const PATCH = api<P>(async ({ actor, params, body }) => docs.resolveComment(actor, params.id, params.commentId, (await body()).resolved !== false));
export const DELETE = api<P>(({ actor, params }) => docs.removeComment(actor, params.id, params.commentId));
