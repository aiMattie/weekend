import { api } from "@/server/http";
import { sprints } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => sprints.listSprints(actor, params.id));
export const POST = api<P>(async ({ actor, params, body }) => sprints.createSprint(actor, { ...(await body()), boardId: params.id }), { status: 201 });
