/**
 * Session cookie: a JWT (HS256, jose) with `sub` = user id. Edge-safe (used by proxy.ts too).
 * SESSION_SECRET comes from .env (generated on setup). Never log it.
 */
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "weekend_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
    return new TextEncoder().encode("dev-only-insecure-session-secret-change-me-0123456789");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(userId: string, sid?: string): Promise<string> {
  return new SignJWT(sid ? { sid } : {}).setProtectedHeader({ alg: "HS256" }).setSubject(userId)
    .setIssuedAt().setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`).sign(secretKey());
}

/** Returns the user id or null when missing/invalid/expired. */
export async function verifySession(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Like verifySession but also returns the server side session id (`sid`, set by the admin module's login flow). */
export async function verifySessionClaims(token: string | undefined | null): Promise<{ userId: string; sid: string | null } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? { userId: payload.sub, sid: typeof payload.sid === "string" ? payload.sid : null } : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.COOKIE_SECURE === "1",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
});
