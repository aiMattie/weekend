import { api } from "@/server/http";
import { forms } from "@/server/services";

export const GET = api(({ actor, query }) =>
  forms.list(actor, { workspaceId: query.get("workspaceId") ?? undefined, boardId: query.get("boardId") ?? undefined }));
export const POST = api(async ({ actor, body }) => forms.create(actor, await body()), { status: 201 });
