import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/server/http";
import { integrations } from "@/server/services";

/** Public inbound webhook: the secret token in the URL is the credential. Creates an item on the configured board. */
export async function POST(req: NextRequest, route: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await route.params;
    const raw = await req.text();
    return NextResponse.json(integrations.receiveInbound(token, req.headers, raw), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
