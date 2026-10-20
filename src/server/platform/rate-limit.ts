/**
 * Rate limiting for the GraphQL API (and MCP tool calls): per token (or per session user)
 *  - max complexity of a single query         API_MAX_COMPLEXITY       (default 5_000_000)
 *  - complexity per minute (fixed window)     API_MINUTE_BUDGET        (default 10_000_000)
 *  - requests per minute                      API_REQUESTS_PER_MINUTE  (default 5000)
 *  - complexity per UTC day (persistent)      API_DAILY_BUDGET         (default 5_000_000; token.dailyBudget overrides)
 * Env values are read on every call so tests and admins can change them without a restart.
 */
import type { Actor } from "@/lib/actor";
import { addUsage, usageToday } from "@/server/services/api-tokens";

export type LimitCode = "ComplexityException" | "COMPLEXITY_BUDGET_EXHAUSTED" | "DAILY_LIMIT_EXCEEDED" | "RATE_LIMIT_EXCEEDED";

export class ApiLimitError extends Error {
  constructor(message: string, readonly code: LimitCode, readonly status: number, readonly retryAfter?: number) {
    super(message);
    this.name = "ApiLimitError";
  }
}

const envInt = (name: string, def: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : def;
};

export const limits = () => ({
  maxQuery: envInt("API_MAX_COMPLEXITY", 5_000_000),
  perMinute: envInt("API_MINUTE_BUDGET", 10_000_000),
  requestsPerMinute: envInt("API_REQUESTS_PER_MINUTE", 5000),
  daily: envInt("API_DAILY_BUDGET", 5_000_000),
  maxDepth: envInt("API_MAX_DEPTH", 12),
});

interface Window { start: number; used: number; requests: number }
const g = globalThis as unknown as { __apiWindows?: Map<string, Window> };
const windows = (g.__apiWindows ??= new Map());

export const limitKey = (actor: Actor): string => actor.token?.id ?? `user:${actor.id}`;

export interface ComplexityReport {
  /** cost of this call */
  query: number;
  /** minute budget before / after this call */
  before: number;
  after: number;
  reset_in_x_seconds: number;
  /** daily budget remaining after this call */
  dailyRemaining: number;
  dailyBudget: number;
}

/** Check all limits for a call of `cost` and charge it. Throws ApiLimitError (HTTP 429/400). */
export function chargeCall(actor: Actor, cost: number, now = Date.now()): ComplexityReport {
  const l = limits();
  if (cost > l.maxQuery) throw new ApiLimitError(`Query complexity ${cost} exceeds the maximum of ${l.maxQuery}`, "ComplexityException", 400);
  const key = limitKey(actor);
  let w = windows.get(key);
  if (!w || now - w.start >= 60_000) {
    w = { start: now, used: 0, requests: 0 };
    windows.set(key, w);
  }
  const reset = Math.max(1, Math.ceil((w.start + 60_000 - now) / 1000));
  if (w.requests + 1 > l.requestsPerMinute) throw new ApiLimitError("Rate limit exceeded: too many requests per minute", "RATE_LIMIT_EXCEEDED", 429, reset);
  if (w.used + cost > l.perMinute) {
    throw new ApiLimitError(`Complexity budget exhausted, query cost ${cost} exceeds the remaining ${Math.max(0, l.perMinute - w.used)} per minute`, "COMPLEXITY_BUDGET_EXHAUSTED", 429, reset);
  }
  const dailyBudget = actor.token?.dailyBudget ?? l.daily;
  const usedToday = usageToday(key).used;
  if (usedToday + cost > dailyBudget) {
    const untilMidnight = Math.ceil((Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() + 1) - now) / 1000);
    throw new ApiLimitError(`Daily limit exceeded: budget ${dailyBudget}, used ${usedToday}, query cost ${cost}`, "DAILY_LIMIT_EXCEEDED", 429, untilMidnight);
  }
  const before = l.perMinute - w.used;
  w.used += cost;
  w.requests += 1;
  addUsage(key, cost);
  return { query: cost, before, after: before - cost, reset_in_x_seconds: reset, dailyRemaining: dailyBudget - usedToday - cost, dailyBudget };
}

/** Test helper: forget in-memory windows. */
export function resetRateLimits(): void {
  windows.clear();
}
