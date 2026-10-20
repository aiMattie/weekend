import { NextResponse, type NextRequest } from "next/server";
import { optionalActor, ipHashOf, limited } from "@/modules/boards-extra/forms/public-route";
import { errorResponse } from "@/server/http";
import { forms } from "@/server/services";

export const dynamic = "force-dynamic";

/** Check a form password; returns the full public form on success (rate limited against guessing). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const blocked = limited(`unlock:${token}:${ipHashOf(req)}`, { max: 10, windowMs: 60_000 });
    if (blocked) return blocked;
    const b = (await req.json().catch(() => ({}))) as { password?: unknown };
    const pub = await forms.unlockPublic(token, typeof b.password === "string" ? b.password : "", await optionalActor(req));
    return NextResponse.json(pub);
  } catch (e) {
    return errorResponse(e);
  }
}
