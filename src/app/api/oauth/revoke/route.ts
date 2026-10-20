import { CORS_HEADERS, oauthErrorResponse, preflight, readForm } from "@/server/oauth/http";
import { revokeToken } from "@/server/services/oauth";

export const dynamic = "force-dynamic";

/** RFC 7009 token revocation. */
export async function POST(req: Request): Promise<Response> {
  try {
    revokeToken(await readForm(req), req.headers.get("authorization"));
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    return oauthErrorResponse(err);
  }
}
export const OPTIONS = preflight;
