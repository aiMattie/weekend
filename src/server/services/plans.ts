/**
 * Plan model (no payments). Default plan is Enterprise = unlimited, so nothing blocks the team.
 * Other services enforce limits through `checkLimit(account, key)` / `assertLimit(...)`.
 *
 *   const r = checkLimit(actor, "guests");           // { ok, limit, used, remaining }
 *   assertLimit(actor, "viewsPerBoard", { boardId }); // throws ForbiddenError("plan_limit") when exceeded
 */
import { and, eq, gte, sql } from "drizzle-orm";
import type { Actor } from "../../lib/actor";
import { ForbiddenError } from "../../lib/errors";
import { db } from "../../db/client";
import { accounts, users, views } from "../../db/schema/core";
import { automationRuns } from "../../db/schema/automations";
import { integrations } from "../../db/schema/webhooks";
import { getSettings } from "./account-settings";

export const PLAN_KEYS = ["free", "basic", "standard", "pro", "enterprise"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const LIMIT_KEYS = ["guestsPerSeat", "automationsPerMonth", "integrations", "viewsPerBoard"] as const;
export type PlanLimitKey = (typeof LIMIT_KEYS)[number];
/** keys checkLimit understands (`guests` = guestsPerSeat x seats) */
export type LimitKey = PlanLimitKey | "guests";

/** null = unlimited */
export const PLANS: Record<PlanKey, { label: string; limits: Record<PlanLimitKey, number | null> }> = {
  free: { label: "Free", limits: { guestsPerSeat: 0, automationsPerMonth: 0, integrations: 0, viewsPerBoard: 1 } },
  basic: { label: "Basic", limits: { guestsPerSeat: 5, automationsPerMonth: 0, integrations: 0, viewsPerBoard: 3 } },
  standard: { label: "Standard", limits: { guestsPerSeat: 5, automationsPerMonth: 250, integrations: 250, viewsPerBoard: 10 } },
  pro: { label: "Pro", limits: { guestsPerSeat: 10, automationsPerMonth: 25_000, integrations: 25_000, viewsPerBoard: null } },
  enterprise: { label: "Enterprise", limits: { guestsPerSeat: null, automationsPerMonth: null, integrations: null, viewsPerBoard: null } },
};

export interface LimitResult { ok: boolean; key: LimitKey; limit: number | null; used: number; remaining: number | null; plan: PlanKey }

export function accountPlan(accountId: string): PlanKey {
  const p = db.select({ plan: accounts.plan }).from(accounts).where(eq(accounts.id, accountId)).get()?.plan;
  return (PLAN_KEYS as readonly string[]).includes(p ?? "") ? (p as PlanKey) : "enterprise";
}

/** Plan limits with account overrides applied (Admin > Billing can override single limits). */
export function effectiveLimits(accountId: string): Record<PlanLimitKey, number | null> {
  const base = { ...PLANS[accountPlan(accountId)].limits };
  const over = getSettings(accountId).planOverrides;
  for (const k of LIMIT_KEYS) if (k in over) base[k] = over[k];
  return base;
}

export function seatCount(accountId: string): number {
  return db.select({ n: sql<number>`count(*)` }).from(users)
    .where(and(eq(users.accountId, accountId), eq(users.isActive, true), eq(users.isAiAgent, false), sql`${users.role} != 'guest'`)).get()?.n ?? 0;
}

export function guestCount(accountId: string): number {
  return db.select({ n: sql<number>`count(*)` }).from(users).where(and(eq(users.accountId, accountId), eq(users.isActive, true), eq(users.role, "guest"))).get()?.n ?? 0;
}

function usageOf(accountId: string, key: PlanLimitKey, boardId?: string): number {
  switch (key) {
    case "guestsPerSeat": return guestCount(accountId);
    case "automationsPerMonth": {
      const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
      return db.select({ n: sql<number>`count(*)` }).from(automationRuns).where(and(eq(automationRuns.accountId, accountId), gte(automationRuns.createdAt, start.toISOString()))).get()?.n ?? 0;
    }
    case "integrations": return db.select({ n: sql<number>`count(*)` }).from(integrations).where(and(eq(integrations.accountId, accountId), eq(integrations.active, true))).get()?.n ?? 0;
    case "viewsPerBoard":
      if (boardId) return db.select({ n: sql<number>`count(*)` }).from(views).where(eq(views.boardId, boardId)).get()?.n ?? 0;
      return db.select({ n: sql<number>`max(c)` }).from(db.select({ c: sql<number>`count(*)`.as("c") }).from(views).groupBy(views.boardId).as("v")).get()?.n ?? 0;
  }
}

/**
 * Check one limit. `used` is the current usage; `ok` says whether `used + increment` still fits.
 * `account` is an Actor or an account id. Never throws.
 */
export function checkLimit(account: Actor | string, key: LimitKey, opts: { boardId?: string; increment?: number } = {}): LimitResult {
  const accountId = typeof account === "string" ? account : account.accountId;
  const plan = accountPlan(accountId);
  const limits = effectiveLimits(accountId);
  const inc = opts.increment ?? 1;
  const planKey: PlanLimitKey = key === "guests" ? "guestsPerSeat" : key;
  const per = limits[planKey];
  const limit = per === null ? null : key === "guests" ? per * seatCount(accountId) : per;
  const used = usageOf(accountId, planKey, opts.boardId);
  return { ok: limit === null || used + inc <= limit, key, limit, used, remaining: limit === null ? null : Math.max(0, limit - used), plan };
}

export function assertLimit(account: Actor | string, key: LimitKey, opts: { boardId?: string; increment?: number } = {}): void {
  const r = checkLimit(account, key, opts);
  if (!r.ok) throw new ForbiddenError(`Plan limit reached for ${key} (${r.used}/${r.limit}, plan ${r.plan})`);
}

export interface PlanUsage { plan: PlanKey; label: string; seats: number; limits: LimitResult[] }

export function usage(accountId: string): PlanUsage {
  const plan = accountPlan(accountId);
  return {
    plan, label: PLANS[plan].label, seats: seatCount(accountId),
    limits: (["guests", "automationsPerMonth", "integrations", "viewsPerBoard"] as LimitKey[]).map((k) => checkLimit(accountId, k, { increment: 0 })),
  };
}
