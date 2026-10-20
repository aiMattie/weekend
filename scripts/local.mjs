#!/usr/bin/env node
/**
 * Run Weekend locally without Docker (macOS, Windows, Linux). Needs only Node.js 22+.
 *
 *   npm run local                 install (first time), set up (first time), build when needed, start
 *   npm run local -- --rebuild    force a fresh production build
 *   npm run local -- --no-open    do not open the browser
 *
 * The start scripts (start.command, start.bat, start.sh) call this file.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const args = new Set(process.argv.slice(2));
const win = process.platform === "win32";

const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  console.error(`Weekend needs Node.js 22 or newer (you have ${process.versions.node}). Download it from https://nodejs.org`);
  process.exit(1);
}

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", shell: win });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/** Newest modification time below `dir` (skips node_modules and build output). */
function newest(dir) {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".next")) continue;
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}

if (!existsSync("node_modules")) {
  console.log("Installing dependencies (first run, takes a few minutes)...");
  run("npm", ["install", "--no-audit", "--no-fund"]);
}

run("npx", ["tsx", "scripts/setup.ts", "--if-needed"]);

const buildId = path.join(".next", "BUILD_ID");
const sources = Math.max(newest("src"), statSync("package.json").mtimeMs, statSync("next.config.ts").mtimeMs);
if (args.has("--rebuild") || !existsSync(buildId) || statSync(buildId).mtimeMs < sources) {
  console.log("Building Weekend (first run or after changes, takes a few minutes)...");
  run("npm", ["run", "build"]);
}

// .env wins over a PORT that happens to be set in the shell: setup picked a free port on purpose
const port = parseEnv(readFileSync(".env", "utf8")).PORT || process.env.PORT || "3000";
const url = `http://localhost:${port}`;
console.log(`\nWeekend runs at ${url}  (stop with Ctrl+C)\n`);
const server = spawn("npx", ["next", "start", "-p", port], { stdio: "inherit", shell: win });
server.on("exit", (code) => process.exit(code ?? 0));

if (!args.has("--no-open")) {
  setTimeout(() => {
    const opener = win ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
    spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  }, 2500);
}
