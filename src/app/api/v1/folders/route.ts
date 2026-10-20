import { ValidationError } from "@/lib/errors";
import { api } from "@/server/http";
import { folders } from "@/server/services";

export const GET = api(({ actor, query }) => {
  const ws = query.get("workspaceId");
  if (!ws) throw new ValidationError("workspaceId is required");
  return folders.list(actor, ws);
});
export const POST = api(async ({ actor, body }) => folders.create(actor, await body()), { status: 201 });
