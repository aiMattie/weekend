/** Helpers for the anonymous /api/public/forms routes (no api() wrapper: there is no login). */
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { Actor } from "@/lib/actor";
import { getActor } from "@/lib/auth";
import { checkRateLimit, globalRateStore, type RateLimitOptions } from "./logic";

/** The logged-in user when there is a session, else null. Never throws. */
export async function optionalActor(req: NextRequest): Promise<Actor | null> {
  try { return await getActor(req); } catch { return null; }
}

/** Short stable hash of the client address (never stored in clear). */
export function ipHashOf(req: NextRequest): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(`form-ip:${ip}`).digest("hex").slice(0, 24);
}

/** Returns a 429 response when the caller is over the limit, else null (and counts the hit). */
export function limited(key: string, opts?: RateLimitOptions): NextResponse | null {
  const r = checkRateLimit(globalRateStore(), key, Date.now(), opts);
  if (r.ok) return null;
  return NextResponse.json(
    { error: { code: "rate_limited", message: "Too many attempts, try again later" } },
    { status: 429, headers: { "Retry-After": String(r.retryAfterSec) } },
  );
}
