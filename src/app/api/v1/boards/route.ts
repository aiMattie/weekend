import { api } from "@/server/http";
import { boards } from "@/server/services";

export const GET = api(({ actor, query }) =>
  boards.list(actor, { workspaceId: query.get("workspaceId") ?? undefined, state: query.get("state") === "archived" ? "archived" : "active" }));
export const POST = api(async ({ actor, body }) => boards.create(actor, await body()), { status: 201 });
