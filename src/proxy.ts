/**
 * Next.js 16 "proxy" (formerly middleware): optimistic session check before any (app) route.
 * Real authorization happens in the services (src/lib/permissions.ts); this only keeps
 * anonymous visitors out. Bearer-token requests to /api pass through and are verified in
 * the route handlers (getActor).
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

// "/.well-known" + "/api/oauth": OAuth discovery, client registration and token endpoints for MCP clients (the consent POST checks the session itself)
// "/api/auth" also covers /api/auth/{google,microsoft}/start and /callback (SSO): reachable without a session
const PUBLIC_PREFIXES = ["/login", "/accept-invite", "/api/auth", "/api/test", "/_next", "/favicon.ico", "/api/graphql", "/api/v2", "/api/mcp", "/f", "/api/public", "/api/integrations/github", "/api/integrations/bitbucket", "/.well-known", "/api/oauth"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // admin module: IP allow-list (Admin > Security). Applies to every request except the test reset and static assets.
  if (!pathname.startsWith("/_next") && !pathname.startsWith("/api/test") && (await import("@/modules/admin/ip-policy")).isIpBlocked(request.headers)) {
    return pathname.startsWith("/api/")
      ? NextResponse.json({ error: { code: "forbidden", message: "Toegang vanaf dit IP-adres is niet toegestaan" } }, { status: 403 })
      : new NextResponse("Toegang vanaf dit IP-adres is niet toegestaan.", { status: 403 });
  }
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  const isApi = pathname.startsWith("/api/");
  if (isApi && /^Bearer\s+\S+/i.test(request.headers.get("authorization") ?? "")) return NextResponse.next();

  const userId = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (userId) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: { code: "unauthorized", message: "Not authenticated" } }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + request.nextUrl.search)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|ico|webp|css|js|map)$).*)"],
};
