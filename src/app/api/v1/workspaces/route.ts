import { api } from "@/server/http";
import { workspaces } from "@/server/services";

export const GET = api(({ actor }) => workspaces.list(actor));
export const POST = api(async ({ actor, body }) => workspaces.create(actor, await body()), { status: 201 });
