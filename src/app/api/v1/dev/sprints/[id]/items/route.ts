import { api } from "@/server/http";
import { sprints } from "@/server/services";

import { ValidationError } from "@/lib/errors";

type P = { id: string };
export const POST = api<P>(async ({ actor, params, body }) => {
  const b = await body();
  if (typeof b.itemId !== "string" && typeof b.itemId !== "number") throw new ValidationError("itemId is required");
  return sprints.addItem(actor, params.id, String(b.itemId));
});
