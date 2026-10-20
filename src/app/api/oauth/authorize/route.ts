import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth";
import { extractBearer } from "@/lib/auth/bearer";
import { AuthorizeFatalError, OAuthError, approve, errorRedirect, issuer, parseAuthorizeRequest, resolveClientRedirect } from "@/server/services/oauth";

export const dynamic = "force-dynamic";

/** Same-origin check for the consent form (the session cookie is SameSite=Lax; this is the second line). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const allowed = new Set([new URL(issuer()).origin, ...(host ? [`https://${host}`, `http://${host}`] : [])]);
  return allowed.has(origin);
}

const seeOther = (url: string) => NextResponse.redirect(url, 303);

/** Consent decision posted by /oauth/authorize. */
export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req) || extractBearer(req.headers)) return new Response("Forbidden", { status: 403 });
  const form = new URLSearchParams(await req.text());
  let actor;
  try { actor = await getActor(req); } catch { return new Response("Not signed in", { status: 401 }); }
  try {
    const authReq = parseAuthorizeRequest(form);
    if (form.get("decision") !== "approve") return seeOther(errorRedirect(authReq, "access_denied", "The user denied the request"));
    const scopes = ["read", ...(form.get("grant_write") === "on" ? ["write"] : [])];
    const ws = form.get("workspace_id");
    return seeOther(approve(actor, authReq, { scopes, workspaceIds: ws ? [ws] : null }));
  } catch (err) {
    if (err instanceof AuthorizeFatalError) return new Response(err.message, { status: 400 });
    if (err instanceof OAuthError) return seeOther(errorRedirect(resolveClientRedirect(form), err.error, err.message));
    throw err;
  }
}
