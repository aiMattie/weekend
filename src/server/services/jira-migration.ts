/**
 * Jira Cloud -> clone migration (plan section 7). Read-only towards Jira, idempotent on the Jira key
 * (external_refs), dry-run by default. Phases: A read everything (async), B write (one transaction),
 * C attachments + CSV archive, D verification report.
 *
 *   all open issues of the active projects + issues done in the last 90 days
 *   project -> Klant, Epic -> Epics board (linked to a fase), Story/Task/Bug -> Taak (Type), Sub-task -> subitem,
 *   Sprint -> sprint, statuses/priorities mapped, comments -> updates, attachments -> Files, key -> Jira key,
 *   worklogs of the invoicing period -> Urenregistratie (per klant+fase+person+month), all worklogs -> CSV
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ValidationError } from "../../lib/errors";
import { assertCan } from "../../lib/permissions";
import { db } from "../../db/client";
import { assets } from "../../db/schema/core";
import { importJobs } from "../../db/schema/import-jobs";
import { filesDir } from "./assets";
import { assertNoRunningJob } from "./import";
import { jiraCredentials } from "./migration/credentials";
import { JiraClient } from "./migration/jira-client";
import { migrateHours, writeArchive, type HoursReport } from "./migration/jira-hours";
import { fetchJiraSnapshot, type JiraSnapshot } from "./migration/jira-snapshot";
import { resolveTargets, userMapper } from "./migration/jira-targets";
import { seedChecklistItems } from "./migration/template-delivery";
import { verifyJira, type VerifyReport } from "./migration/jira-verify";
import { migrateProject, migrateSprints, type JiraEnv } from "./migration/jira-write";
import type { JiraSource } from "./migration/jira-types";
import { Tracker } from "./migration/refs";
import { parse } from "./_shared";

export { jiraEnvPresent, JiraClient } from "./migration/jira-client";
export type { JiraSource } from "./migration/jira-types";

export const jiraOptionsSchema = z.object({
  apply: z.boolean().default(false),
  /** Jira project keys; empty = every project active in the last 60 days */
  projects: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]+$/)).default([]),
  /** only issues updated on/after this date (YYYY-MM-DD) */
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  doneDays: z.number().int().min(0).max(3650).default(90),
  /** invoicing period, YYYY-MM (default: the current month) */
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  sample: z.number().int().min(0).max(100).default(10),
  nonBillableProjects: z.array(z.string()).default([]),
  userMap: z.record(z.string(), z.string()).default({}),
  archiveDir: z.string().optional(),
  downloadAttachments: z.boolean().default(true),
  /** monday dev team sprints: one sprint per period of `weeks` starting at `anchor`; absent = one sprint per Jira sprint */
  sprintCadence: z.object({ anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), weeks: z.number().int().min(1).max(8) }).optional(),
  /** deterministic sample for tests */
  seed: z.number().optional(),
});
export type JiraOptions = z.input<typeof jiraOptionsSchema>;

export interface JiraReport {
  mode: "dry_run" | "apply";
  projects: { key: string; name: string; issues: number; epics: number; tasks: number; subtasks: number }[];
  counts: Record<string, { create: number; update: number; skip: number }>;
  distribution: JiraEnv["dist"];
  sprints: { total: number; assigned: number; byState: Record<string, number> };
  hours: HoursReport | null;
  files: { downloaded: number; failed: number; pending: number };
  unmappedUsers: string[];
  warnings: string[];
  diff: string[];
  verification: VerifyReport | null;
  requests: number;
  durationMs: number;
}

/** Live Jira source: the account's linked connection, else JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN. Refuses to run without either. */
export function resolveJiraSource(accountId?: string): JiraSource {
  const c = jiraCredentials(accountId);
  if (!c) throw new ValidationError("Jira is not linked (Admin > Import) and JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN are not all set: the live Jira migration refuses to run (use the fixtures in scripts/fixtures/jira for a rehearsal)");
  return new JiraClient({ baseUrl: c.baseUrl, email: c.email, apiToken: c.apiToken });
}

const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "file";

async function downloadAttachments(source: JiraSource, env: JiraEnv): Promise<JiraReport["files"]> {
  const out = { downloaded: 0, failed: 0, pending: env.pendingFiles.length };
  for (const p of env.pendingFiles) {
    try {
      const bytes = await source.download(p.attachment.content);
      const rel = `${p.assetId}-${safeName(p.attachment.filename)}`;
      mkdirSync(filesDir(), { recursive: true });
      writeFileSync(path.join(filesDir(), rel), bytes);
      db.update(assets).set({ path: rel, size: bytes.byteLength }).where(eq(assets.id, p.assetId)).run();
      out.downloaded++;
    } catch (e) {
      out.failed++;
      env.tracker.warn(`attachment ${p.attachment.filename}: download failed (${(e as Error).message}); metadata kept`);
    }
  }
  return out;
}

export async function runJiraMigration(actor: Actor, input: JiraOptions = {}, deps: { source?: JiraSource; snapshot?: JiraSnapshot; now?: Date; log?: (m: string) => void } = {}): Promise<JiraReport> {
  assertCan(actor, "account:manage");
  const o = parse(jiraOptionsSchema, input);
  const started = Date.now();
  const source = deps.source ?? (deps.snapshot ? null : resolveJiraSource(actor.accountId));
  const snap = deps.snapshot ?? await fetchJiraSnapshot(source!, { projects: o.projects, since: o.since, doneDays: o.doneDays, now: deps.now, log: deps.log });
  const tracker = new Tracker("jira", o.apply);
  const targets = resolveTargets(actor, o.apply);
  if (targets.placeholder) tracker.warn("Templates Delivery/Development are missing: dry-run uses placeholders. Run `tsx scripts/db-seed.ts --templates` (or the apply run creates them).");
  const users = userMapper(actor.accountId, o.userMap);
  const today = (deps.now ?? new Date()).toISOString().slice(0, 10);
  const env: JiraEnv = { actor, tracker, targets, users, fields: snap.fields, dist: { status: {}, type: {}, priority: {} }, epicFase: new Map(), klantItem: new Map(), sprintsSeen: new Map(), pendingFiles: [], taskSprint: new Map(), taskSprints: new Map(), cadence: o.sprintCadence ?? null, today };

  let hours: (HoursReport & { csv: string }) | null = null;
  let sprintInfo = { total: 0, assigned: 0 };
  const run = () => {
    for (const pd of snap.projects) migrateProject(env, pd);
    sprintInfo = migrateSprints(env);
    hours = migrateHours(env, snap, { period: o.period, now: deps.now, nonBillableProjects: o.nonBillableProjects, archiveDir: o.archiveDir });
    // new klanten get their checklist item right away (plan section 12)
    if (o.apply && targets.delivery?.boards.checklist) seedChecklistItems(actor, targets.delivery.boards.klanten, targets.delivery.boards.checklist);
  };
  if (o.apply) db.transaction(run); else run();
  for (const [msg, n] of Object.entries(tracker.tally)) tracker.warn(`${n} x ${msg}`);
  for (const [id, name] of users.unmapped) tracker.warn(`Jira user "${name}" (${id}) has no matching clone user: assignments/authors left empty (use --user-map)`);

  let files: JiraReport["files"] = { downloaded: 0, failed: 0, pending: env.pendingFiles.length };
  let verification: VerifyReport | null = null;
  const h = hours as (HoursReport & { csv: string }) | null;
  if (o.apply) {
    if (h) h.archiveFile = writeArchive(h.csv, o.archiveDir, deps.now);
    if (o.downloadAttachments && source && env.pendingFiles.length) files = await downloadAttachments(source, env);
    let seed = o.seed ?? Date.now();
    const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const recount: Record<string, number> = {};
    if (source) for (const pd of snap.projects) recount[pd.project.key] = await source.countIssues({ project: pd.project.key, openOrDoneSince: snap.doneSince, updatedSince: o.since });
    verification = verifyJira(snap, targets, users, snap.fields, { sample: o.sample, rng, recount, cadence: env.cadence, today });
  }
  const states: Record<string, number> = {};
  for (const s of env.sprintsSeen.values()) states[s.state] = (states[s.state] ?? 0) + 1;
  const { csv: _csv, rowsData: _rows, ...hoursReport } = (h ?? {}) as HoursReport & { csv?: string; rowsData?: unknown };
  void _csv; void _rows;
  return {
    mode: o.apply ? "apply" : "dry_run",
    projects: snap.projects.map((p) => ({ key: p.project.key, name: p.project.name, issues: p.issues.length, epics: p.issues.filter((i) => i.fields.issuetype.name.toLowerCase() === "epic").length, tasks: 0, subtasks: p.issues.filter((i) => !!i.fields.issuetype.subtask).length })).map((p) => ({ ...p, tasks: p.issues - p.epics - p.subtasks })),
    counts: tracker.counts, distribution: env.dist, sprints: { ...sprintInfo, byState: states }, hours: h ? (hoursReport as HoursReport) : null, files,
    unmappedUsers: [...users.unmapped.values()], warnings: tracker.warnings, diff: tracker.diff, verification, requests: source instanceof JiraClient ? source.requests : 0, durationMs: Date.now() - started,
  };
}

/* ------------------------------------------------------------------ job history (shared table with the monday import) */

const newJiraJob = (actor: Actor, o: z.output<typeof jiraOptionsSchema>) =>
  db.insert(importJobs).values({ accountId: actor.accountId, kind: "jira", mode: o.apply ? "apply" : "dry_run", options: { ...o, userMap: undefined }, startedBy: actor.isSystem ? null : actor.id }).returning().get();

export async function runJiraJob(actor: Actor, input: JiraOptions = {}, deps: Parameters<typeof runJiraMigration>[2] = {}, existingJobId?: string) {
  assertCan(actor, "account:manage");
  const o = parse(jiraOptionsSchema, input);
  const job = existingJobId ? { id: existingJobId } : newJiraJob(actor, o);
  try {
    const rep = await runJiraMigration(actor, input, deps);
    return db.update(importJobs).set({ status: "done", counts: rep.counts, report: { ...rep, counts: undefined }, finishedAt: new Date().toISOString() }).where(eq(importJobs.id, job.id)).returning().get();
  } catch (e) {
    return db.update(importJobs).set({ status: "failed", error: (e as Error).message.slice(0, 2000), finishedAt: new Date().toISOString() }).where(eq(importJobs.id, job.id)).returning().get();
  }
}

/** Create the job row now and run in the background (Admin > Import "Nu synchroniseren", the import scheduler). */
export function startJiraJob(actor: Actor, input: JiraOptions = {}, deps: Parameters<typeof runJiraMigration>[2] = {}) {
  assertCan(actor, "account:manage");
  const o = parse(jiraOptionsSchema, input);
  assertNoRunningJob(actor.accountId, "jira");
  const job = newJiraJob(actor, o);
  void runJiraJob(actor, input, deps, job.id);
  return job;
}

export function listJiraJobs(actor: Actor, limit = 20) {
  assertCan(actor, "account:manage");
  return db.select().from(importJobs).where(eq(importJobs.accountId, actor.accountId)).orderBy(desc(importJobs.createdAt)).limit(limit).all().filter((j) => j.kind === "jira");
}
