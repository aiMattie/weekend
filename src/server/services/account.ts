/** Admin center > Account: general settings, logo and the plan (limits + read-only usage). */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { assertCan, can } from "../../lib/permissions";
import { db } from "../../db/client";
import { accounts } from "../../db/schema/core";
import { removeImage, saveImage } from "../../modules/admin/lib/images";
import { accountRow, getSettings, patchSettings } from "./account-settings";
import { recordAudit } from "./audit";
import { LIMIT_KEYS, PLAN_KEYS, PLANS, accountPlan, effectiveLimits, usage, type PlanKey, type PlanLimitKey, type PlanUsage } from "./plans";
import { parse } from "./_shared";

export { checkLimit, assertLimit } from "./plans";

export interface AccountInfo {
  id: string; name: string; slug: string; plan: PlanKey;
  general: { logoUrl: string | null; defaultLocale: "nl" | "en"; timeZone: string; weekStart: "monday" | "sunday" | "saturday" };
}

/** Readable by every user of the account (name, logo, defaults). */
export function get(actor: Actor): AccountInfo {
  const a = accountRow(actor.accountId);
  return { id: a.id, name: a.name, slug: a.slug, plan: accountPlan(a.id), general: getSettings(a.id).general };
}

const updateInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  defaultLocale: z.enum(["nl", "en"]).optional(),
  timeZone: z.string().trim().min(1).max(60).refine((tz) => { try { new Intl.DateTimeFormat("nl", { timeZone: tz }); return true; } catch { return false; } }, "Unknown time zone").optional(),
  weekStart: z.enum(["monday", "sunday", "saturday"]).optional(),
});

export function update(actor: Actor, input: unknown): AccountInfo {
  assertCan(actor, "account:manage");
  const d = parse(updateInput, input);
  if (d.name) db.update(accounts).set({ name: d.name }).where(eq(accounts.id, actor.accountId)).run();
  patchSettings(actor.accountId, (s) => {
    if (d.defaultLocale) s.general.defaultLocale = d.defaultLocale;
    if (d.timeZone) s.general.timeZone = d.timeZone;
    if (d.weekStart) s.general.weekStart = d.weekStart;
  });
  recordAudit(actor, "account.settings_changed", { ...d });
  return get(actor);
}

export function setLogo(actor: Actor, data: Buffer | null): AccountInfo {
  assertCan(actor, "account:manage");
  if (data) saveImage("logo", actor.accountId, data);
  else removeImage("logo", actor.accountId);
  patchSettings(actor.accountId, (s) => { s.general.logoUrl = data ? `/api/v1/account/logo?v=${Date.now()}` : null; });
  recordAudit(actor, data ? "account.logo_changed" : "account.logo_removed", {});
  return get(actor);
}

/* ------------------------------------------------------------------ plan / billing (read-only usage) */

export interface PlanOverview extends PlanUsage {
  plans: { key: PlanKey; label: string; limits: Record<PlanLimitKey, number | null> }[];
  effective: Record<PlanLimitKey, number | null>;
  overrides: Record<string, number | null>;
}

export function planOverview(actor: Actor): PlanOverview {
  if (!can(actor, "account:billing")) assertCan(actor, "account:manage");
  return {
    ...usage(actor.accountId),
    plans: PLAN_KEYS.map((k) => ({ key: k, label: PLANS[k].label, limits: PLANS[k].limits })),
    effective: effectiveLimits(actor.accountId), overrides: getSettings(actor.accountId).planOverrides,
  };
}

/** Switch plan (no payment: this only changes the limits). */
export function setPlan(actor: Actor, plan: unknown): PlanOverview {
  assertCan(actor, "account:billing");
  const p = parse(z.enum(PLAN_KEYS), plan);
  const from = accountPlan(actor.accountId);
  db.update(accounts).set({ plan: p }).where(eq(accounts.id, actor.accountId)).run();
  patchSettings(actor.accountId, (s) => { s.planOverrides = {}; });
  recordAudit(actor, "plan.changed", { from, to: p });
  return planOverview(actor);
}

/** Override one limit of the plan (null = unlimited, undefined removes the override). */
export function setLimitOverride(actor: Actor, key: unknown, value: unknown): PlanOverview {
  assertCan(actor, "account:billing");
  const k = parse(z.enum(LIMIT_KEYS), key);
  const v = parse(z.number().int().min(0).max(1_000_000).nullable().optional(), value);
  patchSettings(actor.accountId, (s) => { if (v === undefined) delete s.planOverrides[k]; else s.planOverrides[k] = v; });
  recordAudit(actor, "plan.limit_changed", { key: k, value: v ?? "default" });
  return planOverview(actor);
}
