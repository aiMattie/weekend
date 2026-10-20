/**
 * Automation engine: consumes bus events, matches triggers, evaluates conditions, runs steps.
 *
 * - Events are handled one at a time through a queue (never inside the emitting request).
 * - Loop protection: an AsyncLocalStorage store marks every event emitted by an action with the
 *   chain of automations that caused it. A run is skipped when its automation is already in the
 *   chain (no self retrigger) or the chain is deeper than MAX_DEPTH.
 * - Limits: per board per hour and per account per month (accounts.settings.automationLimits or env).
 * - Failures retry with backoff (RETRY_BACKOFF_MINUTES); resumeDueRuns() is driven by the scheduler.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { and, count, eq, gte, lte, ne } from "drizzle-orm";
import { systemActor } from "../../lib/actor";
import { subscribe, type AppEvent } from "../../lib/events";
import { newId } from "../../lib/id";
import { db } from "../../db/client";
import { accounts } from "../../db/schema/core";
import { automationRuns, automations } from "../../db/schema/automations";
import { getBlock } from "./blocks/registry";
import type { RunContext } from "./blocks/types";
import { buildVars, loadItem, makeMatchContext, triggerVars } from "./context";
import {
  compileSteps, isGroup, MAX_ATTEMPTS, MAX_DEPTH, renderTemplate, RETRY_BACKOFF_MINUTES,
  type BlockRef, type ConditionGroup, type RunStep, type TriggerSnapshot,
} from "./model";
import { notifyUsers } from "./notify";
import { resolveUsers } from "./blocks/helpers";

export type AutomationRow = typeof automations.$inferSelect;
export type RunRow = typeof automationRuns.$inferSelect;

interface ChainStore { runId: string; chain: string[]; depth: number; originId: string }
const g = globalThis as unknown as {
  __autoAls?: AsyncLocalStorage<ChainStore>;
  __autoQueue?: { chain: Promise<unknown>; pending: number };
  __autoUnsub?: () => void;
  __autoClock?: (() => Date) | null;
};
const als = (g.__autoAls ??= new AsyncLocalStorage<ChainStore>());
const queue = (g.__autoQueue ??= { chain: Promise.resolve(), pending: 0 });

export const clock = (): Date => (g.__autoClock ? g.__autoClock() : new Date());
/** Tests: fixed/injected clock. null restores the real one. */
export function setEngineClock(fn: (() => Date) | null): void { g.__autoClock = fn; }

/* ------------------------------------------------------------ limits */

export function limitsFor(accountId: string): { boardPerHour: number; accountPerMonth: number } {
  const acc = db.select({ settings: accounts.settings }).from(accounts).where(eq(accounts.id, accountId)).get();
  const l = (acc?.settings?.automationLimits ?? {}) as { boardPerHour?: number; accountPerMonth?: number };
  return {
    boardPerHour: Number(l.boardPerHour ?? process.env.AUTOMATION_BOARD_HOURLY_LIMIT ?? 1000),
    accountPerMonth: Number(l.accountPerMonth ?? process.env.AUTOMATION_ACCOUNT_MONTHLY_LIMIT ?? 250_000),
  };
}

export function usage(accountId: string, boardId?: string | null, now = clock()): { boardLastHour: number; accountThisMonth: number; limits: ReturnType<typeof limitsFor> } {
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const counted = ne(automationRuns.status, "skipped");
  const accountThisMonth = db.select({ n: count() }).from(automationRuns).where(and(eq(automationRuns.accountId, accountId), gte(automationRuns.createdAt, monthStart), counted)).get()?.n ?? 0;
  const boardLastHour = boardId ? db.select({ n: count() }).from(automationRuns).where(and(eq(automationRuns.boardId, boardId), gte(automationRuns.createdAt, hourAgo), counted)).get()?.n ?? 0 : 0;
  return { boardLastHour, accountThisMonth, limits: limitsFor(accountId) };
}

/* ------------------------------------------------------------ conditions */

export async function evaluateGroup(group: ConditionGroup | undefined, args: { event?: AppEvent; accountId: string; itemId?: string | null }): Promise<boolean> {
  if (!group || !group.conditions.length) return true;
  const ctx = makeMatchContext(args.accountId);
  const item = args.itemId ? loadItem(args.itemId) : null;
  const one = async (c: BlockRef | ConditionGroup): Promise<boolean> => {
    if (isGroup(c)) return evaluateGroup(c, args);
    const block = getBlock(c.type);
    if (!block || block.kind !== "condition" || !block.evaluate) throw new Error(`Unknown condition "${c.type}"`);
    const cfg = block.configSchema.parse(c.config ?? {});
    return !!(await block.evaluate({ event: args.event, item, config: cfg, ctx }));
  };
  if (group.op === "or") { for (const c of group.conditions) if (await one(c)) return true; return false; }
  for (const c of group.conditions) if (!(await one(c))) return false;
  return true;
}

/* ------------------------------------------------------------ run creation */

function skipRun(a: AutomationRow, trigger: TriggerSnapshot, reason: string, store?: ChainStore): RunRow {
  const now = clock().toISOString();
  return db.insert(automationRuns).values({
    automationId: a.id, accountId: a.accountId, boardId: a.boardId, itemId: trigger.itemId ?? null, status: "skipped", error: reason,
    depth: store?.depth ?? 0, originId: store?.originId ?? null, chain: store?.chain ?? [], trigger, snapshot: [], startedAt: now, finishedAt: now,
  }).returning().get();
}

/** Create + execute a run for an automation whose trigger matched. Applies loop protection and limits. */
export async function startRun(a: AutomationRow, trigger: TriggerSnapshot, store: ChainStore | undefined, now = clock()): Promise<RunRow> {
  if (store?.chain.includes(a.id)) return skipRun(a, trigger, "Loop protection: this automation was started by its own changes", store);
  if (store && store.depth > MAX_DEPTH) return skipRun(a, trigger, `Loop protection: chain deeper than ${MAX_DEPTH} automations`, store);
  const u = usage(a.accountId, a.boardId, now);
  if (u.boardLastHour >= u.limits.boardPerHour) return skipRun(a, trigger, `Run limit reached: ${u.limits.boardPerHour} runs per board per hour`, store);
  if (u.accountThisMonth >= u.limits.accountPerMonth) return skipRun(a, trigger, `Run limit reached: ${u.limits.accountPerMonth} runs per account per month`, store);
  const run = db.insert(automationRuns).values({
    automationId: a.id, accountId: a.accountId, boardId: a.boardId, itemId: trigger.itemId ?? null, status: "running", maxAttempts: MAX_ATTEMPTS,
    depth: store?.depth ?? 0, originId: store?.originId ?? newId(), chain: store?.chain ?? [], trigger, snapshot: a.definition.steps, startedAt: now.toISOString(),
  }).returning().get();
  db.update(automations).set({ runCount: a.runCount + 1, lastRunAt: now.toISOString() }).where(eq(automations.id, a.id)).run();
  return executeRun(run.id, now);
}

/* ------------------------------------------------------------ execution */

function buildCtx(a: AutomationRow, run: RunRow, config: unknown, now: Date): RunContext<never> {
  const trigger = run.trigger;
  const vars = () => buildVars(a.accountId, run.boardId, trigger.itemId, trigger, now);
  return {
    actor: systemActor(a.accountId, "automation"), accountId: a.accountId, boardId: run.boardId, trigger, config: config as never,
    event: trigger.event as unknown as AppEvent | undefined, run: { id: run.id, automationId: a.id, depth: run.depth },
    vars, item: () => (trigger.itemId ? loadItem(trigger.itemId) : null), render: (tpl) => renderTemplate(tpl, vars()), now: () => now,
  };
}

const save = (id: string, patch: Partial<RunRow>) => db.update(automationRuns).set(patch).where(eq(automationRuns.id, id)).returning().get();

/** Run (or resume) a run from its program counter. Handles retries and approvals. */
export async function executeRun(runId: string, now = clock()): Promise<RunRow> {
  let run = db.select().from(automationRuns).where(eq(automationRuns.id, runId)).get();
  if (!run) throw new Error(`Run ${runId} not found`);
  const a = db.select().from(automations).where(eq(automations.id, run.automationId)).get();
  if (!a || a.state === "deleted") return save(runId, { status: "failed", error: "Automation was deleted", finishedAt: now.toISOString() });
  const program = compileSteps(run.snapshot);
  const steps: RunStep[] = [...run.steps];
  run = save(runId, { status: "running", error: null, nextRetryAt: null });
  let pc = run.pc;
  const chainStore: ChainStore = { runId, chain: [...run.chain, a.id], depth: run.depth + 1, originId: run.originId ?? runId };
  const log = (s: Omit<RunStep, "at">) => steps.push({ ...s, at: clock().toISOString() });
  try {
    while (pc < program.length) {
      const ins = program[pc];
      if (ins.op === "jump") { pc = ins.to; continue; }
      if (ins.op === "jumpIfNot") {
        const ok = await evaluateGroup(ins.condition, { event: run.trigger.event as unknown as AppEvent, accountId: a.accountId, itemId: run.trigger.itemId });
        log({ pc, id: ins.id, block: "branch", status: "ok", output: ok ? "then" : "else" });
        pc = ok ? pc + 1 : ins.to;
        continue;
      }
      if (ins.op === "approval") {
        const ctx = buildCtx(a, run, {}, now);
        const approvers = resolveUsers(ctx, [...ins.approverIds, ...(ins.approverColumnId ? [`@col:${ins.approverColumnId}`] : [])]);
        const item = ctx.item();
        await notifyUsers(ctx.actor, approvers, { title: ins.message ? ctx.render(ins.message) : `Goedkeuring nodig: ${item?.name ?? a.name}`, body: a.name, boardId: run.boardId, itemId: item?.id });
        log({ pc, id: ins.id, block: "approval", status: "ok", output: `waiting for ${approvers.length} approver(s)` });
        return save(runId, { status: "waiting_approval", pc: pc + 1, steps, approval: { approverIds: approvers, stepId: ins.id, requestedAt: now.toISOString() } });
      }
      const block = getBlock(ins.block);
      if (!block || block.kind !== "action" || !block.run) throw new Error(`Unknown action "${ins.block}"`);
      const cfg = block.configSchema.parse(ins.config ?? {});
      const ctx = buildCtx(a, run, cfg, now);
      if (block.needsItem && !ctx.item()) throw new Error("This action needs an item but the run has none (or it was deleted)");
      const out = await als.run(chainStore, async () => block.run!(ctx as never));
      log({ pc, id: ins.id, block: ins.block, status: "ok", output: typeof out === "string" ? out : undefined });
      pc++;
      save(runId, { pc, steps });
    }
    return save(runId, { status: "success", pc, steps, error: null, finishedAt: clock().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const ins = program[pc];
    log({ pc, id: ins && "id" in ins ? ins.id : undefined, block: ins && ins.op === "action" ? ins.block : ins?.op ?? "?", status: "failed", error: msg });
    if (run.attempt < run.maxAttempts) {
      const wait = RETRY_BACKOFF_MINUTES[Math.min(run.attempt - 1, RETRY_BACKOFF_MINUTES.length - 1)];
      return save(runId, { status: "retrying", pc, steps, error: msg, attempt: run.attempt + 1, nextRetryAt: new Date(now.getTime() + wait * 60_000).toISOString() });
    }
    return save(runId, { status: "failed", pc, steps, error: msg, finishedAt: clock().toISOString() });
  }
}

/** Retry every run whose backoff elapsed (scheduler tick). */
export async function resumeDueRuns(now = clock()): Promise<number> {
  const due = db.select({ id: automationRuns.id }).from(automationRuns).where(and(eq(automationRuns.status, "retrying"), lte(automationRuns.nextRetryAt, now.toISOString()))).all();
  for (const r of due) await executeRun(r.id, now).catch((e) => console.error("[automations] retry failed", e));
  return due.length;
}

/** Approve or reject a run waiting on an approval step. */
export async function decideApproval(runId: string, approve: boolean, by: { id: string; name?: string }, now = clock()): Promise<RunRow> {
  const run = db.select().from(automationRuns).where(eq(automationRuns.id, runId)).get();
  if (!run || run.status !== "waiting_approval") throw new Error("Run is not waiting for approval");
  const approvers = ((run.approval?.approverIds as string[] | undefined) ?? []);
  if (approvers.length && !approvers.includes(by.id) && by.id !== "system") throw new Error("You are not an approver of this run");
  const approval = { ...(run.approval ?? {}), decision: approve ? "approved" : "rejected", decidedBy: by.id, decidedAt: now.toISOString() };
  if (!approve) return save(runId, { status: "rejected", approval, finishedAt: now.toISOString(), error: null });
  save(runId, { approval });
  return executeRun(runId, now);
}

/* ------------------------------------------------------------ event handling */

function snapshotOf(event: AppEvent, a: AutomationRow): TriggerSnapshot {
  const itemId = "itemId" in event ? (event.itemId as string) : null;
  return { type: a.definition.trigger.type, at: event.at, itemId, boardId: event.boardId, vars: triggerVars(a.accountId, event), event: event as unknown as Record<string, unknown> };
}

/** Match one bus event against the active automations of its board and run the matching ones. */
export async function handleEvent(event: AppEvent, store?: ChainStore, now = clock()): Promise<RunRow[]> {
  if (!event.boardId) return [];
  const candidates = db.select().from(automations).where(and(eq(automations.boardId, event.boardId), eq(automations.active, true), eq(automations.status, "published"), eq(automations.state, "active"))).all();
  const out: RunRow[] = [];
  for (const a of candidates) {
    const block = getBlock(a.definition.trigger.type);
    if (!block || block.kind !== "trigger" || !block.events?.includes(event.type) || !block.matches) continue;
    try {
      const ctx = makeMatchContext(a.accountId);
      const cfg = block.configSchema.parse(a.definition.trigger.config ?? {});
      if (!block.matches(event, cfg, ctx)) continue;
      const trigger = snapshotOf(event, a);
      if (!(await evaluateGroup(a.definition.conditions, { event, accountId: a.accountId, itemId: trigger.itemId }))) continue;
      out.push(await startRun(a, trigger, store, now));
    } catch (err) {
      console.error(`[automations] ${a.id} failed to start`, err);
    }
  }
  return out;
}

function enqueue(task: () => Promise<unknown>): void {
  queue.pending++;
  queue.chain = queue.chain.then(task).catch((e) => console.error("[automations] task failed", e)).finally(() => { queue.pending--; });
}

/** Wait until every queued event has been processed (tests, scheduler). */
export async function drain(): Promise<void> {
  for (let i = 0; i < 200; i++) {
    await queue.chain;
    if (queue.pending === 0) return;
  }
}

/** Subscribe to the bus. Safe to call repeatedly (HMR): the previous subscription is replaced. */
export function startEngine(): void {
  g.__autoUnsub?.();
  g.__autoUnsub = subscribe((event) => {
    if (!event.boardId) return;
    const store = als.getStore();
    enqueue(() => handleEvent(event, store));
  });
}
export function stopEngine(): void { g.__autoUnsub?.(); g.__autoUnsub = undefined; }
