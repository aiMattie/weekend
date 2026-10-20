import { api } from "@/server/http";
import { retros } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => retros.list(actor, params.id));
export const POST = api<P>(async ({ actor, params, body }) => retros.addCard(actor, params.id, await body()), { status: 201 });
