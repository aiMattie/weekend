import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";
import { loginApi, createView, drag, getItem, isoDay, seedPlanning, setValue, weekDay } from "./helpers";

test.describe("views: calendar", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetDb(request);
    await login(page, "admin");
    await loginApi(request);
  });

  test("places timeline items on their days and spans multi-day ranges", async ({ page, request }) => {
    const errors = collectConsoleErrors(page);
    const { boardId } = await seedPlanning(request);
    const v = await createView(request, boardId, "calendar");
    await page.goto(`/boards/${boardId}?view=${v.id}`);
    const ev = page.locator('[data-testid="cal-event"][data-item-name^="Delta"]');
    await expect(ev.first()).toBeVisible();
    await expect(ev.first()).toHaveAttribute("data-start", weekDay(0));
    await expect(ev.first()).toHaveAttribute("data-end", weekDay(3));
    // the bar is wider than one day cell
    const cell = (await page.locator(`[data-testid="cal-day"][data-date="${weekDay(0)}"]`).boundingBox())!;
    expect((await ev.first().boundingBox())!.width).toBeGreaterThan(cell.width * 3);
    await expect(page.getByTestId("cal-title")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("drag to reschedule moves the whole range and persists after a reload", async ({ page, request }) => {
    const { boardId, full, tl } = await seedPlanning(request);
    const delta = full.items.find((i) => i.name.startsWith("Delta"))!;
    const v = await createView(request, boardId, "calendar");
    await page.goto(`/boards/${boardId}?view=${v.id}`);
    const ev = page.locator('[data-testid="cal-event"][data-item-name^="Delta"]').first();
    await drag(page, ev, page.locator(`[data-testid="cal-day"][data-date="${weekDay(1 + 0)}"]`), { x: 20 });
    await expect(ev).toHaveAttribute("data-start", weekDay(1), { timeout: 8000 });
    await expect.poll(async () => (await getItem(request, boardId, delta.id)).values[tl.id]).toEqual({ from: weekDay(1), to: weekDay(4) });
    await page.reload();
    await expect(page.locator('[data-testid="cal-event"][data-item-name^="Delta"]').first()).toHaveAttribute("data-end", weekDay(4));
  });

  test("drag the right edge of a timeline range to resize it", async ({ page, request }) => {
    const { boardId, full, tl } = await seedPlanning(request);
    const delta = full.items.find((i) => i.name.startsWith("Delta"))!;
    const v = await createView(request, boardId, "calendar");
    await page.goto(`/boards/${boardId}?view=${v.id}`);
    const ev = page.locator('[data-testid="cal-event"][data-item-name^="Delta"]').first();
    await expect(ev).toBeVisible();
    const target = page.locator(`[data-testid="cal-day"][data-date="${weekDay(5)}"]`);
    await drag(page, ev.getByTestId("cal-resize-end"), target);
    await expect.poll(async () => (await getItem(request, boardId, delta.id)).values[tl.id]).toEqual({ from: weekDay(0), to: weekDay(5) });
    // resizing the left edge shortens from the start
    const handle = page.locator('[data-testid="cal-event"][data-item-name^="Delta"]').first().getByTestId("cal-resize-start");
    await drag(page, handle, page.locator(`[data-testid="cal-day"][data-date="${weekDay(2)}"]`));
    await expect.poll(async () => (await getItem(request, boardId, delta.id)).values[tl.id]).toEqual({ from: weekDay(2), to: weekDay(5) });
  });

  test("click on a day adds an item with that date; week and day modes; multiple date columns", async ({ page, request }) => {
    const { boardId, full } = await seedPlanning(request);
    const gonogo = full.columns.find((c) => c.key === "gonogo_datum")!;
    const charlie = full.items.find((i) => i.name.startsWith("Charlie"))!;
    await setValue(request, charlie.id, gonogo.id, { date: weekDay(2) });
    const v = await createView(request, boardId, "calendar");
    await page.goto(`/boards/${boardId}?view=${v.id}`);
    // both the timeline and the date column feed the calendar
    await expect(page.locator(`[data-testid="cal-event"][data-item-name^="Charlie"][data-start="${weekDay(2)}"]`)).toBeVisible();

    // add on day click: first date column is the timeline "looptijd"? -> the item gets a date on the first selected column
    await page.locator(`[data-testid="cal-day"][data-date="${weekDay(2)}"]`).click({ position: { x: 10, y: 80 } });
    await page.getByTestId("cal-add-input").fill("Nieuwe fase");
    await page.getByTestId("cal-add-input").press("Enter");
    await expect(page.locator('[data-testid="cal-event"][data-item-name="Nieuwe fase"]')).toBeVisible();
    await expect.poll(async () => (await (await request.get(`/api/v1/boards/${boardId}/full`)).json()).items.some((i: { name: string }) => i.name === "Nieuwe fase")).toBe(true);

    await page.getByTestId("cal-mode-week").click();
    await expect(page.getByTestId("cal-grid")).toHaveAttribute("data-mode", "week");
    await expect(page.getByTestId("cal-day")).toHaveCount(7);
    await page.getByTestId("cal-mode-day").click();
    await expect(page.getByTestId("cal-day")).toHaveCount(1);
    await page.getByTestId("cal-mode-month").click();
    const title = await page.getByTestId("cal-title").textContent();
    await page.getByTestId("cal-next").click();
    await expect(page.getByTestId("cal-title")).not.toHaveText(title!);
    await page.getByTestId("cal-today").click();
    await expect(page.getByTestId("cal-title")).toHaveText(title!);
    void isoDay;
  });
});
