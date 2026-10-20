/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) with node:crypto only. */
import { createHmac, randomBytes, createHash } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateSecret = (bytes = 20): string => base32Encode(randomBytes(bytes));

export const PERIOD = 30;

export function hotp(secretBase32: string, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secretBase32)).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

export const totpAt = (secret: string, timeMs = Date.now(), digits = 6): string => hotp(secret, Math.floor(timeMs / 1000 / PERIOD), digits);

/** Returns the matched time step (for replay protection) or null. Accepts +-`window` steps of clock drift. */
export function verifyTotp(secret: string, token: string, opts: { timeMs?: number; window?: number; afterStep?: number | null } = {}): number | null {
  const t = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(t)) return null;
  const step = Math.floor((opts.timeMs ?? Date.now()) / 1000 / PERIOD);
  const window = opts.window ?? 1;
  for (let d = -window; d <= window; d++) {
    const s = step + d;
    if (opts.afterStep != null && s <= opts.afterStep) continue;
    if (hotp(secret, s) === t) return s;
  }
  return null;
}

export function otpauthUri(secret: string, accountName: string, issuer = "Weekend"): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${PERIOD}`;
}

/** 10 single-use recovery codes like "k3f9-a1b2-c3d4". */
export function generateRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const h = randomBytes(6).toString("hex");
    return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`;
  });
}

export const hashCode = (code: string): string => createHash("sha256").update(code.trim().toLowerCase().replace(/\s+/g, "")).digest("hex");
