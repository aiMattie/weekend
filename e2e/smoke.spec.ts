import { collectConsoleErrors, expect, test, boardIdByName, login, loginViaUi, newUserPage, resetDb } from "./fixtures";

test.describe("foundation smoke", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("login form, sidebar and board navigation", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId("login-submit")).toBeEnabled(); // enabled = hydrated
    await page.getByTestId("login-email").fill("admin@example.com");
    await page.getByTestId("login-password").fill("fout-wachtwoord");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-error")).toContainText("Onjuiste");
    await loginViaUi(page, "admin");
    await expect(page.getByTestId("home-page")).toBeVisible();
    await page.getByTestId("sidebar").getByText("Klanten", { exact: true }).click();
    await expect(page.getByTestId("board-page")).toBeVisible();
    await expect(page.getByTestId("board-title")).toContainText("Klanten");
    // the deliberate wrong-password attempt logs one 401; anything else is a real error
    expect(errors.filter((e) => !/status of 401/.test(e))).toEqual([]);
  });

  test("create item, change status, and a second user sees it live (SSE)", async ({ page, browser, baseURL }) => {
    await login(page, "admin");
    const boardId = await boardIdByName(page.context().request, "Klanten");
    await page.goto(`/boards/${boardId}`);
    await expect(page.getByTestId("board-page")).toBeVisible();

    const other = await newUserPage(browser, baseURL, "pm1");
    await other.page.goto(`/boards/${boardId}`);
    await expect(other.page.getByTestId("board-page")).toBeVisible();

    // create
    await page.getByTestId("add-item").first().click();
    const input = page.getByTestId("add-item-input").first();
    await input.fill("Smoke test klant");
    await input.press("Enter");
    const row = page.locator('[data-testid="item-row"][data-item-name="Smoke test klant"]');
    await expect(row).toBeVisible();
    await expect(other.page.locator('[data-testid="item-row"][data-item-name="Smoke test klant"]')).toBeVisible();

    // change status to Done
    await row.getByTestId("cell-status").click();
    await page.getByTestId("status-option").filter({ hasText: "Done" }).first().click();
    await expect(row.getByTestId("cell-status")).toContainText("Done");
    const otherRow = other.page.locator('[data-testid="item-row"][data-item-name="Smoke test klant"]');
    await expect(otherRow.getByTestId("cell-status")).toContainText("Done");
    await other.context.close();
  });
});
