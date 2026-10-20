import { collectConsoleErrors, expect as baseExpect, login, newUserPage, openBoard, resetDb, test } from "../fixtures";
import type { Page } from "@playwright/test";

/** Saved views: draft state, "Save as new view" (personal / shared), "Save to this view", discard, reload. */

const rowNames = (page: Page) => page.locator('[data-testid="item-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-item-name")));
const expectRows = async (page: Page, names: string[]) => { await expect.poll(async () => (await rowNames(page)).slice().sort()).toEqual(names.slice().sort()); };
const tab = (page: Page, name: string) => page.locator(`[data-testid="view-tab"][data-view-name="${name}"]`);

async function nameFilter(page: Page, text: string) {
  await page.getByTestId("toolbar-filter").click();
  await page.getByTestId("filter-add").click();
  const rule = page.getByTestId("filter-rule").nth(0);
  await rule.getByTestId("filter-column").selectOption({ label: "Name" });
  await rule.getByTestId("filter-op").selectOption({ label: "bevat" });
  await rule.getByTestId("filter-operand").fill(text);
  await page.keyboard.press("Escape");
}

async function saveAsNew(page: Page, name: string, opts: { shared?: boolean } = {}) {
  await page.getByTestId("save-as-new-view").click();
  const input = page.getByTestId("view-name-input").locator("input").first().or(page.locator('input[data-testid="view-name-input"]'));
  await input.fill(name);
  if (opts.shared) await page.getByTestId("view-personal-toggle").uncheck();
  await input.press("Enter");
}

const expect = baseExpect.configure({ timeout: 40_000 }); // slow dev servers when many agents share the host
test.describe.configure({ timeout: 420_000 }); // dev servers are slow when many agents share the host

test.describe("saved views", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetDb(request);
    await login(page, "admin");
  });

  test("filter changes are a draft until saved; discard restores the saved view", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await openBoard(page, "Klanten");
    await expect(page.getByTestId("saved-view-bar")).toHaveCount(0);
    await nameFilter(page, "bra");
    await expectRows(page, ["Bravo"]);
    await expect(page.getByTestId("saved-view-bar")).toBeVisible();
    await page.getByTestId("discard-view-changes").click();
    await expect(page.getByTestId("saved-view-bar")).toHaveCount(0);
    await expect(page.locator('[data-testid="item-row"]')).toHaveCount(6);
    expect(errors).toEqual([]);
  });

  test("an unsaved draft survives a reload (session) but is not saved for others", async ({ page }) => {
    await openBoard(page, "Klanten");
    await nameFilter(page, "bra");
    await expect(page.getByTestId("saved-view-bar")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("board-page")).toBeVisible();
    await expectRows(page, ["Bravo"]);
    await expect(page.getByTestId("saved-view-bar")).toBeVisible();
    await page.getByTestId("discard-view-changes").click();
    await page.reload();
    await expect(page.locator('[data-testid="item-row"]')).toHaveCount(6);
  });

  test("save as a personal view, reload, and keep the main view untouched", async ({ page, browser, baseURL }) => {
    await openBoard(page, "Klanten");
    await nameFilter(page, "bra");
    await saveAsNew(page, "Alleen Bravo");
    await expect(tab(page, "Alleen Bravo")).toBeVisible();
    await expect(tab(page, "Alleen Bravo")).toHaveAttribute("data-view-personal", "true");
    await expect(page.getByTestId("saved-view-bar")).toHaveCount(0);
    await expectRows(page, ["Bravo"]);
    // the main view is untouched
    await page.locator('[data-testid="view-tab"]').first().click();
    await expect(page.locator('[data-testid="item-row"]')).toHaveCount(6);
    await expect(page.getByTestId("saved-view-bar")).toHaveCount(0);
    // reload on the new view applies the saved filter
    await tab(page, "Alleen Bravo").click();
    await page.reload();
    await expect(page.getByTestId("board-page")).toBeVisible();
    await expectRows(page, ["Bravo"]);
    await expect(page.getByTestId("toolbar-filter-count")).toHaveText("1");
    await expect(page.getByTestId("saved-view-bar")).toHaveCount(0);
    // somebody else does not see a personal view
    const other = await newUserPage(browser, baseURL, "pm1");
    await other.page.goto(page.url().split("?")[0]);
    await expect(other.page.getByTestId("board-page")).toBeVisible();
    await expect(tab(other.page, "Alleen Bravo")).toHaveCount(0);
    await other.context.close();
  });

  test("save as a shared view that another user sees", async ({ page, browser, baseURL }) => {
    await openBoard(page, "Klanten");
    await nameFilter(page, "char");
    await saveAsNew(page, "Gedeelde view", { shared: true });
    await expect(tab(page, "Gedeelde view")).toBeVisible();
    await expect(tab(page, "Gedeelde view")).not.toHaveAttribute("data-view-personal", "true");
    const other = await newUserPage(browser, baseURL, "pm1");
    await other.page.goto(page.url().split("?")[0]);
    await expect(tab(other.page, "Gedeelde view")).toBeVisible();
    await tab(other.page, "Gedeelde view").click();
    await expectRows(other.page, ["Charlie"]);
    await expect(other.page.getByTestId("saved-view-bar")).toHaveCount(0);
    await other.context.close();
  });

  test("save to this view persists sort and group by", async ({ page }) => {
    await openBoard(page, "Klanten");
    await nameFilter(page, "e");
    await saveAsNew(page, "Mijn sortering");
    await expect(tab(page, "Mijn sortering")).toBeVisible();
    await page.getByTestId("toolbar-groupby").click();
    await page.getByTestId("groupby-status").click();
    await expect(page.getByTestId("saved-view-bar")).toBeVisible();
    await page.getByTestId("save-to-view").click();
    await expect(page.getByTestId("saved-view-bar")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("board-page")).toBeVisible();
    await expect(page.getByTestId("toolbar-groupby-count")).toHaveText("1");
    await expect(page.getByTestId("group-title").first()).toContainText("Working on it");
    await expect(page.getByTestId("saved-view-bar")).toHaveCount(0);
  });

  test("hidden columns are saved with the view", async ({ page }) => {
    await openBoard(page, "Klanten");
    await page.getByTestId("toolbar-hide").click();
    await page.getByTestId("hide-col-uurtarief_dev").uncheck();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("saved-view-bar")).toBeVisible();
    await saveAsNew(page, "Zonder tarief");
    await expect(tab(page, "Zonder tarief")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("col-header-uurtarief_dev")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("board-page")).toBeVisible();
    await expect(page.getByTestId("col-header-uurtarief_dev")).toHaveCount(0);
    await expect(page.getByTestId("col-header-uurtarief_pm").first()).toBeVisible();
  });
});
