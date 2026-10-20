/** AES-256-GCM sealing for small secrets (TOTP seeds). Key derived from SESSION_SECRET. Never log inputs/outputs. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const secret = process.env.SESSION_SECRET ?? "dev-only-insecure-session-secret-change-me-0123456789";
  return createHash("sha256").update(`seal:${secret}`).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("hex"), c.getAuthTag().toString("hex"), enc.toString("hex")].join(".");
}

export function unseal(sealed: string): string {
  const [iv, tag, enc] = sealed.split(".");
  if (!iv || !tag || !enc) throw new Error("Invalid sealed value");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "hex"));
  d.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([d.update(Buffer.from(enc, "hex")), d.final()]).toString("utf8");
}

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");
