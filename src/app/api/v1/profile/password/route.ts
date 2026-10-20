import { api } from "@/server/http";
import { profile } from "@/server/services";
import { sidOf } from "@/modules/admin/http";

export const POST = api(async ({ actor, body, req }) => { await profile.changePassword(actor, await body(), await sidOf(req)); });
