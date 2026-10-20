/** Small response helpers for the SSO route handlers (Google and Microsoft). */
import { NextResponse } from "next/server";
import { FLOW_MAX_AGE_SECONDS, flowCookieName, type FlowMode, type SsoErrorCode, type SsoProvider } from "./oauth";
import { isHttpsApp } from "./config";

export const flowCookiePath = (provider: SsoProvider): string => `/api/auth/${provider}`;

/** In-app redirect with a relative Location: always lands on the host the browser is already on. */
export const redirectTo = (path: string): NextResponse => new NextResponse(null, { status: 302, headers: { Location: path, "Cache-Control": "no-store" } });

export function setFlowCookie(res: NextResponse, token: string, provider: SsoProvider = "google"): NextResponse {
  res.cookies.set(flowCookieName(provider), token, { httpOnly: true, sameSite: "lax", secure: isHttpsApp(), path: flowCookiePath(provider), maxAge: FLOW_MAX_AGE_SECONDS });
  return res;
}
export function clearFlowCookie(res: NextResponse, provider: SsoProvider = "google"): NextResponse {
  res.cookies.set(flowCookieName(provider), "", { httpOnly: true, sameSite: "lax", secure: isHttpsApp(), path: flowCookiePath(provider), maxAge: 0 });
  return res;
}

/** Where a failed attempt lands, per flow mode. */
export function failureUrl(mode: FlowMode, code: SsoErrorCode, next = "/", provider: SsoProvider = "google"): string {
  if (mode === "link") return `/profile?${provider}=${code}`;
  if (mode === "test") return `/admin/sso?test=${code}${provider === "google" ? "" : `&provider=${provider}`}`;
  return `/login?error=${code}${provider === "google" ? "" : `&provider=${provider}`}${next && next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`;
}
