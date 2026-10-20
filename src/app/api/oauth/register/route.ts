import { oauthErrorResponse, oauthJson, preflight } from "@/server/oauth/http";
import { OAuthError, registerClient } from "@/server/services/oauth";
import { checkRegisterRate } from "@/server/oauth/register-rate";

export const dynamic = "force-dynamic";

/** RFC 7591 dynamic client registration (open: redirect URIs are limited to Claude hosts and loopback). */
export async function POST(req: Request): Promise<Response> {
  try {
    checkRegisterRate(req.headers);
    const body = await req.json().catch(() => { throw new OAuthError("invalid_client_metadata", "Body must be JSON"); });
    return oauthJson(registerClient(body), 201);
  } catch (err) {
    return oauthErrorResponse(err);
  }
}
export const OPTIONS = preflight;
