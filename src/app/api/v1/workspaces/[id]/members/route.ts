import { api } from "@/server/http";
import { workspaces } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => workspaces.listMembers(actor, params.id));
/** body: { userId, role?: owner|member|viewer } */
export const PUT = api<P>(async ({ actor, params, body }) => {
  const b = await body();
  workspaces.setMember(actor, params.id, String(b.userId), (b.role as "owner" | "member" | "viewer") ?? "member");
  return workspaces.listMembers(actor, params.id);
});
/** ?userId= */
export const DELETE = api<P>(({ actor, params, query }) => workspaces.removeMember(actor, params.id, query.get("userId") ?? ""));
