import { api } from "@/server/http";
import { sessions } from "@/server/services";
import { sidOf } from "@/modules/admin/http";

export const POST = api(async ({ actor, req }) => ({ revoked: sessions.revokeOthers(actor, await sidOf(req)) }));
