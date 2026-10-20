import { collectConsoleErrors, login, resetDb, test } from "../fixtures";
import { expect, viewTab, createDev, warm } from "./helpers";

test.describe("dev demo workspace", () => {
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("hub, planning, active sprint, dashboard, roadmap, bugs and retro render without errors", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    const ids = await createDev(page.request, true);
    await warm(page.request, ids);

    await page.goto("/dev");
    await expect(page.getByTestId("hub-card")).toHaveCount(1);
    await expect(page.getByTestId("hub-card")).toContainText("Sprint 21");

    await page.goto(`/boards/${ids.boards.sprints}`);
    await expect(page.getByTestId("planning-view")).toBeVisible();
    await expect(page.getByTestId("sprint-section")).toHaveCount(2); // active + planned (completed is hidden in planning)
    await page.screenshot({ path: "/tmp/pw-dev-shots/dev-planning.png" });

    await viewTab(page, "dev_sprint_board").click();
    await expect(page.getByTestId("sprint-board-view")).toBeVisible();
    await expect(page.getByTestId("sprint-lane").first()).toBeVisible();
    await page.screenshot({ path: "/tmp/pw-dev-shots/dev-sprintboard.png" });

    await viewTab(page, "dev_dashboard").click();
    await expect(page.getByTestId("dashboard-view")).toBeVisible();
    await expect(page.locator("[data-testid=chart-burndown] svg").first()).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: "/tmp/pw-dev-shots/dev-dashboard.png", fullPage: true });

    await page.goto(`/boards/${ids.boards.epics}`);
    await expect(page.getByTestId("roadmap-view")).toBeVisible();
    await expect(page.getByTestId("epic-row")).toHaveCount(3);
    await page.screenshot({ path: "/tmp/pw-dev-shots/dev-roadmap.png" });

    await page.goto(`/boards/${ids.boards.bugs}`);
    await expect(page.getByTestId("bugs-view")).toBeVisible();
    await page.screenshot({ path: "/tmp/pw-dev-shots/dev-bugs.png" });

    await page.goto(`/boards/${ids.boards.retrospectives}`);
    await expect(page.getByTestId("retro-view")).toBeVisible();
    await expect(page.getByTestId("retro-card").first()).toBeVisible();
    await page.screenshot({ path: "/tmp/pw-dev-shots/dev-retro.png" });

    expect(errors).toEqual([]);
  });
});
