/** HTTP glue for /api/scim/v2: bearer token auth + SCIM JSON errors. */
import { NextResponse, type NextRequest } from "next/server";
import { ServiceError } from "@/lib/errors";
import { extractBearer } from "@/lib/auth/bearer";
import { authenticateScim } from "@/server/services/security";
import { errorBody, ScimError } from "@/server/services/scim";

const CT = "application/scim+json";
export const scimJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Content-Type": CT } });

export function scim(fn: (c: { accountId: string; req: NextRequest; base: string; params: Record<string, string> }) => unknown | Promise<unknown>, status = 200) {
  return async (req: NextRequest, route?: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      const token = extractBearer(req.headers);
      const accountId = token ? authenticateScim(token) : null;
      if (!accountId) return scimJson(errorBody(401, "Invalid or missing SCIM token"), 401);
      const out = await fn({ accountId, req, base: req.nextUrl.origin, params: (await route?.params) ?? {} });
      if (out === undefined) return new NextResponse(null, { status: 204 });
      return scimJson(out, status);
    } catch (e) {
      if (e instanceof ScimError) return scimJson(errorBody(e.status, e.detail, e.scimType), e.status);
      if (e instanceof ServiceError) return scimJson(errorBody(e.status, e.message), e.status);
      console.error("[scim]", e);
      return scimJson(errorBody(500, "Internal error"), 500);
    }
  };
}
