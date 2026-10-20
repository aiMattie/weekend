/**
 * First-run setup for running Weekend locally (no Docker needed).
 *
 *   npm run setup                         interactive: asks for your name, e-mail and password
 *   npm run setup -- --status             print whether Weekend is set up, the port and the URL
 *   npm run setup -- --name "Ada" --email ada@example.com --password "secret123" [--company "My team"]
 *   options: --port 4123 (default: a random free port, stored in .env), --reset (wipe existing data first),
 *            --if-needed (exit quietly when already set up; used by the start scripts)
 *
 * Creates .env when missing (random SESSION_SECRET, random free PORT, APP_URL), applies the migrations and creates
 * one account with your admin user and an empty workspace. There is no demo data.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";

const { values: a } = parseArgs({
  options: {
    status: { type: "boolean", default: false },
    /** accepted for older instructions; a blank start is the only kind */
    blank: { type: "boolean", default: false },
    name: { type: "string" }, email: { type: "string" }, password: { type: "string" }, company: { type: "string" },
    port: { type: "string" }, reset: { type: "boolean", default: false }, "if-needed": { type: "boolean", default: false },
  },
  strict: true,
});

const ENV = ".env";
const readEnv = (): Record<string, string> => (existsSync(ENV) ? Object.fromEntries(
  readFileSync(ENV, "utf8").split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter((m): m is RegExpMatchArray => !!m).map((m) => [m[1], m[2]]),
) : {});

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer().once("error", () => resolve(false)).once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

async function randomFreePort(): Promise<number> {
  for (let i = 0; i < 50; i++) {
    const p = 3100 + Math.floor(Math.random() * 1900);
    if (await portFree(p)) return p;
  }
  throw new Error("No free port found between 3100 and 4999; pass --port");
}

/** Create or complete .env. Existing values are never overwritten, except PORT/APP_URL with --port. */
async function ensureEnv(): Promise<{ port: number; url: string }> {
  // Docker: settings come from env_file and /app is read-only for the node user, so don't write a .env
  if (!existsSync(ENV) && process.env.SESSION_SECRET && process.env.DATABASE_URL) {
    const port = Number(process.env.PORT || 3000);
    return { port, url: process.env.APP_URL || `http://localhost:${port}` };
  }
  const env = readEnv();
  const want = a.port ? Number(a.port) : env.PORT ? Number(env.PORT) : await randomFreePort();
  if (!Number.isInteger(want) || want < 1024 || want > 65535) throw new Error(`Invalid port: ${a.port}`);
  const add: string[] = [];
  if (!env.SESSION_SECRET) add.push(`SESSION_SECRET=${randomBytes(48).toString("base64url")}`);
  if (!env.DATABASE_URL) add.push("DATABASE_URL=file:data/app.db");
  if (!env.NEXT_TELEMETRY_DISABLED) add.push("NEXT_TELEMETRY_DISABLED=1");
  if (a.port && env.PORT) {
    let text = readFileSync(ENV, "utf8").replace(/^PORT=.*$/m, `PORT=${want}`);
    if (env.APP_URL?.startsWith("http://localhost:")) text = text.replace(/^APP_URL=.*$/m, `APP_URL=http://localhost:${want}`);
    writeFileSync(ENV, text);
  } else if (!env.PORT) add.push(`PORT=${want}`);
  if (!env.APP_URL) add.push(`APP_URL=http://localhost:${want}`);
  if (add.length) {
    const header = existsSync(ENV) ? "\n" : "# Local settings (created by npm run setup). See .env.example for every option.\n";
    if (existsSync(ENV)) appendFileSync(ENV, header + add.join("\n") + "\n");
    else writeFileSync(ENV, header + add.join("\n") + "\n", { mode: 0o600 });
  }
  process.loadEnvFile(ENV);
  const port = Number(readEnv().PORT);
  return { port, url: readEnv().APP_URL || `http://localhost:${port}` };
}

async function accountCount(): Promise<number> {
  const { getSqlite } = await import("../src/db/client");
  return (getSqlite().prepare("SELECT count(*) AS n FROM accounts").get() as { n: number }).n;
}

async function ask(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("\nWeekend is not set up yet. Create your admin account:");
  a.company = (await rl.question("Company / team name [My company]: ")).trim() || "My company";
  a.name = (await rl.question("Your name: ")).trim();
  a.email = (await rl.question("Your e-mail (login): ")).trim();
  a.password = (await rl.question("Password (min. 8 characters): ")).trim();
  rl.close();
}

async function main(): Promise<void> {
  const { port, url } = await ensureEnv();
  const { getDb } = await import("../src/db/client");
  getDb(); // applies pending migrations
  const setUp = (await accountCount()) > 0;

  if (a.status) {
    console.log(`set up: ${setUp ? "yes" : "no"}\nport: ${port}\nurl: ${url}\nstart: npm run local (or ./start.sh, start.command, start.bat)`);
    return;
  }
  if (setUp && !a.reset) {
    if (!a["if-needed"]) console.log(`Weekend is already set up (${url}). Use --reset to wipe all data and start over.`);
    return;
  }
  if (!a.name && !a.email && !a.password) {
    if (!process.stdin.isTTY) {
      console.error("Weekend is not set up. Run: npm run setup -- --name ... --email ... --password ... [--company ...]");
      process.exit(2);
    }
    await ask();
  }
  if (a.reset) (await import("../src/db/reset")).wipeData();

  if (!a.name || !a.email || !/^\S+@\S+\.\S+$/.test(a.email) || !a.password || a.password.length < 8) {
    console.error("Setup needs --name, a valid --email and a --password of at least 8 characters.");
    process.exit(2);
  }
  const { seedBlank } = await import("../src/db/seed-blank");
  await seedBlank({ accountName: a.company || "My company", name: a.name, email: a.email, password: a.password });
  console.log(`\nDone. Log in at ${url} as ${a.email.toLowerCase()} with the password you chose.`);
  console.log("Start Weekend with: npm run local");
}

main().catch((e) => { console.error((e as Error).message); process.exit(1); });
