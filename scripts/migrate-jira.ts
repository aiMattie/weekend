/**
 * Jira Cloud -> clone migration (plan section 7). READ-ONLY towards Jira.
 *
 *   npx tsx scripts/migrate-jira.ts                    dry-run (default): what would happen
 *   npx tsx scripts/migrate-jira.ts --apply            migrate, then print the verification report
 *   npx tsx scripts/migrate-jira.ts --project LMS --project ZOVEA     only these Jira projects (repeatable)
 *   npx tsx scripts/migrate-jira.ts --since 2026-09-01                only issues updated since
 *   options: --period 2026-10 (invoicing period for hours)  --done-days 90  --sample 10  --archive-dir data/archive
 *            --non-billable KEY (repeatable)  --no-attachments  --fixtures  --verbose  --json
 *            --user-map users.json  ({ "<jira accountId or e-mail>": "<clone e-mail>" })
 *            --sprint-anchor 2026-10-05 --sprint-weeks 4   monday dev team sprints (one per period) instead of one per Jira sprint
 *
 * Live runs need JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN in .env (only their presence is checked,
 * they are never printed). Without them the script refuses to run live; `--fixtures` rehearses the whole
 * flow against the recorded synthetic fixtures in scripts/fixtures/jira.
 */
import "./_env";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { systemActor } from "../src/lib/actor";
import { db } from "../src/db/client";
import { accounts } from "../src/db/schema/core";
import { runJiraJob } from "../src/server/services/jira-migration";
import { jiraCredentials } from "../src/server/services/migration/credentials";

const { values: a } = parseArgs({
  options: {
    apply: { type: "boolean", default: false }, project: { type: "string", multiple: true }, since: { type: "string" }, period: { type: "string" },
    "done-days": { type: "string" }, sample: { type: "string" }, "archive-dir": { type: "string" }, "non-billable": { type: "string", multiple: true },
    "no-attachments": { type: "boolean", default: false }, "user-map": { type: "string" }, fixtures: { type: "boolean", default: false }, account: { type: "string" },
    verbose: { type: "boolean", default: false }, json: { type: "boolean", default: false }, "sprint-anchor": { type: "string" }, "sprint-weeks": { type: "string" },
  },
});

async function main() {
  const live = !a.fixtures;
  const account = a.account ? db.select().from(accounts).where(eq(accounts.slug, a.account)).get() : db.select().from(accounts).get();
  if (live && !jiraCredentials(account?.id)) {
    console.error("Refusing to run live: Jira is not linked (Admin > Import) and JIRA_BASE_URL, JIRA_EMAIL and/or JIRA_API_TOKEN are not set in .env. Use --fixtures to rehearse with the recorded fixtures.");
    process.exit(2);
  }
  if (!account) throw new Error("No account in the clone database. Run `npm run db:seed` first.");
  const actor = systemActor(account.id, "import");
  const source = a.fixtures ? (await import("./fixtures/jira/fixture-source")).fixtureSource() : undefined;
  console.log(`${a.apply ? "APPLY" : "DRY-RUN"} Jira migration ${a.fixtures ? "(fixtures)" : "(live, read-only)"} into ${process.env.DATABASE_URL || "file:data/app.db"}`);
  const job = await runJiraJob(actor, {
    apply: a.apply, projects: a.project ?? [], since: a.since, period: a.period, doneDays: a["done-days"] ? Number(a["done-days"]) : undefined,
    sample: a.sample ? Number(a.sample) : undefined, archiveDir: a["archive-dir"], nonBillableProjects: a["non-billable"] ?? [], userMap: a["user-map"] ? (JSON.parse(readFileSync(a["user-map"], "utf8")) as Record<string, string>) : {}, downloadAttachments: !a["no-attachments"],
    sprintCadence: a["sprint-anchor"] ? { anchor: a["sprint-anchor"], weeks: Number(a["sprint-weeks"] ?? 2) } : undefined,
  }, { source, now: a.fixtures ? new Date("2026-10-06T12:00:00Z") : undefined, log: (m) => console.log(`  ${m}`) });
  if (job.status === "failed") { console.error(`FAILED: ${job.error}`); process.exit(1); }
  const r = job.report as unknown as import("../src/server/services/jira-migration").JiraReport;
  if (a.json) { console.log(JSON.stringify({ ...r, counts: job.counts }, null, 2)); return; }
  console.log("\nproject      issues  epics  tasks  subtasks");
  for (const p of r.projects) console.log(`${p.key.padEnd(12)} ${String(p.issues).padStart(6)} ${String(p.epics).padStart(6)} ${String(p.tasks).padStart(6)} ${String(p.subtasks).padStart(8)}`);
  console.log("\nentity        create  update  skip");
  for (const [k, c] of Object.entries(job.counts as Record<string, { create: number; update: number; skip: number }>)) console.log(`${k.padEnd(13)} ${String(c.create).padStart(6)} ${String(c.update).padStart(7)} ${String(c.skip).padStart(5)}`);
  console.log(`\nstatus: ${JSON.stringify(r.distribution.status)}\ntype: ${JSON.stringify(r.distribution.type)}\npriority: ${JSON.stringify(r.distribution.priority)}`);
  console.log(`sprints: ${JSON.stringify(r.sprints)}`);
  if (r.hours) console.log(`hours ${r.hours.period}: ${r.hours.rows} rows, ${r.hours.totalHours}h (billable ${r.hours.billableHours}, non-billable ${r.hours.nonBillableHours}, meerwerk ${r.hours.meerwerkHours}); ${r.hours.worklogsTotal} raw worklogs${r.hours.archiveFile ? ` archived in ${r.hours.archiveFile}` : " (archive is written on --apply)"}`);
  console.log(`warnings: ${r.warnings.length}${a.verbose ? "" : " (use --verbose)"}`);
  if (a.verbose) { r.warnings.slice(0, 100).forEach((w) => console.log(`  ! ${w}`)); r.diff.slice(0, 200).forEach((l) => console.log(`  ${l}`)); }
  if (r.verification) {
    console.log("\nVERIFICATION (Jira vs clone)");
    for (const p of r.verification.perProject) console.log(`  ${p.ok ? "OK  " : "DIFF"} ${p.key}: Jira ${p.jiraRecount ?? p.jira.total} (${p.jira.epics}e/${p.jira.tasks}t/${p.jira.subtasks}s) clone ${p.clone.total} (${p.clone.epics}e/${p.clone.tasks}t/${p.clone.subtasks}s)`);
    for (const s of r.verification.sample) console.log(`  sample ${s.key}: ${s.ok ? "OK" : s.diffs.join("; ")}`);
    console.log(`  overall: ${r.verification.ok ? "OK" : "DIFFERENCES FOUND"}`);
    if (!r.verification.ok) process.exitCode = 1;
  }
  console.log(`job ${job.id} saved in import_jobs`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
