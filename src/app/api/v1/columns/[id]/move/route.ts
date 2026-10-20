import { api } from "@/server/http";
import { columns } from "@/server/services";

export const POST = api<{ id: string }>(async ({ actor, params, body }) => columns.move(actor, params.id, await body()));
