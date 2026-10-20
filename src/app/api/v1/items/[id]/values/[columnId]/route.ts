import { api } from "@/server/http";
import { items } from "@/server/services";

/** change_column_value. body: { value } (null clears) */
export const PUT = api<{ id: string; columnId: string }>(async ({ actor, params, body }) => items.changeColumnValue(actor, params.id, params.columnId, (await body()).value ?? null));
