/**
 * Shared e2e helpers.
 *
 *   import { test, expect, login, resetDb, openBoard } from "../fixtures";
 *   test.beforeEach(async ({ request }) => resetDb(request));
 *   test("...", async ({ page }) => { await login(page, "admin"); await openBoard(page, "Klanten"); ... });
 */
import { test as base, expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";

export type SeedUser = "admin" | "owner" | "pm1" | "pm2" | "dev1" | "dev2" | "develop" | "consultant1" | "consultant2" | "developer3";
export const PASSWORD = process.env.SEED_PASSWORD ?? "Welkom123!";
export const emailOf = (as: SeedUser) => `${as}@example.com`;

/** Wipe + reseed the test database (about 1s). Call in beforeEach (or beforeAll for read-only specs). */
export async function resetDb(request: APIRequestContext): Promise<{ userIds: Record<string, string>; workspaceIds: Record<string, string> }> {
  const res = await request.post("/api/test/reset");
  expect(res.ok(), "reset endpoint (is E2E_RESET=1 set by playwright.config.ts?)").toBeTruthy();
  return res.json();
}

/** Log in through the API so the page's cookie jar is authenticated (fast). Use loginViaUi() to test the form. */
export async function login(pageOrContext: Page | BrowserContext, as: SeedUser = "admin"): Promise<void> {
  const ctx = "context" in pageOrContext && typeof pageOrContext.context === "function" ? pageOrContext.context() : (pageOrContext as BrowserContext);
  const res = await ctx.request.post("/api/auth/login", { data: { email: emailOf(as), password: PASSWORD } });
  expect(res.ok(), `login as ${as}`).toBeTruthy();
}

export async function loginViaUi(page: Page, as: SeedUser = "admin"): Promise<void> {
  await page.goto("/login");
  await expect(page.getByTestId("login-submit")).toBeEnabled(); // enabled = hydrated
  await page.getByTestId("login-email").fill(emailOf(as));
  await page.getByTestId("login-password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("topbar")).toBeVisible();
}

/** A fresh browser context + page, already logged in as `as` (for realtime/two-user tests). */
export async function newUserPage(browser: Browser, baseURL: string | undefined, as: SeedUser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL, locale: "nl-NL", viewport: { width: 1440, height: 900 } });
  await login(context, as);
  const page = await context.newPage();
  return { context, page };
}

/** Open a board by name through the REST API (no sidebar clicking). Returns its id. */
export async function boardIdByName(request: APIRequestContext, name: string): Promise<string> {
  const res = await request.get("/api/v1/boards");
  const boards = (await res.json()) as { id: string; name: string }[];
  const b = boards.find((x) => x.name === name);
  expect(b, `board "${name}" exists`).toBeTruthy();
  return b!.id;
}

export async function openBoard(page: Page, name: string): Promise<string> {
  const id = await boardIdByName(page.context().request, name);
  await page.goto(`/boards/${id}`);
  await expect(page.getByTestId("board-page")).toBeVisible();
  return id;
}

/** Known console noise that is not an app bug (Vibe + Google Fonts when offline). */
const IGNORED_CONSOLE = [/Accessing element\.ref was removed in React 19/, /fonts\.(googleapis|gstatic)\.com/, /favicon/, /Download the React DevTools/, /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|FAILED)/, /Failed to load resource.*(fonts|googleapis|gstatic)/];

/** Collect console errors + uncaught page errors; assert `errors` is empty at the end of the test. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  const keep = (text: string) => !IGNORED_CONSOLE.some((re) => re.test(text));
  page.on("console", (m) => { if (m.type() === "error" && keep(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => { if (keep(e.message)) errors.push(`pageerror: ${e.message}`); });
  return errors;
}

export const test = base;
export { expect };
