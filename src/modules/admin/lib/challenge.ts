/** Short lived signed token handed out between password check and second factor. */
import { createHash } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET ?? "dev-only-insecure-session-secret-change-me-0123456789";
  return createHash("sha256").update(`challenge:${secret}`).digest();
}

export async function signChallenge(userId: string, purpose: "2fa" | "invite"): Promise<string> {
  return new SignJWT({ purpose }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("5m").sign(key());
}

export async function verifyChallenge(token: string | undefined, purpose: "2fa" | "invite"): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload.purpose === purpose && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
