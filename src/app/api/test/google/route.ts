import { NextResponse } from "next/server";
import { z } from "zod";
import { patchRuntimeOverride, setRuntimeOverride } from "@/server/sso/config";
import { resetRateLimits } from "@/server/sso/rate-limit";

/**
 * E2E only (E2E_RESET=1): point Google SSO at a local mock IdP at runtime, merged into the current override (client id/secret, mock base URL,
 * APP_URL, allowed domains) or clear the override. POST { clientId, clientSecret, oauthBase, appUrl?, allowedDomains? } | { reset: true } | { resetRateLimits: true }.
 * The real credentials from the environment are never read or returned.
 */
const body = z.object({
  reset: z.boolean().optional(), resetRateLimits: z.boolean().optional(), clientId: z.string().max(200).optional(), clientSecret: z.string().max(200).optional(),
  oauthBase: z.string().url().optional(), appUrl: z.string().url().optional(), allowedDomains: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  if (process.env.E2E_RESET !== "1") return NextResponse.json({ error: "disabled" }, { status: 404 });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const { reset, resetRateLimits: rates, ...override } = parsed.data;
  if (rates) { resetRateLimits(); if (!reset && Object.keys(override).length === 0) return NextResponse.json({ ok: true }); }
  if (reset) setRuntimeOverride(null);
  else patchRuntimeOverride(override);
  return NextResponse.json({ ok: true });
}
