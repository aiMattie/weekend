/** Response helpers for the OAuth endpoints: no-store, open CORS (no cookies are involved) and RFC 6749 error bodies. */
import { ZodError } from "zod";
import { OAuthError } from "@/server/services/oauth";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
};

export const oauthJson = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store", Pragma: "no-cache" } });

export function oauthErrorResponse(err: unknown): Response {
  if (err instanceof OAuthError) return oauthJson({ error: err.error, error_description: err.message }, err.status);
  if (err instanceof ZodError) return oauthJson({ error: "invalid_request", error_description: err.issues.map((i) => i.message).join("; ") }, 400);
  console.error("[oauth] unexpected error", err);
  return oauthJson({ error: "server_error", error_description: "Internal error" }, 500);
}

export const preflight = (): Response => new Response(null, { status: 204, headers: CORS_HEADERS });

/** Token/revoke endpoints accept form encoding (spec) and, leniently, JSON. */
export async function readForm(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  if (/application\/json/i.test(type)) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(body).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
  }
  return new URLSearchParams(await req.text());
}
