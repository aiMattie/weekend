import { api } from "@/server/http";
import { automations } from "@/server/services";

export const GET = api(({ actor, query }) => automations.list(actor, { boardId: query.get("boardId"), kind: (query.get("kind") as "automation" | "workflow" | null) ?? undefined }));
export const POST = api(async ({ actor, body }) => automations.create(actor, await body()), { status: 201 });
