import { api } from "@/server/http";
import { columns } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params, query }) => columns.list(actor, params.id, (query.get("scope") as "item" | "subitem" | null) ?? undefined));
export const POST = api<P>(async ({ actor, params, body }) => columns.create(actor, params.id, await body()), { status: 201 });
