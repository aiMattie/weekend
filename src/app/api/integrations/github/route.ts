import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/server/http";
import { devGit } from "@/server/services";

/** Github webhook: verified with the HMAC secret created in Settings > Git-koppeling (no session needed). */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const result = devGit.handleWebhook({ provider: "github", rawBody, header: (n) => req.headers.get(n) });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
