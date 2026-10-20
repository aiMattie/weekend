import { api } from "@/server/http";
import { permissionsAdmin } from "@/server/services";

type P = { id: string };
/** body: { userId, role: owner|member|viewer|null } */
export const PUT = api<P>(async ({ actor, params, body }) => {
  const b = await body();
  return permissionsAdmin.setWorkspaceMember(actor, params.id, String(b.userId ?? ""), (b.role ?? null) as "owner" | "member" | "viewer" | null);
});
