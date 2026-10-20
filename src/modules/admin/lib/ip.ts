/** IP allow-list matching (IPv4 CIDR / exact, IPv6 exact). Pure, edge safe. */

function v4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** "::ffff:1.2.3.4" -> "1.2.3.4"; "::1" -> "127.0.0.1" (loopback is one address for our purposes). */
export function normalizeIp(raw: string): string {
  let ip = raw.trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") return "127.0.0.1";
  return ip.toLowerCase();
}

export function isValidEntry(entry: string): boolean {
  const [addr, bits] = entry.trim().split("/");
  if (bits !== undefined && !/^\d{1,3}$/.test(bits)) return false;
  if (v4ToInt(addr) !== null) return bits === undefined || Number(bits) <= 32;
  return /^[0-9a-f:]+$/i.test(addr) && addr.includes(":") && (bits === undefined || Number(bits) <= 128);
}

export function ipMatches(ip: string, entry: string): boolean {
  const [netRaw, bitsRaw] = entry.trim().split("/");
  const addr = normalizeIp(ip);
  const net = normalizeIp(netRaw);
  if (bitsRaw === undefined) return addr === net;
  const a = v4ToInt(addr);
  const n = v4ToInt(net);
  if (a === null || n === null) return false; // IPv6 CIDR not supported: exact entries only
  const bits = Number(bitsRaw);
  if (bits === 0) return true;
  const mask = (~0 << (32 - bits)) >>> 0;
  return ((a & mask) >>> 0) === ((n & mask) >>> 0);
}

export const ipAllowed = (ip: string, allowlist: string[]): boolean => allowlist.length === 0 || allowlist.some((e) => ipMatches(ip, e));

/** Client ip from proxy headers; "127.0.0.1" when none (direct localhost connection). */
export function clientIp(headers: { get(name: string): string | null }): string {
  const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return normalizeIp(xff || headers.get("x-real-ip") || "127.0.0.1");
}
