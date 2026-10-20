import { api } from "@/server/http";
import { members } from "@/server/services";

type P = { id: string };
/** body: { role, customRoleId? } to change the role, or { isActive } to (de)activate */
export const PATCH = api<P>(async ({ actor, params, body }) => {
  const b = await body();
  if (typeof b.isActive === "boolean") return members.setActive(actor, params.id, b.isActive);
  return members.setRole(actor, params.id, b);
});
