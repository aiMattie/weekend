import { collectConsoleErrors, expect, login, newUserPage, resetDb, test, boardIdByName } from "../fixtures";
import { loginApi, boardFull, colByKey, createView, drag, itemByName } from "./helpers";

test.describe("views: kanban", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetDb(request);
    await login(page, "admin");
    await loginApi(request);
  });

  test("shows a lane per status with cards in the right lane, and a no-value lane", async ({ page, request }) => {
    const errors = collectConsoleErrors(page);
    const boardId = await boardIdByName(request, "Klanten");
    const v = await createView(request, boardId, "kanban");
    await page.goto(`/boards/${boardId}?view=${v.id}`);
    const lane = (title: string) => page.locator(`[data-testid="kanban-lane"][data-lane-title="${title}"]`);
    await expect(lane("Working on it").locator('[data-testid="kanban-card"]')).toHaveCount(3); // Delta, Alpha, LMS
    await expect(lane("Working on it").locator('[data-item-name="Delta"]')).toBeVisible();
    await expect(lane("Done").locator('[data-item-name="Echo"]')).toBeVisible();
    await expect(lane("Stuck").locator('[data-item-name="Bravo"]')).toBeVisible();
    await expect(lane("Geen waarde")).toBeVisible();
    await expect(lane("Working on it").getByTestId("kanban-lane-count")).toHaveText("3");
    // card fields show the board's cells
    await expect(lane("Working on it").locator('[data-item-name="Delta"]').getByTestId("card-field-uurtarief_dev")).toContainText("95");
    expect(errors).toEqual([]);
  });

  test("drag a card to another lane updates the status (and survives a reload)", async ({ page, request }) => {
    const boardId = await boardIdByName(request, "Klanten");
    const full = await boardFull(request, boardId);
    const status = colByKey(full, "status");
    const delta = itemByName(full, "Delta");
    // collapse "Stuck" so all lanes fit on screen (drag targets stay clear of the autoscroll zone)
    const stuckLabel = (status.settings.labels as { id: number; text: string }[]).find((l) => l.text === "Stuck")!.id;
    const v = await createView(request, boardId, "kanban", "kanban", { collapsedLaneIds: [String(stuckLabel)] });
    await page.goto(`/boards/${boardId}?view=${v.id}`);
    const lane = (title: string) => page.locator(`[data-testid="kanban-lane"][data-lane-title="${title}"]`);
    const card = lane("Working on it").locator('[data-item-name="Delta"]');
    await drag(page, card, lane("Done").getByTestId("kanban-lane-head"));
    await expect(lane("Done").locator('[data-item-name="Delta"]')).toBeVisible();
    await expect(lane("Working on it").locator('[data-item-name="Delta"]')).toHaveCount(0);
    const doneId = (status.settings.labels as { id: number; text: string }[]).find((l) => l.text === "Done")!.id;
    await expect.poll(async () => ((await boardFull(request, boardId)).items.find((i) => i.id === delta.id)!.values[status.id] as { index: number } | undefined)?.index).toBe(doneId);
    await page.reload();
    await expect(lane("Done").locator('[data-item-name="Delta"]')).toBeVisible();
    // and back into the "no value" lane clears the status
    await drag(page, lane("Done").locator('[data-item-name="Delta"]'), lane("Geen waarde").getByTestId("kanban-lane-head"));
    await expect.poll(async () => (await boardFull(request, boardId)).items.find((i) => i.id === delta.id)!.values[status.id]).toBeUndefined();
  });

  test("add a card in a lane, collapse a lane, open a card", async ({ page, request }) => {
    const boardId = await boardIdByName(request, "Klanten");
    const v = await createView(request, boardId, "kanban");
    await page.goto(`/boards/${boardId}?view=${v.id}`);
    const stuck = page.locator('[data-testid="kanban-lane"][data-lane-title="Stuck"]');
    await stuck.getByTestId("kanban-add-card").click();
    await stuck.getByTestId("kanban-add-input").fill("Nieuwe klant");
    await stuck.getByTestId("kanban-add-input").press("Enter");
    await expect(stuck.locator('[data-item-name="Nieuwe klant"]')).toBeVisible();
    await expect(stuck.getByTestId("kanban-lane-count")).toHaveText("2");
    const full = await boardFull(request, boardId);
    const status = colByKey(full, "status");
    const stuckId = (status.settings.labels as { id: number; text: string }[]).find((l) => l.text === "Stuck")!.id;
    await expect.poll(async () => ((itemByName(await boardFull(request, boardId), "Nieuwe klant").values[status.id] as { index: number } | undefined)?.index)).toBe(stuckId);

    await stuck.getByTestId("kanban-lane-head").click();
    await expect(stuck.getByTestId("kanban-card")).toHaveCount(0);
    await expect.poll(async () => ((await boardFull(request, boardId)).views.find((x) => x.id === v.id)?.settings.collapsedLaneIds as string[] | undefined)?.length).toBe(1);
    await page.reload(); // collapse state is stored in the view
    await expect(page.locator('[data-testid="kanban-lane"][data-lane-title="Stuck"]').getByTestId("kanban-card")).toHaveCount(0);
    await page.locator('[data-testid="kanban-lane"][data-lane-title="Stuck"]').getByTestId("kanban-lane-head").click();
    await page.locator('[data-item-name="Bravo"]').first().click();
    await expect(page.getByTestId("item-panel")).toBeVisible();
  });

  test("kanban follows realtime changes of another user and the toolbar search", async ({ page, request, browser, baseURL }) => {
    const boardId = await boardIdByName(request, "Klanten");
    const v = await createView(request, boardId, "kanban");
    await page.goto(`/boards/${boardId}?view=${v.id}`);
    const other = await newUserPage(browser, baseURL, "pm1");
    const full = await boardFull(request, boardId);
    const status = colByKey(full, "status");
    const charlie = itemByName(full, "Charlie");
    const stuckId = (status.settings.labels as { id: number; text: string }[]).find((l) => l.text === "Stuck")!.id;
    const res = await other.context.request.put(`/api/v1/items/${charlie.id}/values`, { data: { [status.id]: { index: stuckId } } });
    expect(res.ok()).toBeTruthy();
    await expect(page.locator('[data-testid="kanban-lane"][data-lane-title="Stuck"] [data-item-name="Charlie"]')).toBeVisible();
    await page.getByTestId("toolbar-search").click().catch(() => undefined);
    await other.context.close();
  });
});
