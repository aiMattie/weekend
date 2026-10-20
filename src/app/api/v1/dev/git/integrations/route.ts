import { api } from "@/server/http";
import { devGit } from "@/server/services";

export const GET = api(({ actor }) => devGit.listIntegrations(actor));
export const POST = api(async ({ actor, body }) => devGit.createIntegration(actor, await body()), { status: 201 });
