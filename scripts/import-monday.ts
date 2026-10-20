/**
 * Import the real monday account into the clone (READ-ONLY towards monday).
 *
 *   npx tsx scripts/import-monday.ts                       dry-run (default): counts + diff summary
 *   npx tsx scripts/import-monday.ts --apply               write to the clone (idempotent, re-runnable)
 *   npx tsx scripts/import-monday.ts --workspace 7059403   only this monday workspace (repeatable, "main" = main workspace)
 *   options: --no-updates --no-files --no-adopt-boards --max-items 50 --account example --verbose --json
 *
 * Needs MONDAY_API_KEY in .env (never printed). DATABASE_URL selects the clone database.
 */
import "./_env";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { systemActor } from "../src/lib/actor";
import { db } from "../src/db/client";
import { accounts } from "../src/db/schema/core";
import { runImportJob } from "../src/server/services/import";

const { values: a } = parseArgs({
  options: {
    apply: { type: "boolean", default: false }, workspace: { type: "string", multiple: true }, account: { type: "string" },
    "no-updates": { type: "boolean", default: false }, "no-files": { type: "boolean", default: false }, "no-adopt-boards": { type: "boolean", default: false },
    "max-items": { type: "string" }, verbose: { type: "boolean", default: false }, json: { type: "boolean", default: false }, help: { type: "boolean", default: false },
  },
});

async function main() {
  if (a.help) { console.log("See the header of scripts/import-monday.ts"); return; }
  const account = a.account ? db.select().from(accounts).where(eq(accounts.slug, a.account)).get() : db.select().from(accounts).get();
  if (!account) throw new Error("No account in the clone database. Run `npm run db:seed` first.");
  const actor = systemActor(account.id, "import");
  console.log(`${a.apply ? "APPLY" : "DRY-RUN"} import into ${process.env.DATABASE_URL || "file:data/app.db"} (monday is only read)`);
  const job = await runImportJob(actor, {
    apply: a.apply, workspaces: a.workspace ?? [], includeUpdates: !a["no-updates"], downloadFiles: !a["no-files"], adoptBoards: !a["no-adopt-boards"],
    maxItemsPerBoard: a["max-items"] ? Number(a["max-items"]) : undefined,
  }, { log: (m) => console.log(`  ${m}`) });
  if (job.status === "failed") { console.error(`FAILED: ${job.error}`); process.exitCode = 1; return; }
  const rep = job.report as { warnings: string[]; diff: string[]; skipped: Record<string, number>; files: unknown; requests: number; durationMs: number };
  if (a.json) { console.log(JSON.stringify({ ...rep, counts: job.counts }, null, 2)); return; }
  console.log("\nentity        create  update  skip");
  for (const [k, c] of Object.entries(job.counts as Record<string, { create: number; update: number; skip: number }>)) console.log(`${k.padEnd(13)} ${String(c.create).padStart(6)} ${String(c.update).padStart(7)} ${String(c.skip).padStart(5)}`);
  console.log(`\nskipped: ${JSON.stringify(rep.skipped)}  files: ${JSON.stringify(rep.files)}  requests: ${rep.requests}  ${Math.round(rep.durationMs / 1000)}s`);
  console.log(`warnings: ${rep.warnings.length}${a.verbose ? "" : " (use --verbose to list)"}`);
  if (a.verbose) { rep.warnings.slice(0, 200).forEach((w) => console.log(`  ! ${w}`)); rep.diff.slice(0, 300).forEach((l) => console.log(`  ${l}`)); }
  console.log(`job ${job.id} saved in import_jobs (also visible at /admin/import)`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
