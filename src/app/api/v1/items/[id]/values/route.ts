import { api } from "@/server/http";
import { items } from "@/server/services";

/** change_multiple_column_values. body: { "<columnIdOrKey>": value, ... } */
export const PUT = api<{ id: string }>(async ({ actor, params, body }) => items.changeMultipleColumnValues(actor, params.id, await body()));
