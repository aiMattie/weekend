/**
 * Admin > Import: link the source accounts (monday API key, Jira site + API token) and schedule recurring
 * imports. Secrets are sealed in accounts.settings.importConnections and never leave the server; the
 * importers pick them up through migration/credentials.ts (linked connection first, .env second).
 *
 * Scheduled runs always write (apply) and are full runs: both importers are idempotent (external_refs), and a
 * partial Jira run would recompute the hour totals of the period from a subset of the worklogs.
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
import { startJiraJob } from "./jira-migration";
import { jiraCredentials, mondayCredentials, type CredentialSource } from "./migration/credentials";
import { JiraClient } from "./migration/jira-client";
import { MondayClient } from "./migration/monday-client";
import { parse } from "./_shared";

export type ConnectionKind = "monday" | "jira";
export const CONNECTION_KINDS: ConnectionKind[] = ["monday", "jira"];

export interface ScheduleView {
  enabled: boolean; frequency: ImportSchedule["frequency"]; hour: number; weekday: number;
  workspaces?: string[]; projects?: string[]; doneDays?: number;
  /** Jira: team sprint rhythm (monday dev), null = one sprint per Jira sprint */
  sprintCadence?: { anchor: string; weeks: number } | null;
  lastRunAt: string | null; nextRunAt: string | null;
  lastJob: { id: string; status: ImportJob["status"]; mode: ImportJob["mode"]; createdAt: string; finishedAt: string | null; error: string | null } | null;
}
export interface ConnectionView {
  kind: ConnectionKind;
  linked: boolean;
  /** app = linked here (Admin > Import), env = server .env fallback */
  source: CredentialSource | null;
  /** monday account name / Jira user */
  label: string | null;
  baseUrl: string | null; email: string | null;
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
  const { monday, jira } = st.importConnections;
  const mc = mondayCredentials(actor.accountId);
  const jc = jiraCredentials(actor.accountId);
  return {
    timeZone: tz,
    connections: [
      {
        kind: "monday", linked: !!mc, source: mc?.source ?? null, label: mc?.source === "app" ? monday.accountName : null,
        baseUrl: null, email: null, connectedAt: mc?.source === "app" ? monday.connectedAt : null,
        schedule: scheduleView(actor.accountId, monday.schedule, tz, { workspaces: monday.schedule.workspaces }),
      },
      {
        kind: "jira", linked: !!jc, source: jc?.source ?? null, label: jc?.source === "app" ? jira.displayName : null,
        baseUrl: jc?.baseUrl ?? null, email: jc?.email ?? null, connectedAt: jc?.source === "app" ? jira.connectedAt : null,
        schedule: scheduleView(actor.accountId, jira.schedule, tz, { projects: jira.schedule.projects, doneDays: jira.schedule.doneDays, sprintCadence: jira.schedule.sprintCadence }),
      },
    ],
  };
}

/* ------------------------------------------------------------------ connect / test / disconnect */

export interface ConnectDeps { mondayClient?: (apiKey: string) => MondayClient; jiraClient?: (c: { baseUrl: string; email: string; apiToken: string }) => JiraClient }

const mondayInput = z.object({ apiKey: z.string().trim().min(20).max(2000) });
const jiraInput = z.object({
  baseUrl: z.string().trim().min(3).max(200),
  email: z.string().trim().email().max(200),
  apiToken: z.string().trim().min(10).max(2000),
});

/** "nina-ai.atlassian.net" or "https://nina-ai.atlassian.net/jira/..." -> "https://nina-ai.atlassian.net" */
export function normalizeJiraUrl(input: string): string {
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`); } catch { throw new ValidationError("Ongeldige Jira-URL"); }
  if (u.protocol !== "https:" || !u.hostname.endsWith(".atlassian.net")) throw new ValidationError("Gebruik de Jira Cloud-URL van je site, bijvoorbeeld https://jouwbedrijf.atlassian.net");
  return u.origin;
}

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

async function probeJira(c: { baseUrl: string; email: string; apiToken: string }, deps: ConnectDeps): Promise<string> {
  const client = deps.jiraClient?.(c) ?? new JiraClient(c);
  try {
    const me = await client.myself();
    return me.displayName;
  } catch (e) {
    throw new ValidationError(`Jira weigert de inloggegevens (${(e as Error).message.slice(0, 200)})`);
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
  } else {
    const d = parse(jiraInput, input);
    const c = { baseUrl: normalizeJiraUrl(d.baseUrl), email: d.email, apiToken: d.apiToken };
    const displayName = await probeJira(c, deps);
    patchSettings(actor.accountId, (s) => { Object.assign(s.importConnections.jira, { baseUrl: c.baseUrl, email: c.email, apiToken: seal(c.apiToken), displayName, connectedAt: now, connectedBy: actor.isSystem ? null : actor.id }); });
    recordAudit(actor, "import.connection_linked", { provider: "jira", baseUrl: c.baseUrl, email: c.email });
  }
  return adminView(actor);
}

/** Check the credentials in use (linked or .env). */
export async function testConnection(actor: Actor, kind: string, deps: ConnectDeps = {}): Promise<{ ok: true; label: string; source: CredentialSource }> {
  assertCan(actor, "account:manage");
  const k = kindOf(kind);
  if (k === "monday") {
    const c = mondayCredentials(actor.accountId);
    if (!c) throw new ValidationError("monday is niet gekoppeld");
    return { ok: true, label: await probeMonday(c.apiKey, deps), source: c.source };
  }
  const c = jiraCredentials(actor.accountId);
  if (!c) throw new ValidationError("Jira is niet gekoppeld");
  return { ok: true, label: await probeJira(c, deps), source: c.source };
}

/** Forget the linked credentials (the .env fallback, if any, stays in effect) and stop the schedule. */
export function disconnect(actor: Actor, kind: string): ConnectionsView {
  assertCan(actor, "account:manage");
  const k = kindOf(kind);
  patchSettings(actor.accountId, (s) => {
    const c = s.importConnections[k];
    if (k === "monday") Object.assign(c, { apiKey: null, accountName: null });
    else Object.assign(c, { baseUrl: null, email: null, apiToken: null, displayName: null });
    Object.assign(c, { connectedAt: null, connectedBy: null });
  });
  if (!(k === "monday" ? mondayCredentials(actor.accountId) : jiraCredentials(actor.accountId))) patchSettings(actor.accountId, (s) => { s.importConnections[k].schedule.enabled = false; });
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
  /** Jira: project keys, empty = every project that has issues */
  projects: z.array(z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]+$/)).max(200).optional(),
  doneDays: z.number().int().min(0).max(3650).optional(),
  /** Jira: one team sprint per `weeks` from `anchor` (a sprint start date); null = one sprint per Jira sprint */
  sprintCadence: z.object({ anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), weeks: z.number().int().min(1).max(8) }).nullable().optional(),
});

export function updateSchedule(actor: Actor, kind: string, input: unknown): ConnectionsView {
  assertCan(actor, "account:manage");
  const k = kindOf(kind);
  const d = parse(scheduleInput, input);
  const linked = k === "monday" ? mondayCredentials(actor.accountId) : jiraCredentials(actor.accountId);
  if (d.enabled && !linked) throw new ValidationError(`Koppel eerst ${k === "monday" ? "monday" : "Jira"} voordat je een planning aanzet`);
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
    if (k === "monday" && d.workspaces) s.importConnections.monday.schedule.workspaces = [...new Set(d.workspaces)];
    if (k === "jira" && d.projects) s.importConnections.jira.schedule.projects = [...new Set(d.projects.map((p) => p.toUpperCase()))];
    if (k === "jira" && d.doneDays !== undefined) s.importConnections.jira.schedule.doneDays = d.doneDays;
    if (k === "jira" && d.sprintCadence !== undefined) s.importConnections.jira.schedule.sprintCadence = d.sprintCadence;
  });
  const sc = getSettings(actor.accountId).importConnections[k].schedule;
  recordAudit(actor, "import.schedule_changed", { provider: k, enabled: sc.enabled, frequency: sc.frequency, hour: sc.hour, weekday: sc.weekday });
  return adminView(actor);
}

/* ------------------------------------------------------------------ runs */

export interface RunDeps { jiraClient?: (c: { baseUrl: string; email: string; apiToken: string }) => Pick<JiraClient, "projects">; startMonday?: typeof startImportJob; startJira?: typeof startJiraJob }

/** Jira projects in scope of a scheduled run: the chosen keys, else every non-archived project that has issues. */
export async function jiraProjectsInScope(accountId: string, deps: RunDeps = {}): Promise<string[]> {
  const sc = getSettings(accountId).importConnections.jira.schedule;
  if (sc.projects.length) return sc.projects;
  const c = jiraCredentials(accountId);
  if (!c) throw new ValidationError("Jira is niet gekoppeld");
  const client = deps.jiraClient?.(c) ?? new JiraClient(c);
  const all = await client.projects();
  return all.filter((p) => !p.archived && (p.insight?.totalIssueCount ?? 1) > 0).map((p) => p.key);
}

/** Start a full (apply) run of the schedule's scope now. Returns the job (it runs in the background). */
export async function runNow(actor: Actor, kind: string, deps: RunDeps = {}, now = new Date()): Promise<ImportJob> {
  assertCan(actor, "account:manage");
  const k = kindOf(kind);
  const sc = getSettings(actor.accountId).importConnections;
  let job: ImportJob;
  if (k === "monday") {
    if (!mondayCredentials(actor.accountId)) throw new ValidationError("monday is niet gekoppeld");
    job = (deps.startMonday ?? startImportJob)(actor, { apply: true, workspaces: sc.monday.schedule.workspaces, includeUpdates: true, downloadFiles: true });
  } else {
    if (!jiraCredentials(actor.accountId)) throw new ValidationError("Jira is niet gekoppeld");
    const projects = await jiraProjectsInScope(actor.accountId, deps);
    if (!projects.length) throw new ValidationError("Geen Jira-projecten met issues gevonden");
    job = (deps.startJira ?? startJiraJob)(actor, { apply: true, projects, doneDays: sc.jira.schedule.doneDays, sprintCadence: sc.jira.schedule.sprintCadence ?? undefined });
  }
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
        // not linked any more, Jira unreachable, ...: count it as this slot's run so we do not retry every minute
        patchSettings(a.id, (s) => { s.importConnections[k].schedule.lastRunAt = now.toISOString(); });
        recordAudit({ accountId: a.id, source: "system", isSystem: true }, "import.sync_failed", { provider: k, error: (e as Error).message.slice(0, 300) });
      }
    }
  }
  return started;
}
