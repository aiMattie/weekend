import { api } from "@/server/http";
import { boards } from "@/server/services";

export const POST = api<{ id: string }>(async ({ actor, params, body }) => boards.move(actor, params.id, await body()));
