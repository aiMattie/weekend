import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { toPublicUser } from "@/lib/auth";
import { errorResponse } from "@/server/http";
import { authenticate } from "@/server/services/login-flow";
import { clientIp } from "@/modules/admin/lib/ip";

// Login with policy (admin module): lockout, panic lock, 2FA second step, server side sessions.
const schema = z.object({
  email: z.string().optional(), password: z.string().optional(), challenge: z.string().optional(),
  code: z.string().optional(), recoveryCode: z.string().optional(), panicCode: z.string().optional(),
}).refine((v) => v.challenge || (v.email && v.password), "E-mail en wachtwoord zijn verplicht");

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "validation", message: "E-mail en wachtwoord zijn verplicht" } }, { status: 400 });
  try {
    const r = await authenticate(parsed.data, { ip: clientIp(req.headers), userAgent: req.headers.get("user-agent") });
    if (r.status === "2fa_required") return NextResponse.json({ twoFactor: true, challenge: r.challenge });
    const res = NextResponse.json({ user: toPublicUser(r.user), setup2fa: r.setup2fa });
    res.cookies.set(SESSION_COOKIE, r.token, sessionCookieOptions());
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
