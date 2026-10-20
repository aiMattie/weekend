import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";
import { createBoard, dragTo, group, openTestBoard, order, row, subRow } from "./grid-helpers";

test.setTimeout(600_000);

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await login(page, "admin");
});

const subNames = (page: import("@playwright/test").Page, parent: string) =>
  row(page, parent).locator("xpath=following-sibling::div[1]").locator('[data-testid="subitem-row"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.itemName));

test.describe("subitems", () => {
  test("adds subitems in the sub-table, shows own columns and reorders them by drag", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const b = await createBoard(page.context().request, { groups: [{ title: "Eerste", items: ["Ouder", "Ander"] }] });
    await openTestBoard(page, b.boardId);
    // first subitem through the panel-less flow: expand toggle appears after the first subitem exists
    const api = page.context().request;
    await api.post("/api/v1/items", { data: { boardId: b.boardId, parentItemId: b.items.Ouder, name: "Sub 1" } });
    await page.reload();
    await row(page, "Ouder").getByTestId("expand-subitems").click();
    const table = page.getByTestId("subitem-table");
    await expect(table).toBeVisible();
    await expect(table).toContainText("Status");
    await table.getByTestId("add-subitem").click();
    await page.getByTestId("add-subitem-input").fill("Sub 2");
    await page.getByTestId("add-subitem-input").press("Enter");
    await page.getByTestId("add-subitem-input").fill("Sub 3");
    await page.getByTestId("add-subitem-input").press("Enter");
    await page.getByTestId("add-subitem-input").press("Escape");
    await expect(subRow(page, "Sub 3")).toBeVisible();
    expect(await subNames(page, "Ouder")).toEqual(["Sub 1", "Sub 2", "Sub 3"]);
    // status of a subitem uses the subitem columns
    await subRow(page, "Sub 1").getByTestId("cell-status").click();
    await page.getByTestId("status-option").filter({ hasText: "Done" }).first().click();
    await expect(subRow(page, "Sub 1").getByTestId("cell-status")).toContainText("Done");
    // drag Sub 1 below Sub 3
    await subRow(page, "Sub 1").hover();
    await dragTo(page, subRow(page, "Sub 1").getByTestId("subitem-drag-handle"), subRow(page, "Sub 3"), "bottom");
    await expect.poll(() => subNames(page, "Ouder")).toEqual(["Sub 2", "Sub 3", "Sub 1"]);
    await page.reload();
    await row(page, "Ouder").getByTestId("expand-subitems").click();
    expect(await subNames(page, "Ouder")).toEqual(["Sub 2", "Sub 3", "Sub 1"]);
    expect(errors).toEqual([]);
  });

  test("converts a subitem to an item and an item to a subitem (and undoes it)", async ({ page }) => {
    const b = await createBoard(page.context().request, { groups: [{ title: "Eerste", items: ["Ouder", "Los"] }] });
    await page.context().request.post("/api/v1/items", { data: { boardId: b.boardId, parentItemId: b.items.Ouder, name: "Kind" } });
    await openTestBoard(page, b.boardId);
    await row(page, "Ouder").getByTestId("expand-subitems").click();
    // subitem -> item
    await subRow(page, "Kind").hover();
    await subRow(page, "Kind").getByTestId("subitem-menu").click();
    await page.getByTestId("row-convert-item").click();
    await expect(row(page, "Kind")).toBeVisible();
    await expect(subRow(page, "Kind")).toHaveCount(0);
    expect(await order(page, "Eerste")).toContain("Kind");
    // item -> subitem of "Los"
    await row(page, "Kind").hover();
    await row(page, "Kind").getByTestId("row-menu").click();
    await page.getByTestId("row-convert-subitem").click();
    await page.getByTestId("parent-picker-item").filter({ hasText: "Los" }).click();
    await expect(row(page, "Kind")).toHaveCount(0);
    await row(page, "Los").getByTestId("expand-subitems").click();
    await expect(subRow(page, "Kind")).toBeVisible();
    // undo brings it back as an item
    await page.keyboard.press("Control+z");
    await expect(row(page, "Kind")).toBeVisible();
    await page.reload();
    await expect(row(page, "Kind")).toBeVisible();
    expect(await group(page, "Eerste").locator('[data-testid="item-row"]').count()).toBe(3);
  });

  test("bulk bar converts a single selected item to a subitem", async ({ page }) => {
    const b = await createBoard(page.context().request, { groups: [{ title: "Eerste", items: ["Ouder", "Los"] }] });
    await openTestBoard(page, b.boardId);
    await row(page, "Los").getByTestId("row-checkbox").click();
    await page.getByTestId("bulk-convert").click();
    await page.getByTestId("parent-picker-item").filter({ hasText: "Ouder" }).click();
    await expect(row(page, "Los")).toHaveCount(0);
    await expect(row(page, "Ouder").getByTestId("expand-subitems")).toBeVisible();
  });
});
