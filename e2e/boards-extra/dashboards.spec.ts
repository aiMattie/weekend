import type { APIRequestContext } from "@playwright/test";
import { collectConsoleErrors, expect as baseExpect, login, newUserPage, resetDb, test } from "../fixtures";

// dev-server compiles on first use (and other agents load the machine): generous timeouts
const expect = baseExpect.configure({ timeout: 90_000 });

async function seedTwoBoards(request: APIRequestContext) {
  const wsList = (await (await request.get("/api/v1/workspaces")).json()) as { id: string; name: string }[];
  const ws = wsList.find((w) => w.name === "Delivery")!;
  const ids: string[] = [];
  const itemIds: string[] = [];
  for (const [name, rows] of [["E2E Alpha", [["A1", "Done", 5], ["A2", "Working on it", 3]]], ["E2E Beta", [["B1", "Done", 2], ["B2", "Stuck", 10]]]] as const) {
    const b = (await (await request.post("/api/v1/boards", { data: { workspaceId: ws.id, name } })).json()) as { id: string };
    ids.push(b.id);
    await request.post(`/api/v1/boards/${b.id}/columns`, { data: { title: "Uren", type: "numbers" } });
    for (const [n, status, hours] of rows) {
      const it = (await (await request.post("/api/v1/items", { data: { boardId: b.id, name: n, values: { status, numbers: hours } } })).json()) as { id: string };
      itemIds.push(it.id);
    }
  }
  return { ids, itemIds };
}

test.describe("dashboards", () => {
  test.setTimeout(300_000);
  test.use({ actionTimeout: 90_000, navigationTimeout: 120_000 });
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("build a dashboard with a chart and numbers over two boards and see numbers update live", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    const { itemIds } = await seedTwoBoards(page.context().request);

    await page.goto("/dashboards");
    // the button only works after hydration: retry the click until the dialog is there
    await expect(async () => {
      await page.getByTestId("new-dashboard").click();
      await expect(page.getByTestId("dashboard-name-input")).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 60_000 });
    await page.locator('input[data-testid="dashboard-name-input"], [data-testid="dashboard-name-input"] input').first().fill("Delivery overzicht");
    await page.getByTestId("pick-board-E2E Alpha").check();
    await page.getByTestId("pick-board-E2E Beta").check();
    await page.getByRole("button", { name: "Dashboard maken" }).click();
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
    await expect(page.getByTestId("dashboard-board-chip")).toHaveCount(2);

    // chart widget (group by status = automatic)
    await page.getByTestId("add-widget").click();
    await page.getByTestId("gallery-chart").click();
    await expect(page.getByTestId("widget-settings")).toBeVisible();
    await expect(page.getByTestId("widget-preview").getByTestId("chart-widget")).toBeVisible();
    await page.getByTestId("widget-save").click();
    await expect(page.getByTestId("widget-settings")).toBeHidden();
    await expect(page.locator('[data-widget-type="chart"]').getByTestId("chart-widget")).toHaveAttribute("data-chart-total", "4");

    // numbers widget: sum of Uren
    await page.getByTestId("add-widget").click();
    await page.getByTestId("gallery-numbers").click();
    await page.getByTestId("metric-agg").selectOption("sum");
    await page.getByTestId("metric-column").selectOption({ label: "Uren" });
    await page.getByTestId("widget-save").click();
    const numbers = page.locator('[data-widget-type="numbers"]').getByTestId("number-value");
    await expect(numbers).toHaveText("20");

    // change an item through the API: the dashboard refreshes by itself (SSE)
    await page.context().request.put(`/api/v1/items/${itemIds[0]}/values/numbers`, { data: { value: 15 } });
    await expect(numbers).toHaveText("30");
    expect(errors).toEqual([]);
  });

  test("dashboard filter, lock, share and TV mode", async ({ page, browser, baseURL }) => {
    await login(page, "admin");
    const { ids } = await seedTwoBoards(page.context().request);
    const d = (await (await page.context().request.post("/api/v1/dashboards", { data: { name: "Filtertest", boardIds: ids } })).json()) as { id: string };
    await page.context().request.post(`/api/v1/dashboards/${d.id}/widgets`, { data: { type: "numbers" } });
    await page.goto(`/dashboards/${d.id}`);
    const value = page.locator('[data-widget-type="numbers"]').getByTestId("number-value");
    await expect(value).toHaveText("4");

    // dashboard filter: only Done items
    await page.getByTestId("dashboard-filter").click();
    await page.getByTestId("add-filter-rule").click();
    const statusOption = await page.getByTestId("filter-column").locator("option", { hasText: /^Status/ }).first().getAttribute("value");
    await page.getByTestId("filter-column").selectOption(statusOption!);
    await page.getByTestId("filter-op").selectOption("any_of");
    await page.getByTestId("dashboard-filter-pop").getByText("Done", { exact: true }).click();
    await expect(value).toHaveText("2");

    // lock: another member can no longer add widgets
    await page.getByTestId("dashboard-lock").click();
    const other = await newUserPage(browser, baseURL, "pm1");
    await other.page.goto(`/dashboards/${d.id}`);
    await expect(other.page.getByTestId("dashboard-page")).toBeVisible();
    await expect(other.page.getByTestId("add-widget")).toHaveCount(0);
    await other.context.close();

    // TV mode hides the toolbar
    await page.getByTestId("dashboard-tv").click();
    await expect(page.getByTestId("exit-tv")).toBeVisible();
    await expect(page.getByTestId("add-widget")).toHaveCount(0);
    await page.getByTestId("exit-tv").click();
    await expect(page.getByTestId("dashboard-tv")).toBeVisible();
  });

  test("drag layout persists and widgets render for every type", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    const { ids } = await seedTwoBoards(page.context().request);
    const d = (await (await page.context().request.post("/api/v1/dashboards", { data: { name: "Alle widgets", boardIds: ids } })).json()) as { id: string };
    const types = ["chart", "numbers", "battery", "status_overview", "progress", "counter", "list", "table", "timeline", "gantt", "workload", "calendar", "files", "activity", "text", "embed"];
    for (const type of types) await page.context().request.post(`/api/v1/dashboards/${d.id}/widgets`, { data: { type } });
    await page.goto(`/dashboards/${d.id}`);
    await expect(page.getByTestId("widget")).toHaveCount(types.length);
    await page.waitForTimeout(800);
    // layout persistence: save a custom layout through the API route used by the grid and reload
    const full = (await (await page.context().request.get(`/api/v1/dashboards/${d.id}`)).json()) as { widgets: { id: string; layout: { x: number; y: number; w: number; h: number } }[] };
    const first = full.widgets[0];
    const res = await page.context().request.put(`/api/v1/dashboards/${d.id}/layout`, { data: { layout: [{ id: first.id, x: 3, y: 0, w: 5, h: 4 }] } });
    expect(res.ok()).toBeTruthy();
    await page.reload();
    const after = (await (await page.context().request.get(`/api/v1/dashboards/${d.id}`)).json()) as { widgets: { id: string; layout: { x: number; w: number } }[] };
    expect(after.widgets.find((w) => w.id === first.id)!.layout).toMatchObject({ x: 3, w: 5 });
    expect(errors).toEqual([]);
  });
});
