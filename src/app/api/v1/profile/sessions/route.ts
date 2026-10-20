import { api } from "@/server/http";
import { sessions } from "@/server/services";
import { sidOf } from "@/modules/admin/http";

export const GET = api(async ({ actor, req }) => sessions.list(actor, actor.id, await sidOf(req)));
