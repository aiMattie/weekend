import { api } from "@/server/http";
import { integrations } from "@/server/services";

export const GET = api(({ actor }) => integrations.list(actor));
export const POST = api(async ({ actor, body }) => integrations.create(actor, await body()), { status: 201 });
