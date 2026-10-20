/** Ready-made agents: list (GET) and install one (POST). */
import { api } from "@/server/http";
import { agents } from "@/server/services";

export const GET = api(({ actor }) => agents.catalog(actor));
export const POST = api(async ({ actor, body }) => agents.installTemplate(actor, await body()), { status: 201 });
