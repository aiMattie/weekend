import { expect, SLOW, test } from "./helpers";
import {collectConsoleErrors, login, openBoard, resetDb } from "../fixtures";

/** Delivery demo boards: Klanten <-> Projecten & Fases, plus a mirror with a sum. */
test.describe.configure({ timeout: SLOW });
test.describe("connect boards and mirror", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetDb(request);
    await login(page, "admin");
  });

  test("Klanten <-> Projecten & Fases is two-way and a mirror sums the hours", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await openBoard(page, "Klanten");
    const row = (name: string) => page.locator(`[data-testid="item-row"][data-item-name="${name}"]`);

    // 1. connect the existing (unconnected) column to the other board and pair it with "Klant"
    const header = page.getByTestId("col-header-projecten_fases").first();
    await header.hover();
    await header.getByTestId("column-menu").click();
    await page.getByTestId("column-settings-open").click();
    await page.getByTestId("relation-board-Projecten & Fases").check();
    await page.getByTestId("relation-pairing").selectOption({ label: 'Koppel aan bestaande kolom "Klant"' });
    await page.getByRole("button", { name: "Opslaan" }).click();
    await expect(page.getByTestId("column-settings")).toHaveCount(0);

    // 2. link Delta to two phases through the item picker
    await row("Delta").getByTestId("cell-projecten_fases").click();
    await expect(page.getByTestId("item-picker")).toBeVisible();
    await page.getByTestId("item-picker-search").fill("Delta");
    await page.locator('[data-testid="item-picker-option"][data-item-name="Delta - Fase 1: MVP"]').click();
    await page.getByTestId("item-picker-search").fill("LMS");
    await page.locator('[data-testid="item-picker-option"][data-item-name="LMS - Doorontwikkeling"]').click();
    await page.keyboard.press("Escape");
    await expect(row("Delta").getByTestId("cell-projecten_fases").getByTestId("relation-chip")).toHaveCount(2);

    // 3. mirror "Uren begroot dev" with a sum
    await page.getByTestId("add-column").first().click();
    await page.getByTestId("add-column-mirror").click();
    await page.getByTestId("column-title-input").fill("Uren dev");
    await page.getByTestId("mirror-relation").selectOption({ label: "Projecten & fases" });
    await page.getByTestId("mirror-target").selectOption({ label: "Uren begroot dev" });
    await page.getByTestId("mirror-aggregate").selectOption("sum");
    await page.getByRole("button", { name: "Kolom maken" }).click();
    await expect(row("Delta").getByTestId("cell-mirror").getByTestId("mirror-cell")).toHaveText("520u");
    await expect(page.getByTestId("summary-mirror").first()).toContainText("520u");

    // 4. the other side got the link too (two-way)
    await openBoard(page, "Projecten & Fases");
    await expect(row("Delta - Fase 1: MVP").getByTestId("cell-klant").getByTestId("relation-chip")).toHaveText("Delta");
    await expect(row("LMS - Doorontwikkeling").getByTestId("cell-klant").getByTestId("relation-chip")).toHaveText("Delta");
    await expect(row("Echo - Oplevering").getByTestId("cell-klant").getByTestId("relation-chip")).toHaveCount(0);

    // 5. link from the other side: Echo -> Echo (customer) and see it on Klanten, mirror updates
    await row("Echo - Oplevering").getByTestId("cell-klant").click();
    await page.getByTestId("item-picker-search").fill("Echo");
    await page.locator('[data-testid="item-picker-option"][data-item-name="Echo"]').click();
    await page.keyboard.press("Escape");
    await openBoard(page, "Klanten");
    await expect(row("Echo").getByTestId("cell-projecten_fases").getByTestId("relation-chip")).toHaveText("Echo - Oplevering");
    await expect(row("Echo").getByTestId("cell-mirror").getByTestId("mirror-cell")).toHaveText("120u");

    // 6. persisted
    await page.reload();
    await expect(row("Delta").getByTestId("cell-mirror").getByTestId("mirror-cell")).toHaveText("520u");
    // clicking a chip opens the linked item
    await row("Delta").getByTestId("relation-chip").first().click();
    await expect(page).toHaveURL(/\/boards\/\d+\?item=\d+/);
    expect(errors).toEqual([]);
  });

  test("limit to one item", async ({ page }) => {
    await openBoard(page, "Projecten & Fases");
    const header = page.getByTestId("col-header-klant").first();
    await header.hover();
    await header.getByTestId("column-menu").click();
    await page.getByTestId("column-settings-open").click();
    await page.getByTestId("relation-board-Klanten").check();
    await page.getByTestId("relation-limit-one").check();
    await page.getByRole("button", { name: "Opslaan" }).click();
    const cell = page.locator('[data-testid="item-row"][data-item-name="Delta - Fase 1: MVP"]').getByTestId("cell-klant");
    await cell.click();
    await page.locator('[data-testid="item-picker-option"][data-item-name="Delta"]').click();
    await expect(cell.getByTestId("relation-chip")).toHaveText("Delta");
    await cell.click();
    await page.locator('[data-testid="item-picker-option"][data-item-name="Bravo"]').click();
    await page.keyboard.press("Escape");
    await expect(cell.getByTestId("relation-chip")).toHaveText("Bravo");
  });
});
