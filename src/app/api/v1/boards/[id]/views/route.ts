import { api } from "@/server/http";
import { views } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => views.list(actor, params.id));
export const POST = api<P>(async ({ actor, params, body }) => views.create(actor, params.id, await body()), { status: 201 });
