import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";
import { shot } from "./shots";
import { startMockMonday } from "../../scripts/fixtures/monday/mock-server";

/** /admin/import against a local mock monday server (the apiUrl override only works with E2E_RESET=1). */
test.describe("admin import (mock monday)", () => {
  let mock: Awaited<ReturnType<typeof startMockMonday>>;
  test.beforeAll(async () => { mock = await startMockMonday(); });
  test.afterAll(async () => { await mock.close(); });
  test.describe.configure({ timeout: 240_000 });
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("dry-run shows counts, diff and history without writing", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    const before = await (await page.context().request.get("/api/v1/boards")).json();
    await page.addInitScript((url) => { (window as unknown as { __mondayApiUrl: string }).__mondayApiUrl = url; }, mock.url);
    await page.goto("/admin/import");
    await expect(page.getByTestId("import-page")).toBeVisible();
    await expect(page.getByTestId("import-readonly")).toBeVisible();
    await expect(page.getByTestId("import-history-empty")).toBeVisible();
    await page.getByTestId("import-dry-run").click();
    const report = page.getByTestId("import-report");
    await expect(report).toHaveAttribute("data-status", "done", { timeout: 90_000 });
    await expect(report.locator('tr[data-entity="item"] [data-col="create"]')).toHaveText("7");
    await expect(report.locator('tr[data-entity="board"]')).toBeVisible();
    await expect(page.getByTestId("import-diff")).toContainText("+ item");
    await expect(page.getByTestId("import-warnings")).toContainText("unknown column type");
    await expect(page.getByTestId("import-job")).toHaveCount(1);
    await shot(page, "import-dryrun", { fullPage: true });
    expect(mock.log.queries.length).toBeGreaterThan(5);
    expect(mock.log.queries.every((q) => !/\bmutation\b/i.test(q))).toBe(true);
    const after = await (await page.context().request.get("/api/v1/boards")).json();
    expect(after.length).toBe(before.length); // dry-run wrote nothing
    expect(errors).toEqual([]);
  });

  test("apply imports the mock account and a re-run changes nothing", async ({ page }) => {
    await login(page, "admin");
    await page.addInitScript((url) => { (window as unknown as { __mondayApiUrl: string }).__mondayApiUrl = url; }, mock.url);
    await page.goto("/admin/import");
    page.on("dialog", (d) => void d.accept());
    await page.getByTestId("import-apply").click();
    await expect(page.getByTestId("import-job").first()).toHaveAttribute("data-status", "done", { timeout: 90_000 });
    const boards = await (await page.context().request.get("/api/v1/boards")).json();
    expect(boards.filter((b: { name: string }) => b.name === "Klanten").length).toBeGreaterThanOrEqual(1);
    await page.getByTestId("import-dry-run").click();
    await expect(page.getByTestId("import-job")).toHaveCount(2, { timeout: 90_000 });
    const report = page.getByTestId("import-report");
    await expect(report).toHaveAttribute("data-status", "done", { timeout: 90_000 });
    await expect(report.locator('tr[data-entity="item"] [data-col="create"]')).toHaveText("0");
    await expect(report.locator('tr[data-entity="item"] [data-col="update"]')).toHaveText("0");
    await expect(report.locator('tr[data-entity="item"] [data-col="skip"]')).toHaveText("7");
  });

  test("members have no access", async ({ page }) => {
    await login(page, "dev1");
    await page.goto("/admin/import");
    await expect(page.getByTestId("import-no-access")).toBeVisible();
  });
});
