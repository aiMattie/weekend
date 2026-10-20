import { api } from "@/server/http";
import { agents } from "@/server/services";

export const GET = api(({ actor, query }) => agents.list(actor, { mine: query.get("mine") === "1" }));
export const POST = api(async ({ actor, body }) => agents.create(actor, await body()), { status: 201 });
