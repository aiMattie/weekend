/** In-memory limit on dynamic client registrations per client IP (OAUTH_REGISTER_PER_HOUR, default 30). */
import { OAuthError } from "@/server/services/oauth";

const g = globalThis as unknown as { __oauthRegisterHits?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__oauthRegisterHits ??= new Map());

export function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers.get("x-real-ip") ?? "unknown";
}

export function checkRegisterRate(headers: Headers, now = Date.now()): void {
  const limit = Number(process.env.OAUTH_REGISTER_PER_HOUR) || 30;
  const ip = clientIp(headers);
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= limit) throw new OAuthError("temporarily_unavailable", "Too many client registrations, try again later", 429);
  recent.push(now);
  hits.set(ip, recent);
}
