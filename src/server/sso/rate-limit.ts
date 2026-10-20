/** Light in-memory rate limit per key (IP) for the SSO endpoints. Resets on restart; good enough for a single node. */
const g = globalThis as unknown as { __ssoRate?: Map<string, { n: number; reset: number }> };

export function rateLimited(key: string, max: number, windowMs = 60_000, now = Date.now()): boolean {
  const m = (g.__ssoRate ??= new Map());
  const cur = m.get(key);
  if (!cur || cur.reset <= now) {
    if (m.size > 5000) for (const [k, v] of m) if (v.reset <= now) m.delete(k);
    m.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  cur.n += 1;
  return cur.n > max;
}

export const resetRateLimits = (): void => { g.__ssoRate = new Map(); };
