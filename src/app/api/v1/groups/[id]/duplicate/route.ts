import { api } from "@/server/http";
import { groups } from "@/server/services";

export const POST = api<{ id: string }>(async ({ actor, params, body }) => groups.duplicate(actor, params.id, await body()), { status: 201 });
