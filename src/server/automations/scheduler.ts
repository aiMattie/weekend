/**
 * Scheduler: an in-process tick (every minute) that fires time based triggers (date arrives,
 * recurring, status lasts N days), retries failed runs and sends due webhook deliveries.
 *
 * Catch-up on boot: the first tick runs immediately. Every firing is recorded in
 * `automation_fired` (automation + dedupe key), so a missed minute/hour/day is fired exactly once
 * and nothing fires twice. `tick(now)` takes an injected clock (tests, POST /api/test/automations/tick).
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { activityLog, columns, items } from "../../db/schema/core";
import { automationFired, automations } from "../../db/schema/automations";
import * as webhooks from "../services/webhooks";
import { getBlock } from "./blocks/registry";
import { clock, drain, resumeDueRuns, startRun, type AutomationRow } from "./engine";
import { dateArrivesAt, DEFAULT_TZ, latestOccurrence } from "./schedule-math";
import type { TriggerSnapshot } from "./model";

export interface TickResult { fired: number; retried: number; deliveries: number; at: string }

const tz = () => process.env.APP_TZ || DEFAULT_TZ;
/** never fire for dates older than this when catching up */
const CATCH_UP_DAYS = 7;

/** Insert the dedupe row; true when this is the first time (so the caller should fire). */
function claim(automationId: string, key: string): boolean {
  const r = db.insert(automationFired).values({ automationId, dedupeKey: key }).onConflictDoNothing().run();
  return r.changes > 0;
}
const alreadyFired = (automationId: string, key: string) => !!db.select().from(automationFired).where(and(eq(automationFired.automationId, automationId), eq(automationFired.dedupeKey, key))).get();

async function fire(a: AutomationRow, itemId: string | null, vars: Record<string, string>, now: Date): Promise<void> {
  const trigger: TriggerSnapshot = { type: a.definition.trigger.type, at: now.toISOString(), itemId, boardId: a.boardId, vars };
  await startRun(a, trigger, undefined, now);
}

function boardItems(boardId: string) {
  return db.select().from(items).where(and(eq(items.boardId, boardId), eq(items.state, "active"))).all().filter((i) => !i.parentItemId);
}

async function tickDate(a: AutomationRow, now: Date): Promise<number> {
  const cfg = getBlock("date_arrives")!.configSchema.parse(a.definition.trigger.config);
  if (!a.boardId || !cfg.columnId) return 0;
  const col = db.select().from(columns).where(eq(columns.id, cfg.columnId)).get();
  const earliest = Math.max(Date.parse(a.createdAt), now.getTime() - CATCH_UP_DAYS * 86_400_000);
  let n = 0;
  for (const it of boardItems(a.boardId)) {
    const raw = it.values[cfg.columnId] as { date?: string; time?: string; to?: string; from?: string } | undefined;
    const value = col?.type === "timeline" ? (raw?.to ? { date: raw.to } : undefined) : raw?.date ? { date: raw.date, time: raw.time } : undefined;
    const at = dateArrivesAt(cfg, value, tz());
    if (!at || at.getTime() > now.getTime() || at.getTime() < earliest) continue;
    const key = `date:${it.id}:${cfg.columnId}:${at.toISOString()}`;
    if (alreadyFired(a.id, key) || !claim(a.id, key)) continue;
    await fire(a, it.id, { date: value!.date }, now);
    n++;
  }
  return n;
}

async function tickRecurring(a: AutomationRow, now: Date): Promise<number> {
  const cfg = getBlock("recurring")!.configSchema.parse(a.definition.trigger.config);
  const occ = latestOccurrence(cfg, now, tz());
  if (!occ || occ.getTime() < Date.parse(a.createdAt)) return 0;
  const key = `rec:${occ.toISOString()}`;
  if (!claim(a.id, key)) return 0;
  await fire(a, null, { occurrence: occ.toISOString() }, now);
  return 1;
}

async function tickStatusDuration(a: AutomationRow, now: Date): Promise<number> {
  const cfg = getBlock("status_duration")!.configSchema.parse(a.definition.trigger.config);
  if (!a.boardId || !cfg.columnId || cfg.labelId === undefined) return 0;
  let n = 0;
  for (const it of boardItems(a.boardId)) {
    const v = it.values[cfg.columnId] as { index?: number } | undefined;
    if (!v || String(v.index) !== cfg.labelId) continue;
    // when did the item enter this status? last change row to that label, else item creation
    const rows = db.select().from(activityLog).where(and(eq(activityLog.itemId, it.id), eq(activityLog.columnId, cfg.columnId), eq(activityLog.event, "change_column_value"))).orderBy(desc(activityLog.createdAt)).limit(5).all();
    const entered = rows.find((r) => String((r.data.toValue as { index?: number } | null)?.index) === cfg.labelId)?.createdAt ?? it.createdAt;
    if (now.getTime() - Date.parse(entered) < (cfg.days ?? 5) * 86_400_000) continue;
    const key = `dur:${it.id}:${cfg.columnId}:${entered}`;
    if (!claim(a.id, key)) continue;
    await fire(a, it.id, { days: String(cfg.days ?? 5) }, now);
    n++;
  }
  return n;
}

/** One scheduler pass at `now`. Errors of one automation never stop the others. */
export async function tick(now: Date = clock()): Promise<TickResult> {
  let fired = 0;
  const active = db.select().from(automations).where(and(eq(automations.active, true), eq(automations.status, "published"), eq(automations.state, "active"))).all();
  for (const a of active) {
    const type = a.definition.trigger.type;
    if (type !== "date_arrives" && type !== "recurring" && type !== "status_duration") continue;
    try {
      fired += type === "date_arrives" ? await tickDate(a, now) : type === "recurring" ? await tickRecurring(a, now) : await tickStatusDuration(a, now);
    } catch (err) {
      console.error(`[automations] scheduler: ${a.id} failed`, err);
    }
  }
  const retried = await resumeDueRuns(now);
  const deliveries = await webhooks.processDue(now);
  await drain(); // events caused by fired runs
  return { fired, retried, deliveries, at: now.toISOString() };
}

/* ------------------------------------------------------------ in-process cron */

const g = globalThis as unknown as { __autoTimer?: ReturnType<typeof setInterval>; __autoBusy?: boolean };

export function startScheduler(intervalMs = 60_000): void {
  if (g.__autoTimer) clearInterval(g.__autoTimer);
  const run = () => {
    if (g.__autoBusy) return;
    g.__autoBusy = true;
    tick().catch((e) => console.error("[automations] tick failed", e)).finally(() => { g.__autoBusy = false; });
  };
  g.__autoTimer = setInterval(run, intervalMs);
  g.__autoTimer.unref?.();
  setTimeout(run, 2000).unref?.(); // catch-up on boot
}
export function stopScheduler(): void { if (g.__autoTimer) clearInterval(g.__autoTimer); g.__autoTimer = undefined; }
