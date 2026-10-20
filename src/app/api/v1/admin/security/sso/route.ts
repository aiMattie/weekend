import { api } from "@/server/http";
import { security } from "@/server/services";
import { originOf } from "@/modules/admin/http";

export const GET = api(({ actor, req }) => security.getSso(actor, originOf(req)));
export const PUT = api(async ({ actor, body, req }) => security.updateSso(actor, await body(), originOf(req)));
