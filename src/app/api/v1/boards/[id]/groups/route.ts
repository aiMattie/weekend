import { api } from "@/server/http";
import { groups } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => groups.list(actor, params.id));
export const POST = api<P>(async ({ actor, params, body }) => groups.create(actor, params.id, await body()), { status: 201 });
