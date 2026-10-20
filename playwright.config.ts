import { defineConfig, devices } from "@playwright/test";

/**
 * E2E harness. Every agent runs on its own port:  E2E_PORT=3107 npx playwright test
 *  - 3058 (default): DB data/test.db, dist dir .next-e2e
 *  - other ports:    DB data/test-<port>.db, dist dir .next-e2e-<port>   (never share a DB or .next dir)
 * Tests reset + reseed the DB through POST /api/test/reset (enabled by E2E_RESET=1) via resetDb().
 */
const port = Number(process.env.E2E_PORT ?? 3058);
const suffix = port === 3058 ? "" : `-${port}`;
const dbUrl = process.env.E2E_DATABASE_URL ?? `file:data/test${suffix}.db`;

export default defineConfig({
  testDir: "e2e",
  // keep test output OUT of the watched project tree (rewrites make every Turbopack dev server wait for the fs to settle)
  outputDir: process.env.PW_OUTPUT_DIR ?? `/tmp/pw-results-${port}`,
  testIgnore: process.env.RUN_MANUALS ? [] : ["**/manuals/**"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "nl-NL",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `npx next dev -p ${port}`,
    url: `http://localhost:${port}/login`,
    reuseExistingServer: !!process.env.E2E_REUSE,
    timeout: 180_000,
    stdout: "ignore",
    env: {
      DATABASE_URL: dbUrl,
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? `.next-e2e${suffix}`,
      E2E_RESET: "1",
      SEED_PASSWORD: process.env.SEED_PASSWORD ?? "Welkom123!",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
