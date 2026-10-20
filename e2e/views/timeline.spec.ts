import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";
import { loginApi, createView, drag, getItem, seedPlanning, weekDay } from "./helpers";

test.describe("views: timeline", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetDb(request);
    await login(page, "admin");
    await loginApi(request);
  });

  test("bars sit in their group on a time axis with a today line", async ({ page, request }) => {
    const errors = collectConsoleErrors(page);
    const { boardId } = await seedPlanning(request);
    const v = await createView(request, boardId, "timeline");
    await page.goto(`/boards/${boardId}?view=${v.id}`);
    const bar = page.locator('[data-testid="tl-bar"][data-item-name^="Delta"]');
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("data-start", weekDay(0));
    await expect(bar).toHaveAttribute("data-end", weekDay(3));
    await expect(page.getByTestId("tl-today")).toBeAttached();
    await expect(page.getByTestId("tl-group").filter({ hasText: "Actief" })).toBeVisible();
    // Delta sits in the "Actief" group row block, Charlie in "Gepland" (row order = group order)
    const rows = await page.getByTestId("tl-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-item-name")));
    expect(rows.indexOf("Delta - Fase 1: MVP")).toBeLessThan(rows.indexOf("Charlie - Security audit"));
    expect(errors).toEqual([]);
  });

  test("drag a bar to reschedule and resize both edges; persists after reload", async ({ page, request }) => {
    const { boardId, full, tl } = await seedPlanning(request);
    const lms = full.items.find((i) => i.name.startsWith("LMS"))!;
    const v = await createView(request, boardId, "timeline", "timeline", { zoom: "day" });
    await page.goto(`/boards/${boardId}?view=${v.id}`);
    const bar = page.locator('[data-testid="tl-bar"][data-item-name^="LMS"]');
    await expect(bar).toBeVisible();
    // zoom "day" = 40px per day: 3 days right
    await drag(page, bar, { dx: 120 }, { x: 60 });
    await expect(bar).toHaveAttribute("data-start", weekDay(7));
    await expect.poll(async () => (await getItem(request, boardId, lms.id)).values[tl.id]).toEqual({ from: weekDay(7), to: weekDay(11) });
    // resize the end 2 days to the left
    await drag(page, bar.getByTestId("tl-resize-end"), { dx: -80 }, { x: 4 });
    await expect.poll(async () => (await getItem(request, boardId, lms.id)).values[tl.id]).toEqual({ from: weekDay(7), to: weekDay(9) });
    // and the start 1 day to the left
    await drag(page, page.locator('[data-testid="tl-bar"][data-item-name^="LMS"]').getByTestId("tl-resize-start"), { dx: -40 }, { x: 4 });
    await expect.poll(async () => (await getItem(request, boardId, lms.id)).values[tl.id]).toEqual({ from: weekDay(6), to: weekDay(9) });
    await page.reload();
    await expect(page.locator('[data-testid="tl-bar"][data-item-name^="LMS"]')).toHaveAttribute("data-start", weekDay(6));
  });

  test("zoom levels change the bar width; grouping by person; click on an empty row schedules the item", async ({ page, request }) => {
    const { boardId } = await seedPlanning(request);
    const v = await createView(request, boardId, "timeline");
    await page.goto(`/boards/${boardId}?view=${v.id}`);
    const bar = page.locator('[data-testid="tl-bar"][data-item-name^="Delta"]');
    await page.getByTestId("zoom-day").click();
    const day = (await bar.boundingBox())!.width;
    await page.getByTestId("zoom-week").click();
    const week = (await bar.boundingBox())!.width;
    await page.getByTestId("zoom-month").click();
    const month = (await bar.boundingBox())!.width;
    expect(day).toBeGreaterThan(week);
    expect(week).toBeGreaterThan(month);
    await page.getByTestId("zoom-quarter").click();
    await expect(page.getByTestId("timeline-grid")).toHaveAttribute("data-zoom", "quarter");

    // Alpha has no dates: clicking its empty track schedules it
    await page.getByTestId("zoom-week").click();
    const track = page.locator('[data-testid="tl-row"][data-item-name^="Alpha"]').getByTestId("tl-empty-track");
    await track.click({ position: { x: 600, y: 18 } });
    await expect(page.locator('[data-testid="tl-bar"][data-item-name^="Alpha"]')).toBeVisible();

    // group by person via settings
    await page.getByTestId("view-settings-button").click();
    await page.getByTestId("setting-input-groupBy").selectOption("person");
    await page.getByRole("button", { name: "Opslaan" }).click();
    await expect(page.getByTestId("tl-group").filter({ hasText: "Admin User" })).toBeVisible();
  });
});
