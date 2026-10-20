import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { toPublicUser } from "@/lib/auth";
import { errorResponse } from "@/server/http";
import { members } from "@/server/services";
import { clientIp } from "@/modules/admin/lib/ip";

const schema = z.object({ token: z.string().min(10).max(200), name: z.string().optional(), password: z.string().min(1) });

/** Public: accept an invitation (sets the password, logs in). */
export async function POST(req: NextRequest) {
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: { code: "validation", message: "Naam en wachtwoord zijn verplicht" } }, { status: 400 });
  try {
    const r = await members.acceptInvitation(p.data.token, { name: p.data.name, password: p.data.password }, { ip: clientIp(req.headers), userAgent: req.headers.get("user-agent") });
    const res = NextResponse.json({ user: toPublicUser(r.user) }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, r.token, sessionCookieOptions());
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
