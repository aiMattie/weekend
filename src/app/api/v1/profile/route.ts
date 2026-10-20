import { api } from "@/server/http";
import { profile } from "@/server/services";

export const GET = api(({ actor }) => profile.get(actor));
export const PATCH = api(async ({ actor, body }) => profile.update(actor, await body()));
