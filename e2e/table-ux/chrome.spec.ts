import { collectConsoleErrors, expect, login, newUserPage, openBoard, resetDb, test } from "../fixtures";

const SHOTS = "docs/design/tableux";

// a Fast Refresh caused by other agents editing files can interrupt a test once in a while
test.describe.configure({ retries: 1 });

test.describe("board header and settings", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("inline edit of title and description, favorite toggle", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    await openBoard(page, "Klanten");
    // title
    await page.getByTestId("board-title-text").click();
    const input = page.getByTestId("board-title-text-input");
    await input.fill("Klanten nieuw");
    await input.press("Enter");
    await expect(page.getByTestId("board-title")).toContainText("Klanten nieuw");
    await expect(page.getByTestId("sidebar-tree").getByText("Klanten nieuw", { exact: true })).toBeVisible();
    // Escape cancels
    await page.getByTestId("board-title-text").click();
    await page.getByTestId("board-title-text-input").fill("Niet opslaan");
    await page.getByTestId("board-title-text-input").press("Escape");
    await expect(page.getByTestId("board-title")).toContainText("Klanten nieuw");
    // description
    await page.getByTestId("board-description").click();
    await page.getByTestId("board-description-input").fill("Een nieuwe beschrijving");
    await page.getByTestId("board-description-input").press("Enter");
    await expect(page.getByTestId("board-description")).toHaveText("Een nieuwe beschrijving");
    // long description gets a show more toggle
    const long = "Lange beschrijving. ".repeat(20);
    await page.getByTestId("board-description").click();
    await page.getByTestId("board-description-input").fill(long);
    await page.getByTestId("board-description-input").press("Enter");
    await expect(page.getByTestId("description-toggle")).toHaveText("Meer tonen");
    await page.getByTestId("description-toggle").click();
    await expect(page.getByTestId("description-toggle")).toHaveText("Minder tonen");
    // favorite
    await expect(page.getByTestId("favorite-toggle")).toHaveAttribute("aria-pressed", "false");
    await page.getByTestId("favorite-toggle").click();
    await expect(page.getByTestId("favorite-toggle")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("favorites-list")).toContainText("Klanten nieuw");
    await page.reload();
    await expect(page.getByTestId("favorite-toggle")).toHaveAttribute("aria-pressed", "true");
    expect(errors).toEqual([]);
  });

  test("board info panel shows description, owner, location and counts", async ({ page }) => {
    await login(page, "admin");
    await openBoard(page, "Klanten");
    await page.getByTestId("board-info-button").click();
    const panel = page.getByTestId("board-info-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("info-name")).toHaveText("Klanten");
    await expect(panel.getByTestId("info-description")).toContainText("Alle klanten");
    await expect(panel.getByTestId("info-location")).toContainText("Delivery");
    await expect(panel.getByTestId("info-counts")).toContainText("Items");
    await expect(panel.getByTestId("info-counts").locator("div").first()).not.toHaveText("-");
    await page.screenshot({ path: `${SHOTS}/tableux-chrome-info.png` });
    await panel.getByTestId("info-close").click();
    await expect(panel).toBeHidden();
  });

  test("settings dialog: rename, visibility, add a member and change its role", async ({ page, browser, baseURL }) => {
    await login(page, "admin");
    const id = await openBoard(page, "Klanten");
    await page.getByTestId("board-menu").click();
    await page.getByTestId("menu-settings").click();
    await expect(page.getByTestId("board-settings-dialog")).toBeVisible();
    await page.getByTestId("settings-name").fill("Klanten (instellingen)");
    await page.getByTestId("settings-description").fill("Via instellingen");
    await page.getByTestId("settings-tab-permissions").click();
    await page.getByTestId("settings-visibility-private").check();
    await page.screenshot({ path: `${SHOTS}/tableux-chrome-settings.png` });
    await page.getByTestId("settings-save").click();
    await expect(page.getByTestId("board-settings-dialog")).toBeHidden();
    await expect(page.getByTestId("board-title")).toContainText("Klanten (instellingen)");
    await expect(page.getByTestId("board-visibility-badge")).toBeVisible();

    // pm1 cannot see the private board yet
    const other = await newUserPage(browser, baseURL, "pm1");
    await other.page.goto(`/boards/${id}`);
    await expect(other.page.getByTestId("board-not-found")).toBeVisible();

    // add pm1 as viewer through the share button
    await page.getByTestId("board-share").click();
    await expect(page.getByTestId("members-tab")).toBeVisible();
    await page.getByTestId("member-search").fill("pm1");
    await page.locator('[data-testid^="add-member-"]').first().click();
    const row = page.getByTestId("member-row").filter({ hasText: /pm1/i });
    await expect(row).toHaveCount(1);
    await row.locator("select").selectOption("viewer");
    await expect(row.locator("select")).toHaveValue("viewer");
    await page.getByTestId("dialog-cancel").click();

    await other.page.goto(`/boards/${id}`);
    await expect(other.page.getByTestId("board-page")).toBeVisible();
    await other.context.close();
  });

  test("board menu: copy link, export xlsx and csv, delete with confirm dialog", async ({ page }) => {
    await login(page, "admin");
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
    await openBoard(page, "Klanten");
    await page.getByTestId("board-menu").click();
    await page.getByTestId("menu-copy-link").click();
    await expect(page.getByTestId("header-flash")).toBeVisible();
    for (const [testId, ext] of [["menu-export-xlsx", "xlsx"], ["menu-export-csv", "csv"]] as const) {
      await page.getByTestId("board-menu").click();
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId(testId).click()]);
      expect(download.suggestedFilename()).toBe(`Klanten.${ext}`);
    }
    await page.getByTestId("board-menu").click();
    await page.getByTestId("board-delete").click();
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await page.getByTestId("dialog-cancel").click();
    await expect(page.getByTestId("confirm-dialog")).toBeHidden();
    await expect(page.getByTestId("board-title")).toContainText("Klanten");
  });
});
