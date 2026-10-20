import { api } from "@/server/http";
import { users } from "@/server/services";

export const GET = api(({ actor, query }) => users.list(actor, { includeInactive: query.get("includeInactive") === "true" }));
export const POST = api(async ({ actor, body }) => users.create(actor, await body()), { status: 201 });
