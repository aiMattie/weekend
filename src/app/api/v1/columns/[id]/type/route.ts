import { api } from "@/server/http";
import { columnOps } from "@/server/services";

/** Change a column's type and convert its values. body: { type } */
export const POST = api<{ id: string }>(async ({ actor, params, body }) => columnOps.changeType(actor, params.id, await body()));
