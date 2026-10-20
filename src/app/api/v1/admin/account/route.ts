import { api } from "@/server/http";
import { account } from "@/server/services";

export const GET = api(({ actor }) => account.get(actor));
export const PATCH = api(async ({ actor, body }) => account.update(actor, await body()));
