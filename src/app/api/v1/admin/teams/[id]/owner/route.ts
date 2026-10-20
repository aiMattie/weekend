import { api } from "@/server/http";
import { teams } from "@/server/services";

type P = { id: string };
/** body: { userId, isOwner } */
export const PUT = api<P>(async ({ actor, params, body }) => {
  const b = await body();
  return teams.setOwner(actor, params.id, String(b.userId ?? ""), b.isOwner !== false);
});
