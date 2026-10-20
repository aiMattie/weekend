import { api } from "@/server/http";
import { users } from "@/server/services";

export const GET = api(({ actor }) => users.listTeams(actor));
export const POST = api(async ({ actor, body }) => users.createTeam(actor, await body()), { status: 201 });
