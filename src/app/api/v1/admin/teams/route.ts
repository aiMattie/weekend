import { api } from "@/server/http";
import { teams } from "@/server/services";

export const GET = api(({ actor, query }) => (query.get("mentionables") ? teams.mentionables(actor) : teams.list(actor)));
export const POST = api(async ({ actor, body }) => teams.create(actor, await body()), { status: 201 });
