import { scim } from "@/modules/admin/scim-http";
import * as svc from "@/server/services/scim";

export const GET = scim(({ accountId, req, base }) => svc.list(accountId, { filter: req.nextUrl.searchParams.get("filter"), startIndex: req.nextUrl.searchParams.get("startIndex"), count: req.nextUrl.searchParams.get("count") }, base));
export const POST = scim(async ({ accountId, req, base }) => svc.create(accountId, await req.json().catch(() => null), base), 201);
