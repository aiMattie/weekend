import { api } from "@/server/http";
import { security } from "@/server/services";
import { ipOf } from "@/modules/admin/http";

export const GET = api(({ actor }) => security.get(actor));
export const PATCH = api(async ({ actor, body, req }) => security.update(actor, await body(), { ip: ipOf(req) }));
