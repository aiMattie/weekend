import { NextResponse } from "next/server";
import { api } from "@/server/http";
import { wispr } from "@/server/services";
import { appUrl } from "@/server/sso/config";

/** GET /api/v1/wispr/callback: OAuth redirect target. Always lands on /meetings with ?wispr=connected|error. */
export const GET = api(async ({ actor, query }) => {
  try {
    await wispr.finishConnect(actor, { code: query.get("code"), state: query.get("state"), error: query.get("error") });
    return NextResponse.redirect(`${appUrl()}/meetings?wispr=connected`);
  } catch (e) {
    return NextResponse.redirect(`${appUrl()}/meetings?wispr=error&reason=${encodeURIComponent(e instanceof Error ? e.message : "error")}`);
  }
});
