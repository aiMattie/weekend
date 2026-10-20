import { NextResponse, type NextRequest } from "next/server";
import { optionalActor, ipHashOf, limited } from "@/modules/boards-extra/forms/public-route";
import { errorResponse } from "@/server/http";
import { forms } from "@/server/services";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };

/** Public form definition (sanitised; locked while a password is required). */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { token } = await params;
    return NextResponse.json(await forms.getPublic(token, { viewer: await optionalActor(req) }));
  } catch (e) {
    return errorResponse(e);
  }
}

/** Public submission: rate limited per form + client, honeypot field `website`. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { token } = await params;
    const ipHash = ipHashOf(req);
    const blocked = limited(`submit:${token}:${ipHash}`);
    if (blocked) return blocked;
    const text = await req.text();
    if (text.length > 200_000) return NextResponse.json({ error: { code: "validation", message: "Request too large" } }, { status: 413 });
    let b: Record<string, unknown>;
    try { b = JSON.parse(text || "{}"); } catch { return NextResponse.json({ error: { code: "validation", message: "Invalid JSON" } }, { status: 400 }); }
    const result = await forms.submit(await optionalActor(req), {
      token, answers: b.answers ?? {}, password: typeof b.password === "string" ? b.password : undefined,
      honeypot: typeof b.website === "string" ? b.website : undefined, ipHash,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
