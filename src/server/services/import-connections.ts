/**
 * Admin > Import: link the source account (monday.com API key) and schedule recurring
 * imports. Secrets are sealed in accounts.settings.importConnections and never leave the server; the
 * importers pick them up through migration/credentials.ts (linked connection first, .env second).
 *
 * Scheduled runs always write (apply) and are full runs: the importer is idempotent (external_refs).
 * `tickImportSchedules()` is called every minute by migration/import-scheduler.ts.
 */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { systemActor, type Actor } from "../../lib/actor";
import { ConflictError, ValidationError } from "../../lib/errors";
import { assertCan } from "../../lib/permissions";
import { db } from "../../db/client";
import { accounts } from "../../db/schema/core";
import { importJobs } from "../../db/schema/import-jobs";
import { seal } from "../../modules/admin/lib/seal";
import { getSettings, patchSettings, type ImportSchedule } from "./account-settings";
import { recordAudit } from "./audit";
import { startImportJob, type ImportJob } from "./import";
import { mondayCredentials, type CredentialSource } from "./migration/credentials";
import { MondayClient } from "./migration/monday-client";
import { parse } from "./_shared";

export type ConnectionKind = "monday";
export const CONNECTION_KINDS: ConnectionKind[] = ["monday"];

export interface ScheduleView {
  enabled: boolean; frequency: ImportSchedule["frequency"]; hour: number; weekday: number;
  workspaces?: string[];
  lastRunAt: string | null; nextRunAt: string | null;
  lastJob: { id: string; status: ImportJob["status"]; mode: ImportJob["mode"]; createdAt: string; finishedAt: string | null; error: string | null } | null;
}
export interface ConnectionView {
  kind: ConnectionKind;
  linked: boolean;
  /** app = linked here (Admin > Import), env = server .env fallback */
  source: CredentialSource | null;
  /** monday.com account name */
  label: string | null;
  connectedAt: string | null;
  schedule: ScheduleView;
}
export interface ConnectionsView { timeZone: string; connections: ConnectionView[] }

const isKind = (k: string): k is ConnectionKind => (CONNECTION_KINDS as string[]).includes(k);
function kindOf(k: string): ConnectionKind {
  if (!isKind(k)) throw new ValidationError(`Unknown connection: ${k}`);
  return k;
}

/* ------------------------------------------------------------------ schedule maths */

function localHourAndWeekday(d: Date, timeZone: string): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  return { hour, weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd) + 1 };
}

/**
 * First slot after the last run (or after the schedule was enabled): the next full hour (hourly), the next
 * `hour` o'clock (daily) or the next `weekday` at `hour` o'clock (weekly), in the account time zone (DST safe:
 * we walk whole UTC hours and look at the local clock).
 */
export function nextRunAt(s: ImportSchedule, timeZone: string): Date | null {
  if (!s.enabled) return null;
  const base = s.lastRunAt ?? s.enabledAt;
  if (!base) return null;
  const t = new Date(base);
  t.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 24 * 8 + 2; i++) {
    t.setUTCHours(t.getUTCHours() + 1);
    if (s.frequency === "hourly") return t;
    const l = localHourAndWeekday(t, timeZone);
    if (l.hour === s.hour && (s.frequency === "daily" || l.weekday === s.weekday)) return t;
  }
  return null;
}

/* ------------------------------------------------------------------ view */

function lastJobOf(accountId: string, id: string | null): ScheduleView["lastJob"] {
  if (!id) return null;
  const j = db.select().from(importJobs).where(eq(importJobs.id, id)).get();
  if (!j || j.accountId !== accountId) return null;
  return { id: j.id, status: j.status, mode: j.mode, createdAt: j.createdAt, finishedAt: j.finishedAt, error: j.error };
}

function scheduleView(accountId: string, s: ImportSchedule, tz: string, extra: Partial<ScheduleView>): ScheduleView {
  return {
    enabled: s.enabled, frequency: s.frequency, hour: s.hour, weekday: s.weekday, ...extra,
    lastRunAt: s.lastRunAt, nextRunAt: nextRunAt(s, tz)?.toISOString() ?? null, lastJob: lastJobOf(accountId, s.lastJobId),
  };
}

export function adminView(actor: Actor): ConnectionsView {
  assertCan(actor, "account:manage");
  const st = getSettings(actor.accountId);
  const tz = st.general.timeZone;
  const { monday } = st.importConnections;
  const mc = mondayCredentials(actor.accountId);
  return {
    timeZone: tz,
    connections: [
      {
        kind: "monday", linked: !!mc, source: mc?.source ?? null, label: mc?.source === "app" ? monday.accountName : null,
        connectedAt: mc?.source === "app" ? monday.connectedAt : null,
        schedule: scheduleView(actor.accountId, monday.schedule, tz, { workspaces: monday.schedule.workspaces }),
      },
    ],
  };
}

/* ------------------------------------------------------------------ connect / test / disconnect */

export interface ConnectDeps { mondayClient?: (apiKey: string) => MondayClient }

const mondayInput = z.object({ apiKey: z.string().trim().min(20).max(2000) });
async function probeMonday(apiKey: string, deps: ConnectDeps): Promise<string> {
  const client = deps.mondayClient?.(apiKey) ?? new MondayClient({ apiKey });
  try {
    const r = await client.query<{ me: { name: string; account?: { name?: string } | null } | null }>("query { me { name account { name } } }");
    if (!r.me) throw new Error("no user");
    return r.me.account?.name ?? r.me.name;
  } catch (e) {
    throw new ValidationError(`monday weigert de API-sleutel (${(e as Error).message.slice(0, 200)})`);
  }
}

/** Verify the credentials against the source, then store them sealed. */
export async function connect(actor: Actor, kind: string, input: unknown, deps: ConnectDeps = {}): Promise<ConnectionsView> {
  assertCan(actor, "account:manage");
  const k = kindOf(kind);
  const now = new Date().toISOString();
  if (k === "monday") {
    const d = parse(mondayInput, input);
    const accountName = await probeMonday(d.apiKey, deps);
    patchSettings(actor.accountId, (s) => { Object.assign(s.importConnections.monday, { apiKey: seal(d.apiKey), accountName, connectedAt: now, connectedBy: actor.isSystem ? null : actor.id }); });
    recordAudit(actor, "import.connection_linked", { provider: "monday", accountName });
  }
  return adminView(actor);
}

/** Check the credentials in use (linked or .env). */
export async function testConnection(actor: Actor, kind: string, deps: ConnectDeps = {}): Promise<{ ok: true; label: string; source: CredentialSource }> {
  assertCan(actor, "account:manage");
  const k = kindOf(kind);
  if (k !== "monday") throw new ValidationError(`Unknown connection: ${k}`);
  const c = mondayCredentials(actor.accountId);
  if (!c) throw new ValidationError("monday is niet gekoppeld");
  return { ok: true, label: await probeMonday(c.apiKey, deps), source: c.source };
}

/** Forget the linked credentials (the .env fallback, if any, stays in effect) and stop the schedule. */
export function disconnect(actor: Actor, kind: string): ConnectionsView {
  assertCan(actor, "account:manage");
  const k = kindOf(kind);
  patchSettings(actor.accountId, (s) => {
    const c = s.importConnections[k];
    Object.assign(c, { apiKey: null, accountName: null, connectedAt: null, connectedBy: null });
  });
  if (!mondayCredentials(actor.accountId)) patchSettings(actor.accountId, (s) => { s.importConnections[k].schedule.enabled = false; });
  recordAudit(actor, "import.connection_unlinked", { provider: k });
  return adminView(actor);
}

/* ------------------------------------------------------------------ schedule */

const scheduleInput = z.object({
  enabled: z.boolean().optional(),
  frequency: z.enum(["hourly", "daily", "weekly"]).optional(),
  hour: z.number().int().min(0).max(23).optional(),
  weekday: z.number().int().min(1).max(7).optional(),
  /** monday: workspace ids ("main" = main workspace), empty = all */
  workspaces: z.array(z.string().trim().regex(/^(\d+|main)$/)).max(100).optional(),
});

export function updateSchedule(actor: Actor, kind: string, input: unknown): ConnectionsView {
  assertCan(actor, "account:manage");
  const k = kindOf(kind);
  const d = parse(scheduleInput, input);
  if (d.enabled && !mondayCredentials(actor.accountId)) throw new ValidationError("Koppel eerst monday voordat je een planning aanzet");
  patchSettings(actor.accountId, (s) => {
    const c = s.importConnections[k];
    const sc = c.schedule;
    const turnedOn = d.enabled === true && !sc.enabled;
    const timing = d.frequency !== undefined || d.hour !== undefined || d.weekday !== undefined;
    if (d.enabled !== undefined) sc.enabled = d.enabled;
    if (d.frequency) sc.frequency = d.frequency;
    if (d.hour !== undefined) sc.hour = d.hour;
    if (d.weekday !== undefined) sc.weekday = d.weekday;
    // a new rhythm counts from now, not from a run long ago
    if (turnedOn || (timing && sc.enabled)) { sc.enabledAt = new Date().toISOString(); sc.lastRunAt = null; }
    if (d.workspaces) s.importConnections.monday.schedule.workspaces = [...new Set(d.workspaces)];
  });
  const sc = getSettings(actor.accountId).importConnections[k].schedule;
  recordAudit(actor, "import.schedule_changed", { provider: k, enabled: sc.enabled, frequency: sc.frequency, hour: sc.hour, weekday: sc.weekday });
  return adminView(actor);
}

/* ------------------------------------------------------------------ runs */

export interface RunDeps { startMonday?: typeof startImportJob }

/** Start a full (apply) run of the schedule's scope now. Returns the job (it runs in the background). */
export async function runNow(actor: Actor, kind: string, deps: RunDeps = {}, now = new Date()): Promise<ImportJob> {
  assertCan(actor, "account:manage");
  const k = kindOf(kind);
  const sc = getSettings(actor.accountId).importConnections;
  if (!mondayCredentials(actor.accountId)) throw new ValidationError("monday is niet gekoppeld");
  const job = (deps.startMonday ?? startImportJob)(actor, { apply: true, workspaces: sc.monday.schedule.workspaces, includeUpdates: true, downloadFiles: true });
  patchSettings(actor.accountId, (s) => { Object.assign(s.importConnections[k].schedule, { lastRunAt: now.toISOString(), lastJobId: job.id }); });
  recordAudit(actor, "import.sync_started", { provider: k, jobId: job.id, scheduled: !!actor.isSystem });
  return job;
}

/** One scheduler pass: start every schedule whose slot has passed. Returns the started jobs (tests, logs). */
export async function tickImportSchedules(now = new Date(), deps: RunDeps = {}): Promise<{ accountId: string; kind: ConnectionKind; jobId: string }[]> {
  const started: { accountId: string; kind: ConnectionKind; jobId: string }[] = [];
  for (const a of db.select({ id: accounts.id }).from(accounts).orderBy(asc(accounts.id)).all()) {
    const st = getSettings(a.id);
    for (const k of CONNECTION_KINDS) {
      const sc = st.importConnections[k].schedule;
      const due = nextRunAt(sc, st.general.timeZone);
      if (!due || due > now) continue;
      try {
        const job = await runNow(systemActor(a.id, "import"), k, deps, now);
        started.push({ accountId: a.id, kind: k, jobId: job.id });
      } catch (e) {
        if (e instanceof ConflictError) continue; // a manual run is busy: try again next minute
        // not linked any more, monday unreachable, ...: count it as this slot's run so we do not retry every minute
        patchSettings(a.id, (s) => { s.importConnections[k].schedule.lastRunAt = now.toISOString(); });
        recordAudit({ accountId: a.id, source: "system", isSystem: true }, "import.sync_failed", { provider: k, error: (e as Error).message.slice(0, 300) });
      }
    }
  }
  return started;
}
