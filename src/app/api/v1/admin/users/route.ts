import { api } from "@/server/http";
import { members } from "@/server/services";
import { originOf } from "@/modules/admin/http";

export const GET = api(({ actor, query }) => members.list(actor, { q: query.get("q") ?? undefined, role: query.get("role") ?? undefined }));
export const POST = api(async ({ actor, body, req }) => members.invite(actor, await body(), { origin: originOf(req) }), { status: 201 });
