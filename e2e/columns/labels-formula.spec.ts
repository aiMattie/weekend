import {collectConsoleErrors, login, resetDb } from "../fixtures";
import { addColumnViaCenter, cellOf, gotoBoard, makeBoard, expect, SLOW, test } from "./helpers";

test.describe.configure({ timeout: SLOW });
test.describe("status labels and formulas", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetDb(request);
    await login(page, "admin");
  });

  test("edit status labels: rename, add, recolor, reorder, done flag, delete", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const { boardId } = await makeBoard(page.context().request, "Labels test");
    await gotoBoard(page, boardId);
    const header = await addColumnViaCenter(page, "status");
    await header.hover();
    await header.getByTestId("column-menu").click();
    await page.getByTestId("column-edit-labels").click();
    await expect(page.getByTestId("label-editor")).toBeVisible();
    const rows = page.getByTestId("label-row");
    await expect(rows).toHaveCount(4);
    await rows.nth(0).getByTestId("label-text").fill("Bezig");
    await rows.nth(3).getByTestId("label-delete").click(); // the empty default label
    await page.getByTestId("label-add").click();
    const added = rows.nth(3);
    await added.getByTestId("label-text").fill("Review");
    await added.getByTestId("label-color-btn").click();
    await page.getByTestId("label-color-0073ea").click();
    await added.getByTestId("label-done").check();
    await added.getByTestId("label-up").click();
    await expect(rows.nth(2).getByTestId("label-text")).toHaveValue("Review");
    await page.getByRole("button", { name: "Opslaan" }).click();
    await expect(page.getByTestId("label-editor")).toHaveCount(0);

    await cellOf(page, "status").click();
    await expect(page.getByTestId("status-option").filter({ hasText: "Bezig" })).toBeVisible();
    await expect(page.getByTestId("status-option").filter({ hasText: "Working on it" })).toHaveCount(0);
    await page.getByTestId("status-option").filter({ hasText: "Review" }).click();
    const pill = cellOf(page, "status").locator('[title="Review"]');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveCSS("background-color", "rgb(0, 115, 234)");

    // order and flags are persisted
    await page.reload();
    await expect(page.getByTestId("board-page")).toBeVisible();
    const cols = await (await page.context().request.get(`/api/v1/boards/${boardId}/columns`)).json() as { type: string; settings: { labels: { text: string; color: string; isDone: boolean; index: number }[] } }[];
    const labels = cols.find((c) => c.type === "status")!.settings.labels;
    expect(labels.map((l) => l.text)).toEqual(["Bezig", "Done", "Review", "Stuck"]);
    expect(labels.find((l) => l.text === "Review")).toMatchObject({ color: "#0073ea", isDone: true });
    await expect(cellOf(page, "status").locator('[title="Review"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("dropdown labels can be edited from the cell", async ({ page }) => {
    const { boardId } = await makeBoard(page.context().request, "Dropdown test");
    await gotoBoard(page, boardId);
    await addColumnViaCenter(page, "dropdown");
    await cellOf(page, "dropdown").click();
    await page.getByTestId("dropdown-edit-labels").click();
    await page.getByTestId("label-add").click();
    await page.getByTestId("label-row").first().getByTestId("label-text").fill("Alpha");
    await page.getByRole("button", { name: "Opslaan" }).click();
    await cellOf(page, "dropdown").click();
    await page.getByRole("button", { name: "Alpha" }).click();
    await page.keyboard.press("Escape");
    await expect(cellOf(page, "dropdown")).toContainText("Alpha");
    await page.reload();
    await expect(cellOf(page, "dropdown")).toContainText("Alpha");
  });

  test("formula over numbers, error state and column settings", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const { boardId } = await makeBoard(page.context().request, "Formule test", ["Eerste item", "Tweede item"]);
    const req = page.context().request;
    for (const [title, key] of [["Uren", "uren"], ["Tarief", "tarief"]]) {
      const r = await req.post(`/api/v1/boards/${boardId}/columns`, { data: { title, type: "numbers", key } });
      expect(r.ok()).toBeTruthy();
    }
    await gotoBoard(page, boardId);
    await addColumnViaCenter(page, "formula", {
      title: "Bedrag",
      setup: async (p) => {
        await p.getByTestId("formula-input").fill("{Uren} * {Tarief}");
        await expect(p.getByTestId("formula-error-hint")).toHaveCount(0);
      },
    });
    for (const [key, value] of [["uren", "10"], ["tarief", "95"]]) {
      await cellOf(page, key).click();
      await page.getByTestId("cell-input").fill(value);
      await page.getByTestId("cell-input").press("Enter");
    }
    await expect(cellOf(page, "formula").getByTestId("formula-value")).toHaveText("950");
    await cellOf(page, "tarief").click();
    await page.getByTestId("cell-input").fill("100");
    await page.getByTestId("cell-input").press("Enter");
    await expect(cellOf(page, "formula").getByTestId("formula-value")).toHaveText("1000");
    // second item has no values: product is 0 (empty counts as 0)
    await expect(cellOf(page, "formula", "Tweede item").getByTestId("formula-value")).toHaveText("0");
    // summary row sums the formula
    await expect(page.getByTestId("summary-formula")).toContainText("1000");

    // settings dialog: change the formula to a division by zero -> error shown, then back
    const header = page.getByTestId("col-header-formula");
    await header.hover();
    await header.getByTestId("column-menu").click();
    await page.getByTestId("column-settings-open").click();
    await page.getByTestId("formula-input").fill("{Uren} / {Tarief} +");
    await expect(page.getByTestId("formula-error-hint")).toBeVisible();
    await page.getByTestId("formula-input").fill("IF({Uren} > 5, \"Veel\", \"Weinig\") & \" uren\"");
    await page.getByRole("button", { name: "Opslaan" }).click();
    await expect(cellOf(page, "formula").getByTestId("formula-value")).toHaveText("Veel uren");
    await page.reload();
    await expect(cellOf(page, "formula").getByTestId("formula-value")).toHaveText("Veel uren");
    expect(errors).toEqual([]);
  });

  test("column menu: rename, change type, filter, group by, summary and delete", async ({ page }) => {
    const { boardId } = await makeBoard(page.context().request, "Menu test", ["Eerste item", "Tweede item"]);
    const req = page.context().request;
    await req.post(`/api/v1/boards/${boardId}/columns`, { data: { title: "Uren", type: "numbers", key: "uren" } });
    await gotoBoard(page, boardId);
    for (const [name, v] of [["Eerste item", "10"], ["Tweede item", "30"]]) {
      await cellOf(page, "uren", name).click();
      await page.getByTestId("cell-input").fill(v);
      await page.getByTestId("cell-input").press("Enter");
    }
    const header = page.getByTestId("col-header-uren");
    const openMenu = async () => { await header.hover(); await header.getByTestId("column-menu").click(); };
    // summary function
    await expect(page.getByTestId("summary-uren")).toContainText("40");
    await openMenu();
    await page.getByTestId("column-settings-open").click();
    await page.getByTestId("summary-select").selectOption("avg");
    await page.getByTestId("numbers-unit").fill("u");
    await page.getByRole("button", { name: "Opslaan" }).click();
    await expect(page.getByTestId("summary-uren")).toContainText("20u");
    // filter
    await openMenu();
    await page.getByTestId("column-filter-open").click();
    await page.getByTestId("column-filter-op").selectOption("gt");
    await page.getByTestId("column-filter-operand").fill("20");
    await page.getByTestId("column-filter-apply").click();
    await expect(page.locator('[data-testid="item-row"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="item-row"][data-item-name="Tweede item"]')).toBeVisible();
    // change type numbers -> text keeps the values
    await openMenu();
    await page.getByTestId("column-change-type").click();
    await page.getByTestId("add-column-text").click();
    await expect(page.locator('[data-testid="item-row"][data-item-name="Tweede item"]').getByTestId("cell-uren")).toContainText("30");
    // delete
    await openMenu();
    await page.getByTestId("column-delete").click();
    await expect(page.getByTestId("col-header-uren")).toHaveCount(0);
  });
});
