import { scim } from "@/modules/admin/scim-http";
import * as svc from "@/server/services/scim";

export const GET = scim(({ accountId, params, base }) => svc.get(accountId, params.id, base));
export const PATCH = scim(async ({ accountId, params, req, base }) => svc.patch(accountId, params.id, await req.json().catch(() => null), base));
export const PUT = scim(async ({ accountId, params, req, base }) => svc.replace(accountId, params.id, await req.json().catch(() => null), base));
export const DELETE = scim(({ accountId, params }) => { svc.deactivate(accountId, params.id); });
