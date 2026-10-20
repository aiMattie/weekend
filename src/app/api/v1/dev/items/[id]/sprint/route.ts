import { api } from "@/server/http";
import { sprints } from "@/server/services";

type P = { id: string };
export const PUT = api<P>(async ({ actor, params, body }) => {
  const b = await body();
  return sprints.assignItem(actor, params.id, b.sprintId === null || b.sprintId === undefined ? null : String(b.sprintId));
});
