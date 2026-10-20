import { oauthErrorResponse, oauthJson, preflight, readForm } from "@/server/oauth/http";
import { exchangeToken } from "@/server/services/oauth";

export const dynamic = "force-dynamic";

/** Token endpoint: authorization_code (+ PKCE) and refresh_token (rotating). */
export async function POST(req: Request): Promise<Response> {
  try {
    return oauthJson(exchangeToken(await readForm(req), req.headers.get("authorization")));
  } catch (err) {
    return oauthErrorResponse(err);
  }
}
export const OPTIONS = preflight;
