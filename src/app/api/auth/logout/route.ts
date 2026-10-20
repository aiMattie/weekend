import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionClaims } from "@/lib/auth/session";
import { revokeOne } from "@/server/services/sessions";

export async function POST(req: NextRequest) {
  // admin module: also end the server side session
  const claims = await verifySessionClaims(req.cookies.get(SESSION_COOKIE)?.value);
  if (claims?.sid) revokeOne(claims.sid, "logout");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
