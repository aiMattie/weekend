/**
 * Agent engine (module ai): turns bus events (src/lib/events.ts) and a minute tick into agent runs.
 * Events are processed one at a time through a queue (never inside the request that caused them).
 * Loop protection lives in agent-runner.ts (chain via AsyncLocalStorage); on top of that an agent
 * never reacts to events caused by its own identity user.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { agentTriggers, agents } from "../../db/schema/ai";
import { columns, items, updates } from "../../db/schema/core";
import { subscribe, type AppEvent } from "../../lib/events";
import { executeAgent, agentAls, type AgentRunRow, type ChainStore, type RunTrigger } from "./agent-runner";

type AgentRow = typeof agents.$inferSelect;
type TriggerRow = typeof agentTriggers.$inferSelect;

const g = globalThis as unknown as { __agentUnsub?: () => void; __agentQueue?: { chain: Promise<unknown>; pending: number }; __agentTimer?: ReturnType<typeof setInterval> };
const queue = (g.__agentQueue ??= { chain: Promise.resolve(), pending: 0 });

function enqueue(task: () => Promise<unknown>): void {
  queue.pending++;
  queue.chain = queue.chain.then(task).catch((e) => console.error("[agents] task failed", e instanceof Error ? e.message : e)).finally(() => { queue.pending--; });
}

/** Wait until every queued event has been handled (tests). */
export async function drainAgents(): Promise<void> {
  for (let i = 0; i < 200; i++) { await queue.chain; if (queue.pending === 0) return; }
}

const activeTriggers = (type: TriggerRow["type"]): { agent: AgentRow; trigger: TriggerRow }[] =>
  db.select({ agent: agents, trigger: agentTriggers }).from(agentTriggers).innerJoin(agents, eq(agents.id, agentTriggers.agentId))
    .where(and(eq(agentTriggers.type, type), eq(agentTriggers.active, true), eq(agents.status, "active"), eq(agents.state, "active"))).all();

function labelText(columnId: string, value: unknown): string | null {
  const col = db.select().from(columns).where(eq(columns.id, columnId)).get();
  const idx = (value as { index?: number } | null)?.index;
  if (!col || idx === undefined || !Array.isArray(col.settings.labels)) return null;
  return (col.settings.labels as { id: number; text: string }[]).find((l) => l.id === idx)?.text ?? null;
}

/** Which runs does one event cause? Pure matching + a few reads. */
export function matchEvent(event: AppEvent): { agent: AgentRow; trigger: RunTrigger }[] {
  const out: { agent: AgentRow; trigger: RunTrigger }[] = [];
  const own = (a: AgentRow) => !!a.userId && event.actorId === a.userId;
  if (event.type === "item.created" && event.boardId && !event.parentItemId) {
    for (const { agent, trigger } of activeTriggers("item_created")) {
      if (own(agent) || trigger.config.boardId !== event.boardId) continue;
      out.push({ agent, trigger: { type: "item_created", itemId: event.itemId, boardId: event.boardId } });
    }
  } else if (event.type === "column_value.changed" && event.boardId) {
    for (const { agent, trigger } of activeTriggers("column_changed")) {
      const c = trigger.config as { boardId?: string; columnId?: string; labelText?: string };
      if (own(agent) || c.boardId !== event.boardId || (c.columnId && c.columnId !== event.columnId)) continue;
      const to = labelText(event.columnId, event.to);
      if (c.labelText && c.labelText.toLowerCase() !== (to ?? "").toLowerCase()) continue;
      out.push({ agent, trigger: { type: "column_changed", itemId: event.itemId, boardId: event.boardId, data: { columnId: event.columnId, to } } });
    }
  } else if (event.type === "update.created" && event.boardId) {
    const up = db.select({ mentions: updates.mentions, text: updates.bodyText }).from(updates).where(eq(updates.id, event.updateId)).get();
    if (up?.mentions?.length) {
      for (const { agent, trigger } of activeTriggers("mention")) {
        const c = trigger.config as { boardId?: string };
        if (own(agent) || !agent.userId || !up.mentions.includes(agent.userId) || (c.boardId && c.boardId !== event.boardId)) continue;
        out.push({ agent, trigger: { type: "mention", itemId: event.itemId, boardId: event.boardId, data: { updateText: up.text.slice(0, 1500) } } });
      }
    }
  }
  return out;
}

export async function handleEvent(event: AppEvent, store?: ChainStore): Promise<AgentRunRow[]> {
  const runs: AgentRunRow[] = [];
  for (const m of matchEvent(event)) {
    const item = m.trigger.itemId ? db.select({ id: items.id }).from(items).where(eq(items.id, m.trigger.itemId)).get() : null;
    if (m.trigger.itemId && !item) continue;
    runs.push(await executeAgent(m.agent.id, m.trigger, { store, startedBy: null }));
  }
  return runs;
}

/* ------------------------------------------------------------ schedules */

const TZ = "Europe/Amsterdam";
export function localParts(now: Date): { date: string; time: string; weekday: number } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  const wd = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[p.weekday] ?? 1;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, weekday: wd };
}

/** Fire key for a schedule at `now`, or null when it is not due (wrong day or before the time). */
export function dueKey(config: Record<string, unknown>, now: Date): string | null {
  const every = String(config.every ?? "day");
  const time = /^\d{2}:\d{2}$/.test(String(config.time)) ? String(config.time) : "09:00";
  const l = localParts(now);
  if (every === "weekday" && l.weekday > 5) return null;
  if (every === "week" && l.weekday !== Number(config.weekday ?? 1)) return null;
  if (l.time < time) return null;
  return `${l.date}T${time}`;
}

/** Run every schedule trigger that is due (once per fire key). Called each minute; exported for tests. */
export async function tickSchedules(now = new Date()): Promise<AgentRunRow[]> {
  const runs: AgentRunRow[] = [];
  for (const { agent, trigger } of activeTriggers("schedule")) {
    const key = dueKey(trigger.config, now);
    if (!key || trigger.lastFiredKey === key) continue;
    db.update(agentTriggers).set({ lastFiredKey: key }).where(eq(agentTriggers.id, trigger.id)).run();
    runs.push(await executeAgent(agent.id, { type: "schedule", data: { key } }, { now }));
  }
  return runs;
}

/** When a schedule trigger is created, a time that has already passed today must not fire at once. */
export const initialFiredKey = (config: Record<string, unknown>, now = new Date()): string | null => dueKey(config, now);

/* ------------------------------------------------------------ lifecycle */

/** Subscribe to the bus + minute tick. Idempotent (HMR safe). */
export function startAgentEngine(): void {
  g.__agentUnsub?.();
  g.__agentUnsub = subscribe((event) => {
    if (!event.boardId) return;
    const store = agentAls.getStore(); // set while an agent run is performing writes
    enqueue(() => handleEvent(event, store));
  });
  if (g.__agentTimer) clearInterval(g.__agentTimer);
  if (process.env.AI_SCHEDULER !== "off" && !process.env.VITEST) {
    g.__agentTimer = setInterval(() => { enqueue(() => tickSchedules()); }, 60_000);
    g.__agentTimer.unref?.();
  }
}
export function stopAgentEngine(): void { g.__agentUnsub?.(); g.__agentUnsub = undefined; if (g.__agentTimer) clearInterval(g.__agentTimer); g.__agentTimer = undefined; }
