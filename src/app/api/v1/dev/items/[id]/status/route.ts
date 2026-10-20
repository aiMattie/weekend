import { ValidationError } from "@/lib/errors";
import { api } from "@/server/http";
import { sprints } from "@/server/services";

type P = { id: string };
export const PUT = api<P>(async ({ actor, params, body }) => {
  const b = await body();
  if (typeof b.status !== "string" || !b.status) throw new ValidationError("status is required");
  return sprints.setStatus(actor, params.id, b.status);
});
