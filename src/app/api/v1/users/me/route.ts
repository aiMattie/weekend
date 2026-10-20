import { api } from "@/server/http";
import { users } from "@/server/services";

export const GET = api(({ actor }) => users.me(actor));
export const PATCH = api(async ({ actor, body }) => users.update(actor, actor.id, await body()));
