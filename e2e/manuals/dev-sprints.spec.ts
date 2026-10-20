import path from "node:path";
import { collectConsoleErrors, login, resetDb, test } from "../fixtures";
import { createDev, createTask, expect, sign, viewTab, warm } from "../dev/helpers";

/** Screenshots for docs/handleiding/08-dev-sprints.md (npm run manuals). */
const IMG = path.join(process.cwd(), "docs/handleiding/img");
const shot = (page: import("@playwright/test").Page, name: string) => page.screenshot({ path: path.join(IMG, `dev-${name}.png`) });

test.skip(!process.env.RUN_MANUALS, "manual screenshots only run with RUN_MANUALS=1");

test("handleiding dev: screenshots", async ({ page, request }) => {
  test.setTimeout(600_000);
  const errors = collectConsoleErrors(page);
  await resetDb(request);
  await login(page, "admin");
  const ids = await createDev(page.request, true);
  await warm(page.request, ids);

  await page.goto("/dev");
  await expect(page.getByTestId("hub-card")).toBeVisible();
  await shot(page, "hub");

  await page.goto(`/boards/${ids.boards.sprints}`);
  await expect(page.getByTestId("planning-view")).toBeVisible();
  await expect(page.getByTestId("dev-task").first()).toBeVisible();
  await shot(page, "planning");

  await viewTab(page, "dev_sprint_board").click();
  await expect(page.getByTestId("sprint-card").first()).toBeVisible();
  await shot(page, "actieve-sprint");

  await viewTab(page, "dev_planning").click();
  await page.locator("[data-testid=sprint-section][data-sprint-state=active] [data-testid=complete-sprint]").click();
  await expect(page.getByTestId("complete-sprint-dialog")).toBeVisible();
  await shot(page, "complete-sprint");
  await page.keyboard.press("Escape");

  await viewTab(page, "dev_dashboard").click();
  await expect(page.locator("[data-testid=chart-burndown] .recharts-line-curve").first()).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "dashboard");

  await page.goto(`/boards/${ids.boards.epics}`);
  await expect(page.getByTestId("epic-row").first()).toBeVisible();
  await shot(page, "roadmap");
  await page.goto(`/boards/${ids.boards.bugs}`);
  await expect(page.getByTestId("bug-row").first()).toBeVisible();
  await shot(page, "bugs");
  await page.goto(`/boards/${ids.boards.retrospectives}`);
  await expect(page.getByTestId("retro-card").first()).toBeVisible();
  await shot(page, "retro");

  await page.goto("/dev/git");
  await page.getByTestId("git-create-github").click();
  const secret = (await page.getByTestId("git-secret").textContent())!.trim();
  await shot(page, "git-instellingen");
  const task = await createTask(page.request, ids, "Login bouwen", { schatting: 3, jira_key: "LMS-123" });
  const payload = JSON.stringify({ ref: "refs/heads/feature/LMS-123-login", repository: { full_name: "example/lms", html_url: "https://github.com/example/lms" }, commits: [{ id: "abc1234def5678", message: "LMS-123 add login form", url: "https://github.com/example/lms/commit/abc1234def5678", author: { name: "Builder" } }] });
  const res = await request.post("/api/integrations/github", { data: payload, headers: { "content-type": "application/json", "x-github-event": "push", "x-hub-signature-256": sign(secret, payload) } });
  expect(res.ok()).toBeTruthy();
  await page.goto(`/boards/${ids.boards.taken}?item=${task}`);
  await page.getByTestId("tab-git").click();
  await expect(page.getByTestId("git-link").first()).toBeVisible();
  await shot(page, "git-tab");
  expect(errors).toEqual([]);
});
