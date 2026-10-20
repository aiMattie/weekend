/**
 * AI core (module ai): settings, kill switch, credit accounting and the ONE metered entry point
 * (`callLlm`) every AI feature uses. Credits: 1 credit = 1000 weighted tokens (output counts 5x).
 * Limits are monthly (UTC calendar month), per user and per account; null = unlimited.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ServiceError } from "../../lib/errors";
import { assertCan } from "../../lib/permissions";
import { db } from "../../db/client";
import { aiSettings, aiUsage, type AiSource } from "../../db/schema/ai";
import { users } from "../../db/schema/core";
import { completeJson, getLlm, providerInfo, DEFAULT_MODEL, type JsonCall, type LlmCallOptions, type LlmClient, type LlmRequest, type LlmResult } from "../ai/llm";
import { parse } from "./_shared";
import { recordAudit } from "./audit";

export class AiNotConfiguredError extends ServiceError {
  constructor(reason: "not_configured" | "disabled" = "not_configured") {
    super(reason === "disabled" ? "AI is uitgeschakeld voor dit account" : "AI niet geconfigureerd", "bad_request", 503, { reason: reason === "disabled" ? "ai_disabled" : "ai_not_configured" });
  }
}
export class AiCreditsError extends ServiceError {
  constructor(scope: "user" | "account", limit: number, used: number) {
    super(scope === "user" ? "Je AI-credits voor deze maand zijn op" : "De AI-credits van dit account zijn op", "bad_request", 429, { reason: "ai_credits_exhausted", scope, limit, used });
  }
}

export interface AiSettingsDto {
  accountMonthlyCredits: number | null;
  userMonthlyCredits: number | null;
  agentsEnabled: boolean;
  aiEnabled: boolean;
  model: string | null;
}

const envInt = (name: string): number | null => { const v = Number(process.env[name]); return Number.isFinite(v) && process.env[name] ? v : null; };
const DEFAULTS = (): AiSettingsDto => ({ accountMonthlyCredits: envInt("AI_ACCOUNT_MONTHLY_CREDITS"), userMonthlyCredits: envInt("AI_USER_MONTHLY_CREDITS") ?? 2000, agentsEnabled: true, aiEnabled: true, model: null });

export function getSettings(accountId: string): AiSettingsDto {
  const row = db.select().from(aiSettings).where(eq(aiSettings.accountId, accountId)).get();
  if (!row) return DEFAULTS();
  return { accountMonthlyCredits: row.accountMonthlyCredits, userMonthlyCredits: row.userMonthlyCredits, agentsEnabled: row.agentsEnabled, aiEnabled: row.aiEnabled, model: row.model };
}

const limitSchema = z.number().int().min(0).max(100_000_000).nullable();
const updateInput = z.object({
  accountMonthlyCredits: limitSchema.optional(),
  userMonthlyCredits: limitSchema.optional(),
  agentsEnabled: z.boolean().optional(),
  aiEnabled: z.boolean().optional(),
  model: z.string().trim().max(100).nullable().optional(),
});

/** Admin: change limits, kill switch and model. Audited. */
export function updateSettings(actor: Actor, input: unknown): AiSettingsDto {
  assertCan(actor, "account:manage");
  const d = parse(updateInput, input);
  const cur = getSettings(actor.accountId);
  const next: AiSettingsDto = { ...cur, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) } as AiSettingsDto;
  if (next.model === "") next.model = null;
  db.insert(aiSettings).values({ accountId: actor.accountId, ...next }).onConflictDoUpdate({ target: aiSettings.accountId, set: { ...next, updatedAt: new Date().toISOString() } }).run();
  const changed = Object.keys(d).filter((k) => (d as Record<string, unknown>)[k] !== undefined && (cur as unknown as Record<string, unknown>)[k] !== (next as unknown as Record<string, unknown>)[k]);
  recordAudit(actor, cur.agentsEnabled !== next.agentsEnabled ? (next.agentsEnabled ? "ai.agents_enabled" : "ai.agents_killed") : "ai.settings_changed", { targetType: "ai", changed, before: cur, after: next });
  return next;
}

/* ------------------------------------------------------------ credits */

export const creditsFor = (inputTokens: number, outputTokens: number): number => Math.max(0, Math.ceil((inputTokens + 5 * outputTokens) / 1000));
export const monthStart = (now = new Date()): string => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

export function creditsUsed(accountId: string, userId?: string | null, now = new Date()): number {
  const r = db.select({ n: sql<number>`coalesce(sum(${aiUsage.credits}), 0)` }).from(aiUsage)
    .where(and(eq(aiUsage.accountId, accountId), gte(aiUsage.createdAt, monthStart(now)), userId ? eq(aiUsage.userId, userId) : undefined)).get();
  return r?.n ?? 0;
}

/** Throws AiCreditsError when the user's or the account's monthly limit is reached. */
export function assertCredits(accountId: string, userId: string | null): void {
  const s = getSettings(accountId);
  if (s.userMonthlyCredits !== null && userId) {
    const used = creditsUsed(accountId, userId);
    if (used >= s.userMonthlyCredits) throw new AiCreditsError("user", s.userMonthlyCredits, used);
  }
  if (s.accountMonthlyCredits !== null) {
    const used = creditsUsed(accountId);
    if (used >= s.accountMonthlyCredits) throw new AiCreditsError("account", s.accountMonthlyCredits, used);
  }
}

export interface AiStatus {
  configured: boolean;
  enabled: boolean;
  agentsEnabled: boolean;
  model: string;
  baseUrl: string | null;
  credits: { userUsed: number; userLimit: number | null; accountUsed: number; accountLimit: number | null };
}

/** What the UI needs to show the "AI niet geconfigureerd" state and the credit counter. Never contains a key. */
export function status(actor: Actor): AiStatus {
  const p = providerInfo();
  const s = getSettings(actor.accountId);
  return {
    configured: p.configured, enabled: s.aiEnabled, agentsEnabled: s.agentsEnabled,
    model: s.model || p.defaultModel,
    baseUrl: p.baseUrl ? safeHost(p.baseUrl) : null,
    credits: { userUsed: creditsUsed(actor.accountId, actor.id), userLimit: s.userMonthlyCredits, accountUsed: creditsUsed(actor.accountId), accountLimit: s.accountMonthlyCredits },
  };
}

function safeHost(url: string): string {
  try { const u = new URL(url); return `${u.protocol}//${u.host}${u.pathname === "/" ? "" : u.pathname}`; } catch { return "(ongeldige URL)"; }
}

export interface UsageSummary {
  month: string;
  total: { credits: number; inputTokens: number; outputTokens: number; calls: number };
  bySource: { source: string; credits: number; calls: number }[];
  byUser: { userId: string | null; name: string; credits: number; calls: number }[];
}

/** Admin: usage of the account this month, per source and per user. */
export function usageSummary(actor: Actor, now = new Date()): UsageSummary {
  assertCan(actor, "account:manage");
  const since = monthStart(now);
  const where = and(eq(aiUsage.accountId, actor.accountId), gte(aiUsage.createdAt, since));
  const total = db.select({ credits: sql<number>`coalesce(sum(${aiUsage.credits}),0)`, i: sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)`, o: sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)`, calls: sql<number>`count(*)` }).from(aiUsage).where(where).get()!;
  const bySource = db.select({ source: aiUsage.source, credits: sql<number>`coalesce(sum(${aiUsage.credits}),0)`, calls: sql<number>`count(*)` }).from(aiUsage).where(where).groupBy(aiUsage.source).orderBy(desc(sql`sum(${aiUsage.credits})`)).all();
  const byUser = db.select({ userId: aiUsage.userId, name: users.name, credits: sql<number>`coalesce(sum(${aiUsage.credits}),0)`, calls: sql<number>`count(*)` }).from(aiUsage).leftJoin(users, eq(users.id, aiUsage.userId)).where(where).groupBy(aiUsage.userId).orderBy(desc(sql`sum(${aiUsage.credits})`)).all();
  return { month: since.slice(0, 7), total: { credits: total.credits, inputTokens: total.i, outputTokens: total.o, calls: total.calls }, bySource, byUser: byUser.map((u) => ({ userId: u.userId, name: u.name ?? "Systeem / agents", credits: u.credits, calls: u.calls })) };
}

/* ------------------------------------------------------------ metered call */

export interface CallCtx { accountId: string; userId: string | null; source: AiSource; refId?: string | null }

export function modelFor(accountId: string): string { return getSettings(accountId).model || providerInfo().defaultModel || DEFAULT_MODEL; }

/** The configured client or an AiNotConfiguredError (also when the account switched AI off). */
export function requireLlm(accountId: string): LlmClient {
  if (!getSettings(accountId).aiEnabled) throw new AiNotConfiguredError("disabled");
  const llm = getLlm();
  if (!llm) throw new AiNotConfiguredError();
  return llm;
}

export function isAiAvailable(accountId: string): boolean {
  return getSettings(accountId).aiEnabled && providerInfo().configured;
}

export function recordUsage(ctx: CallCtx, r: Pick<LlmResult, "inputTokens" | "outputTokens" | "model">): number {
  const credits = creditsFor(r.inputTokens, r.outputTokens);
  db.insert(aiUsage).values({ accountId: ctx.accountId, userId: ctx.userId, source: ctx.source, refId: ctx.refId ?? null, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, credits }).run();
  return credits;
}

/** Credit check, call, usage record. Every AI feature goes through here. */
export async function callLlm(ctx: CallCtx, req: LlmRequest, opts?: LlmCallOptions): Promise<LlmResult & { credits: number }> {
  const llm = requireLlm(ctx.accountId);
  assertCredits(ctx.accountId, ctx.userId);
  const r = await llm.complete({ ...req, model: req.model || modelFor(ctx.accountId) }, opts);
  return { ...r, credits: recordUsage(ctx, r) };
}

/** Metered JSON call validated by zod (one repair round). Returns the credits spent too. */
export async function callJson<S extends z.ZodType>(ctx: CallCtx, schema: S, req: LlmRequest): Promise<{ value: z.output<S>; credits: number }> {
  let credits = 0;
  const call: JsonCall = async (r) => { const out = await callLlm(ctx, r); credits += out.credits; return out; };
  const { value } = await completeJson(call, schema, req);
  return { value, credits };
}
