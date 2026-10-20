/**
 * Backfill the sprint history of tasks imported from Jira (read-only towards Jira).
 *
 *   npx tsx scripts/backfill-jira-sprint-history.ts            dry-run: how many history rows would be added (estimate)
 *   npx tsx scripts/backfill-jira-sprint-history.ts --apply    write the rows (idempotent)
 *   options: --account <slug>
 *
 * Uses the Jira connection of the account (Admin > Import), else JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN.
 * In Docker: docker exec weekend npx tsx scripts/backfill-jira-sprint-history.ts --apply
 */
import "./_env";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { accounts, boards } from "../src/db/schema/core";
import { resolveJiraSource } from "../src/server/services/jira-migration";
import { listSprintBoards } from "../src/server/services/sprint-read";
import { getDevSettings } from "../src/server/services/dev-config";
import { systemActor } from "../src/lib/actor";
import { backfillJiraSprintHistory } from "../src/server/services/migration/jira-sprint-history";

const { values: a } = parseArgs({ options: { apply: { type: "boolean", default: false }, account: { type: "string" } } });

async function main() {
  const account = a.account ? db.select().from(accounts).where(eq(accounts.slug, a.account)).get() : db.select().from(accounts).get();
  if (!account) throw new Error("No account");
  const source = resolveJiraSource(account.id);
  for (const sb of listSprintBoards(systemActor(account.id))) {
    const settings = getDevSettings(db.select().from(boards).where(eq(boards.id, sb.id)).get()!);
    if (!settings?.tasksBoardId) continue;
    console.log(`${a.apply ? "APPLY" : "DRY-RUN"} sprint history for "${sb.name}" (${sb.id})`);
    const r = await backfillJiraSprintHistory(source, { tasksBoardId: settings.tasksBoardId, sprintsBoardId: sb.id, apply: !!a.apply, log: (m) => console.log(`  ${m}`) });
    console.log(`  projects: ${r.projects.join(", ")}\n  issues matched: ${r.issues}\n  tasks with history ${a.apply ? "added" : "to add"}: ${r.tasks}\n  history rows: ${r.rows}`);
    if (r.unmatchedSprints.length) console.log(`  Jira sprints without a team sprint: ${r.unmatchedSprints.join(", ")}`);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
