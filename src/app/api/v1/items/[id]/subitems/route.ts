import { api } from "@/server/http";
import { items } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => items.listSubitems(actor, params.id));
/** body: { name, values? } */
export const POST = api<P>(async ({ actor, params, body }) => {
  const parent = items.get(actor, params.id);
  return items.create(actor, { ...(await body()), boardId: parent.boardId, parentItemId: params.id });
}, { status: 201 });
