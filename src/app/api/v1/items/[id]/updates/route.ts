import { api } from "@/server/http";
import { updates } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => updates.list(actor, params.id));
/** body: { body: "<p>html</p>", parentUpdateId? } */
export const POST = api<P>(async ({ actor, params, body }) => updates.create(actor, { ...(await body()), itemId: params.id }), { status: 201 });
