import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";
import { loginApi, boardByName, boardFull, colByKey, createView, getItem, itemByName, setValue } from "./helpers";

// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function uploadFile(request: import("@playwright/test").APIRequestContext, itemId: string, name: string, mimeType: string, buffer: Buffer, columnId?: string) {
  const res = await request.post("/api/v1/assets", { multipart: { file: { name, mimeType, buffer }, itemId, ...(columnId ? { columnId } : {}) } });
  expect(res.ok(), `upload ${name}`).toBeTruthy();
  return res.json();
}

test.describe("views: cards, chart, map, files, form", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetDb(request);
    await login(page, "admin");
    await loginApi(request);
  });

  test("cards: gallery with cover image from the file column and chosen fields", async ({ page, request }) => {
    const errors = collectConsoleErrors(page);
    const { id, full } = await boardByName(request, "Klanten");
    const files = colByKey(full, "files");
    await uploadFile(request, itemByName(full, "Delta").id, "logo.png", "image/png", PNG, files.id);
    const v = await createView(request, id, "cards");
    await page.goto(`/boards/${id}?view=${v.id}`);
    await expect(page.getByTestId("cards-card")).toHaveCount(6);
    const delta = page.locator('[data-testid="cards-card"][data-item-name="Delta"]');
    await expect(delta.getByTestId("card-cover")).toHaveAttribute("data-has-image", "true");
    await expect(delta.locator("img")).toHaveAttribute("src", /\/api\/v1\/assets\//);
    await expect(page.locator('[data-testid="cards-card"][data-item-name="Bravo"]').getByTestId("card-cover")).toHaveAttribute("data-has-image", "false");
    await page.locator('[data-testid="cards-card"][data-item-name="Echo"]').click();
    await expect(page.getByTestId("item-panel")).toBeVisible();
    expect(errors.filter((e) => !/status of 4\d\d/.test(e))).toEqual([]);
  });

  test("chart: bar by status, then pie, line and stacked; legend matches the data", async ({ page, request }) => {
    const errors = collectConsoleErrors(page);
    const { id } = await boardByName(request, "Klanten");
    const v = await createView(request, id, "chart", "chart", { chartType: "bar" });
    await page.goto(`/boards/${id}?view=${v.id}`);
    await expect(page.getByTestId("chart")).toHaveAttribute("data-chart-type", "bar");
    await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
    const row = (label: string) => page.locator(`[data-testid="chart-row"][data-label="${label}"]`);
    await expect(row("Working on it")).toHaveAttribute("data-value", "3");
    await expect(row("Done")).toHaveAttribute("data-value", "2");
    await expect(row("Stuck")).toHaveAttribute("data-value", "1");
    for (const [type, selector] of [["pie", ".recharts-pie-sector"], ["line", ".recharts-line"], ["stacked", ".recharts-bar-rectangle"]] as const) {
      await page.getByTestId("view-settings-button").click();
      await page.getByTestId("setting-input-chartType").selectOption(type);
      if (type === "stacked") await page.getByTestId("setting-input-stackColumnId").selectOption({ label: "Contractvorm(en)" });
      await page.getByRole("button", { name: "Opslaan" }).click();
      await expect(page.getByTestId("chart")).toHaveAttribute("data-chart-type", type);
      await expect(page.locator(selector).first()).toBeVisible();
    }
    // sum of the hourly rate per status
    await page.getByTestId("view-settings-button").click();
    await page.getByTestId("setting-input-chartType").selectOption("bar");
    await page.getByTestId("setting-input-stackColumnId").selectOption("");
    await page.getByTestId("setting-input-metric").selectOption("sum");
    await page.getByTestId("setting-input-yColumnId").selectOption({ label: "Uurtarief dev" });
    await page.getByRole("button", { name: "Opslaan" }).click();
    await expect(row("Done")).toHaveAttribute("data-value", "98"); // Charlie 98 + Echo (no rate)
    expect(errors).toEqual([]);
  });

  test("map: markers for items with a location, colored by status", async ({ page, request }) => {
    const { id, full } = await boardByName(request, "Klanten");
    const created = await request.post(`/api/v1/boards/${id}/columns`, { data: { title: "Locatie", type: "location" } });
    expect(created.ok()).toBeTruthy();
    const withLoc = await boardFull(request, id);
    void full;
    const loc = colByKey(withLoc, "location");
    await setValue(request, itemByName(withLoc, "Delta").id, loc.id, { lat: 52.0907, lng: 5.1214, address: "Utrecht" });
    await setValue(request, itemByName(withLoc, "Bravo").id, loc.id, { lat: 51.4416, lng: 5.4697, address: "Eindhoven" });
    const v = await createView(request, id, "map");
    await page.goto(`/boards/${id}?view=${v.id}`);
    await expect(page.getByTestId("map-canvas")).toBeVisible();
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.getByTestId("map-marker")).toHaveCount(2);
    await expect(page.getByTestId("map-count")).toContainText("2");
    // Bravo is "Stuck" -> red; Delta "Working on it" -> orange
    const color = (name: string) => page.locator(`[data-testid="map-marker"][data-item-name="${name}"]`).evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(await color("Bravo")).toBe("rgb(223, 47, 74)");
    expect(await color("Delta")).toBe("rgb(253, 171, 61)");
    await page.locator('[data-testid="map-marker"][data-item-name="Delta"]').click();
    await page.getByTestId("map-popup-open").click();
    await expect(page.getByTestId("item-panel")).toBeVisible();
  });

  test("files gallery lists every file on the board and filters by type and name", async ({ page, request }) => {
    const { id, full } = await boardByName(request, "Klanten");
    const delta = itemByName(full, "Delta"); const echo = itemByName(full, "Echo");
    await uploadFile(request, delta.id, "logo.png", "image/png", PNG, colByKey(full, "files").id);
    await uploadFile(request, echo.id, "contract.pdf", "application/pdf", Buffer.from("%PDF-1.4 test"));
    const v = await createView(request, id, "files");
    await page.goto(`/boards/${id}?view=${v.id}`);
    await expect(page.getByTestId("file-tile")).toHaveCount(2);
    await page.getByTestId("files-kind-images").click();
    await expect(page.getByTestId("file-tile")).toHaveCount(1);
    await expect(page.getByTestId("file-tile")).toHaveAttribute("data-file-name", "logo.png");
    await page.getByTestId("files-kind-documents").click();
    await expect(page.getByTestId("file-tile")).toHaveAttribute("data-file-name", "contract.pdf");
    await page.getByTestId("files-kind-all").click();
    await page.getByTestId("files-search").fill("logo");
    await expect(page.getByTestId("file-tile")).toHaveCount(1);
    await page.getByTestId("files-search").fill("zzz");
    await expect(page.getByTestId("files-empty")).toBeVisible();
    await page.getByTestId("files-search").fill("");
    await page.locator('[data-file-name="contract.pdf"]').getByTestId("file-item-link").click();
    await expect(page.getByTestId("item-panel")).toBeVisible();
  });

  test("form view: validates required fields and creates an item with the entered values", async ({ page, request }) => {
    const { id, full } = await boardByName(request, "Klanten");
    const v = await createView(request, id, "form");
    await page.goto(`/boards/${id}?view=${v.id}`);
    await expect(page.getByTestId("form-body")).toBeVisible();
    // make "Status" required through the editor
    await page.getByTestId("form-edit-toggle").click();
    await page.getByTestId("form-edit-required-status").check();
    await page.getByTestId("form-edit-title").fill("Nieuwe klant aanmelden");
    await page.getByTestId("form-edit-title").blur();
    await page.getByTestId("form-edit-toggle").click();
    await expect(page.getByTestId("form-title")).toHaveText("Nieuwe klant aanmelden");

    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("form-body")).toContainText("Dit veld is verplicht");
    await page.getByTestId("form-input-name").fill("Example BV");
    await page.getByTestId("form-input-uurtarief_dev").fill("101");
    await page.getByTestId("form-input-status").selectOption({ label: "Stuck" });
    await page.getByTestId("form-input-contractvorm-SLA").click();
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("form-success")).toContainText("Example BV");
    const created = (await (await request.get(`/api/v1/boards/${id}/full`)).json()).items.find((i: { name: string }) => i.name === "Example BV");
    expect(created).toBeTruthy();
    const item = await getItem(request, id, created.id);
    expect(item.values[colByKey(full, "uurtarief_dev").id]).toBe(101);
    const stuckId = (colByKey(full, "status").settings.labels as { id: number; text: string }[]).find((l) => l.text === "Stuck")!.id;
    expect(item.values[colByKey(full, "status").id]).toEqual({ index: stuckId });
    expect(item.values[colByKey(full, "contractvorm").id]).toEqual({ ids: [4] });
    await expect(page.getByTestId("form-workforms-link")).toBeVisible();
  });
});
