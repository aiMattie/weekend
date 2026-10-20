import { api } from "@/server/http";
import { boards } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => boards.listMembers(actor, params.id));
/** body: { userId, role?: owner|editor|viewer } */
export const PUT = api<P>(async ({ actor, params, body }) => {
  const b = await body();
  boards.setMember(actor, params.id, String(b.userId), (b.role as "owner" | "editor" | "viewer") ?? "editor");
  return boards.listMembers(actor, params.id);
});
export const DELETE = api<P>(({ actor, params, query }) => boards.removeMember(actor, params.id, query.get("userId") ?? ""));
