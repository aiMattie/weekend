import { api } from "@/server/http";
import { notetaker } from "@/server/services";

export const GET = api(({ actor, query }) => notetaker.list(actor, { limit: Number(query.get("limit") ?? 30), cursor: query.get("cursor") ?? undefined }));
export const POST = api(async ({ actor, body }) => notetaker.create(actor, await body()), { status: 201 });
