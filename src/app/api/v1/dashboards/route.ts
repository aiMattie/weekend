import { api } from "@/server/http";
import { dashboards } from "@/server/services";

export const GET = api(({ actor, query }) => dashboards.list(actor, { workspaceId: query.get("workspaceId") ?? undefined }));
export const POST = api(async ({ actor, body }) => dashboards.create(actor, await body()), { status: 201 });
