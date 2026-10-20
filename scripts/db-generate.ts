/**
 * Generate Drizzle migrations per module.
 *
 *   npm run db:generate                       -> every module that has schema changes
 *   npm run db:generate -- core --name add_x  -> only src/db/schema/core.ts
 *   npm run db:generate -- sprints            -> only src/db/schema/sprints.ts
 *
 * Each module has its OWN migrations folder (src/db/migrations/<module>) and its own journal,
 * so two agents generating migrations for different modules never collide.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const schemaDir = path.join(root, "src/db/schema");
const all = readdirSync(schemaDir)
  .filter((f) => f.endsWith(".ts") && f !== "index.ts" && !f.startsWith("_"))
  .map((f) => f.replace(/\.ts$/, ""));

const args = process.argv.slice(2);
const nameIdx = args.indexOf("--name");
const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined;
const modules = args.filter((a, i) => !a.startsWith("--") && i !== nameIdx + 1);
const targets = modules.length ? modules : all;

let failed = false;
for (const m of targets) {
  if (!all.includes(m)) {
    console.error(`Unknown module "${m}". Known: ${all.join(", ")}`);
    process.exit(1);
  }
  const cmd = ["drizzle-kit", "generate", "--dialect", "sqlite", "--schema", `src/db/schema/${m}.ts`, "--out", `src/db/migrations/${m}`];
  if (name) cmd.push("--name", name);
  console.log(`\n== ${m} ==`);
  const r = spawnSync("npx", cmd, { stdio: "inherit", cwd: root });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
