import { collectConsoleErrors, expect, login, openBoard, resetDb, test, boardIdByName } from "../fixtures";
import { loginApi, boardFull, createView, drag } from "./helpers";

const TYPES = ["kanban", "calendar", "timeline", "gantt", "workload", "cards", "chart", "map", "files", "form"] as const;
const TESTIDS: Record<string, string> = { kanban: "kanban-view", calendar: "calendar-view", timeline: "timeline-view", gantt: "gantt-view", workload: "workload-view", cards: "cards-view", chart: "chart-view", map: "map-view", files: "files-view", form: "form-view" };

test.describe("views: management", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetDb(request);
    await login(page, "admin");
    await loginApi(request);
  });

  test("the + picker lists every view type with a description and adds each of them", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await openBoard(page, "Projecten & Fases");
    await page.getByTestId("add-view").click();
    const picker = page.getByTestId("add-view-picker");
    await expect(picker).toBeVisible();
    for (const t of ["table", ...TYPES]) await expect(picker.getByTestId(`add-view-${t}`)).toBeVisible();
    await expect(picker.getByTestId("add-view-kanban")).toContainText("lanes");
    await page.keyboard.press("Escape");
    for (const type of TYPES) {
      await page.getByTestId("add-view").click();
      await page.getByTestId(`add-view-${type}`).click();
      await expect(page.getByTestId(TESTIDS[type])).toBeVisible();
      await expect(page.locator(`[data-testid="view-tab"][data-view-type="${type}"]`)).toHaveCount(1);
    }
    expect(errors.filter((e) => !/openstreetmap|tile/i.test(e))).toEqual([]);
  });

  test("rename, duplicate, make default, share link and delete", async ({ page, request, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
    const boardId = await boardIdByName(request, "Klanten");
    const kanban = await createView(request, boardId, "kanban", "Mijn kanban");
    await page.goto(`/boards/${boardId}?view=${kanban.id}`);
    const tab = page.locator(`[data-testid="view-tab"][data-view-id="${kanban.id}"]`);
    await expect(tab).toHaveAttribute("aria-selected", "true");

    // rename through the tab menu
    await tab.getByTestId("view-menu").click();
    await page.getByTestId("view-menu-rename").click();
    await page.getByTestId("view-rename-input").fill("Pipeline");
    await page.getByTestId("view-rename-input").press("Enter");
    await expect(tab.getByTestId("view-tab-name")).toHaveText("Pipeline");
    await expect.poll(async () => (await boardFull(request, boardId)).views.find((v) => v.id === kanban.id)?.name).toBe("Pipeline");

    // duplicate: a copy of the same type appears and is selected
    await tab.getByTestId("view-menu").click();
    await page.getByTestId("view-menu-duplicate").click();
    await expect(page.locator('[data-testid="view-tab"][data-view-type="kanban"]')).toHaveCount(2);
    const copy = (await boardFull(request, boardId)).views.find((v) => v.id !== kanban.id && v.type === "kanban")!;
    expect(copy.name).toContain("Pipeline");
    await expect(page.locator(`[data-testid="view-tab"][data-view-id="${copy.id}"]`)).toHaveAttribute("aria-selected", "true");

    // make the copy the default view: it becomes the first tab and loads without ?view=
    await page.getByTestId("view-menu").click();
    await page.getByTestId("view-menu-default").click();
    await expect.poll(async () => (await boardFull(request, boardId)).views[0].id).toBe(copy.id);
    await page.goto(`/boards/${boardId}`);
    await expect(page.getByTestId("kanban-view")).toBeVisible();
    await expect(page.getByTestId("view-tab").first()).toHaveAttribute("data-view-id", copy.id);

    // share link
    await page.getByTestId("view-menu").click();
    await page.getByTestId("view-menu-share").click();
    await expect(page.getByTestId("view-toast")).toContainText(`?view=${copy.id}`);
    // ... and the link opens that exact view
    await page.goto(`/boards/${boardId}?view=${kanban.id}`);
    await expect(page.locator(`[data-testid="view-tab"][data-view-id="${kanban.id}"]`)).toHaveAttribute("aria-selected", "true");

    // delete
    await page.locator(`[data-testid="view-tab"][data-view-id="${kanban.id}"]`).getByTestId("view-menu").click();
    await page.getByTestId("view-menu-delete").click();
    await expect(page.locator(`[data-testid="view-tab"][data-view-id="${kanban.id}"]`)).toHaveCount(0);
    await expect.poll(async () => (await boardFull(request, boardId)).views.some((v) => v.id === kanban.id)).toBe(false);
  });

  test("the last remaining view cannot be deleted", async ({ page }) => {
    await openBoard(page, "Klanten");
    await page.getByTestId("view-tab").first().getByTestId("view-menu").click();
    await expect(page.getByTestId("view-menu-delete")).toBeDisabled();
  });

  test("tabs reorder by drag and drop and the order persists", async ({ page, request }) => {
    const boardId = await boardIdByName(request, "Klanten");
    const a = await createView(request, boardId, "kanban", "Alpha");
    const b = await createView(request, boardId, "calendar", "Beta");
    await page.goto(`/boards/${boardId}`);
    const tabs = page.getByTestId("view-tab");
    await expect(tabs).toHaveCount(3);
    await drag(page, page.locator(`[data-view-id="${b.id}"]`), page.locator(`[data-view-id="${a.id}"]`));
    await expect.poll(async () => (await boardFull(request, boardId)).views.map((v) => v.name)).toEqual(["Main table", "Beta", "Alpha"]);
    await page.reload();
    await expect(tabs.nth(1)).toHaveAttribute("data-view-name", "Beta");
  });

  test("view settings dialog persists into the view", async ({ page, request }) => {
    const boardId = await boardIdByName(request, "Klanten");
    const full = await boardFull(request, boardId);
    const dd = full.columns.find((c) => c.key === "contractvorm")!;
    const kanban = await createView(request, boardId, "kanban");
    await page.goto(`/boards/${boardId}?view=${kanban.id}`);
    await expect(page.getByTestId("kanban-lane").first()).toBeVisible();
    await page.getByTestId("view-settings-button").click();
    await expect(page.getByTestId("view-settings-dialog")).toBeVisible();
    await page.getByTestId("setting-input-columnId").selectOption(dd.id);
    await page.getByRole("button", { name: "Opslaan" }).click();
    await expect(page.locator('[data-testid="kanban-lane"][data-lane-title="Fixed price"]')).toBeVisible();
    await expect.poll(async () => (await boardFull(request, boardId)).views.find((v) => v.id === kanban.id)?.settings.columnId).toBe(dd.id);
    await page.reload();
    await expect(page.locator('[data-testid="kanban-lane"][data-lane-title="Fixed price"]')).toBeVisible();
  });
});
