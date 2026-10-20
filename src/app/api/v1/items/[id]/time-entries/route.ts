import { api } from "@/server/http";
import { timeEntries } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => timeEntries.list(actor, params.id));
export const POST = api<P>(async ({ actor, params, body }) => timeEntries.create(actor, { ...(await body()), itemId: params.id }), { status: 201 });
