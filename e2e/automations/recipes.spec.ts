import { expect, login, resetDb, test, collectConsoleErrors } from "./fixtures";
import { createTestBoard, getItem, openCenter, type TestBoard, openLog } from "./helpers";

let tb: TestBoard;
test.beforeEach(async ({ request, page }) => {
  const seed = await resetDb(request);
  await login(page, "admin");
  tb = await createTestBoard(page.request, seed.workspaceIds["Delivery"]);
});

test("create a recipe from the center and see it fire: status Done moves the item to a group", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await openCenter(page, tb.boardId);
  await expect(page.getByTestId("auto-cat-all")).toBeVisible();
  for (const cat of ["notifications", "status_change", "recurring", "due_dates", "item_creation", "dependencies", "integrations"]) await expect(page.getByTestId(`auto-cat-${cat}`)).toBeVisible();
  await page.getByTestId("auto-search").locator("input").fill("verplaats het item naar");
  const card = page.getByTestId("recipe-card-status-move-group");
  await expect(card).toBeVisible();
  await card.getByTestId("token-status-move-group-group").selectOption({ label: "Afgerond" });
  await expect(card.getByTestId("token-status-move-group-label")).toHaveValue(/\d+/);
  await card.getByTestId("recipe-add-status-move-group").click();
  await expect(page.getByTestId("auto-toast")).toBeVisible();
  await page.getByTestId("auto-tab-manage").click();
  await expect(page.locator('[data-testid^="auto-row-"]')).toHaveCount(1);
  await expect(page.locator('[data-testid^="auto-summary-"]')).toContainText("Afgerond");
  await page.getByTestId("automation-center-close").click();

  // change the status in the real table: the automation moves the item
  const row = page.locator(`[data-testid="item-row"][data-item-id="${tb.itemId}"]`);
  await row.getByTestId("cell-status").click();
  await page.getByTestId("status-option").filter({ hasText: "Done" }).click();
  await expect.poll(async () => (await getItem(page.request, tb.itemId)).groupId, { timeout: 15_000 }).toBe(tb.groups.Afgerond);
  // the board shows the item in the new group (realtime)
  await expect(page.getByText("Afgerond").first()).toBeVisible();

  // run log shows the successful run
  await page.getByTestId("automate-button").click();
  await openLog(page);
  await expect(page.getByTestId("run-row").first()).toHaveAttribute("data-status", "success");
  expect(errors, errors.join("\n")).toEqual([]);
});

test("the center offers at least 40 recipes and the search filters them", async ({ page }) => {
  await openCenter(page, tb.boardId);
  await expect(page.locator('[data-testid^="recipe-card-"]').first()).toBeVisible();
  const total = await page.locator('[data-testid^="recipe-card-"]').count();
  expect(total).toBeGreaterThanOrEqual(40);
  await page.getByTestId("auto-search").locator("input").fill("timer");
  await expect.poll(async () => page.locator('[data-testid^="recipe-card-"]').count()).toBeLessThan(total);
  await page.getByTestId("auto-search").locator("input").fill("zzzzzz");
  await expect(page.getByText("Geen recepten gevonden")).toBeVisible();
});
