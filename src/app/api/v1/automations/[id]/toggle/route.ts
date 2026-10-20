import { api } from "@/server/http";
import { automations } from "@/server/services";

export const POST = api<{ id: string }>(async ({ actor, params, body }) => {
  const b = await body();
  return automations.toggle(actor, params.id, typeof b.active === "boolean" ? b.active : undefined);
});
