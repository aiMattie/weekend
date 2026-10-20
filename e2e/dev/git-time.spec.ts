import { collectConsoleErrors, login, resetDb, test } from "../fixtures";
import { expect, createDev, createTask, sign, warm } from "./helpers";

test.describe("git integration and time entries", () => {
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("settings create a webhook secret; a GitHub push links a commit to the task", async ({ page, request }) => {
    test.setTimeout(240_000);
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    const ids = await createDev(page.request);
    await warm(page.request, ids);
    const task = await createTask(page.request, ids, "Login bouwen", { schatting: 3, jira_key: "LMS-123" });

    await page.goto("/dev/git");
    await expect(page.getByTestId("git-settings")).toBeVisible();
    await page.getByTestId("git-create-github").click();
    const secret = (await page.getByTestId("git-secret").textContent())!.trim();
    expect(secret).toHaveLength(48);
    await expect(page.getByTestId("git-integration")).toHaveCount(1);
    await expect(page.getByTestId("git-integration")).not.toContainText(secret);

    const payload = JSON.stringify({
      ref: "refs/heads/feature/LMS-123-login", repository: { full_name: "example/lms", html_url: "https://github.com/example/lms" },
      commits: [{ id: "abc1234def5678", message: "LMS-123 add login form", url: "https://github.com/example/lms/commit/abc1234def5678", author: { name: "Builder" } }],
    });
    // the webhook is public (no session): use the cookie-less request fixture
    const bad = await request.post("/api/integrations/github", { data: payload, headers: { "content-type": "application/json", "x-github-event": "push", "x-hub-signature-256": "sha256=00" } });
    expect(bad.status()).toBe(401);
    const ok = await request.post("/api/integrations/github", { data: payload, headers: { "content-type": "application/json", "x-github-event": "push", "x-hub-signature-256": sign(secret, payload) } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).linked).toBeGreaterThanOrEqual(2);

    await page.goto(`/boards/${ids.boards.taken}?item=${task}`);
    await expect(page.getByTestId("item-panel")).toBeVisible();
    await page.getByTestId("tab-git").click();
    await expect(page.getByTestId("git-tab")).toBeVisible();
    await expect(page.locator("[data-testid=git-link][data-kind=commit]")).toContainText("LMS-123 add login form");
    await expect(page.locator("[data-testid=git-link][data-kind=branch]")).toContainText("feature/LMS-123-login");
    expect(errors).toEqual([]);
  });

  test("hours are written on the task in the Uren tab", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    const ids = await createDev(page.request);
    const task = await createTask(page.request, ids, "Werk met uren", { schatting: 3 });
    await page.goto(`/boards/${ids.boards.taken}?item=${task}`);
    await page.getByTestId("tab-time").click();
    await expect(page.getByTestId("time-tab")).toBeVisible();
    await expect(page.getByTestId("time-total")).toContainText("0:00");
    await page.getByTestId("time-hours").fill("1,5");
    await page.getByTestId("time-description").fill("Formulier bouwen");
    await page.getByTestId("time-add").click();
    await expect(page.getByTestId("time-entry")).toHaveCount(1);
    await expect(page.getByTestId("time-total")).toContainText("1:30");
    await page.getByTestId("time-hours").fill("0:45".replace(":", "."));
    await page.getByTestId("time-add").click();
    await expect(page.getByTestId("time-entry")).toHaveCount(2);
    await page.getByTestId("time-delete").first().click();
    await expect(page.getByTestId("time-entry")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});
