import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";
import { boardByName, boardFull, colByKey, createView, itemByName, loginApi, seedPlanning, setValue, weekDay } from "../views/helpers";
import { settle, shot } from "./shots";

/** Screenshots for docs/handleiding/03-views.md (npm run manuals). */
test.skip(!process.env.RUN_MANUALS, "manual screenshots only run with RUN_MANUALS=1");
test.use({ actionTimeout: 20_000, navigationTimeout: 60_000 }); // fail fast: a hanging step must not block the shared e2e lock

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const dep = (...ids: string[]) => ({ linkedPulseIds: ids.map((linkedPulseId) => ({ linkedPulseId })) });

test("handleiding views: screenshots", async ({ page, request }) => {
  test.setTimeout(600_000);
  const errors = collectConsoleErrors(page);
  await resetDb(request);
  await login(page, "admin");
  await loginApi(request);

  // --- Klanten: kanban, cards, chart, files, form, map
  const klanten = await boardByName(request, "Klanten");
  const open = async (boardId: string, viewId: string, testId: string) => {
    await page.goto(`/boards/${boardId}?view=${viewId}`);
    await expect(page.getByTestId(testId)).toBeVisible();
    await settle(page);
  };

  await page.goto(`/boards/${klanten.id}`);
  await expect(page.getByTestId("board-page")).toBeVisible();
  await page.getByTestId("add-view").click();
  await expect(page.getByTestId("add-view-picker")).toBeVisible();
  await settle(page, 300);
  await shot(page, "views-picker");
  await page.keyboard.press("Escape");

  const kanban = await createView(request, klanten.id, "kanban");
  await open(klanten.id, kanban.id, "kanban-view");
  await shot(page, "views-kanban");
  await page.getByTestId("view-settings-button").click();
  await expect(page.getByTestId("view-settings-dialog")).toBeVisible();
  await settle(page, 300);
  await shot(page, "views-instellingen");
  await page.keyboard.press("Escape");

  const filesCol = colByKey(klanten.full, "files");
  const up = await request.post("/api/v1/assets", { multipart: { file: { name: "logo.png", mimeType: "image/png", buffer: PNG }, itemId: itemByName(klanten.full, "Delta").id, columnId: filesCol.id } });
  expect(up.ok()).toBeTruthy();
  const up2 = await request.post("/api/v1/assets", { multipart: { file: { name: "contract.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") }, itemId: itemByName(klanten.full, "Echo").id } });
  expect(up2.ok()).toBeTruthy();

  const cards = await createView(request, klanten.id, "cards");
  await open(klanten.id, cards.id, "cards-view");
  await shot(page, "views-cards");

  const chart = await createView(request, klanten.id, "chart", "chart", { chartType: "bar" });
  await open(klanten.id, chart.id, "chart-view");
  await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
  await shot(page, "views-chart");

  const files = await createView(request, klanten.id, "files");
  await open(klanten.id, files.id, "files-view");
  await expect(page.getByTestId("file-tile").first()).toBeVisible();
  await shot(page, "views-files");

  const form = await createView(request, klanten.id, "form");
  await open(klanten.id, form.id, "form-view");
  await shot(page, "views-form");

  const loc = await request.post(`/api/v1/boards/${klanten.id}/columns`, { data: { title: "Locatie", type: "location" } });
  expect(loc.ok()).toBeTruthy();
  const withLoc = await boardFull(request, klanten.id);
  const locCol = colByKey(withLoc, "location");
  await setValue(request, itemByName(withLoc, "Delta").id, locCol.id, { lat: 52.0907, lng: 5.1214, address: "Utrecht" });
  await setValue(request, itemByName(withLoc, "Bravo").id, locCol.id, { lat: 51.4416, lng: 5.4697, address: "Eindhoven" });
  const map = await createView(request, klanten.id, "map");
  await open(klanten.id, map.id, "map-view");
  await expect(page.getByTestId("map-marker").first()).toBeVisible();
  await shot(page, "views-map");

  // --- Projecten & Fases: timeline, gantt, calendar, workload
  const planning = await seedPlanning(request);
  const depRes = await request.post(`/api/v1/boards/${planning.boardId}/columns`, { data: { title: "Afhankelijk van", type: "dependency" } });
  expect(depRes.ok()).toBeTruthy();
  const pf = await boardFull(request, planning.boardId);
  const depCol = pf.columns.find((c) => c.type === "dependency")!;
  await setValue(request, itemByName(pf, "LMS").id, depCol.id, dep(itemByName(pf, "Delta").id));
  await setValue(request, itemByName(pf, "Charlie").id, depCol.id, dep(itemByName(pf, "LMS").id));
  await setValue(request, itemByName(pf, "Delta").id, colByKey(pf, "uren_dev").id, 80);

  const timeline = await createView(request, planning.boardId, "timeline");
  await open(planning.boardId, timeline.id, "timeline-view");
  await shot(page, "views-timeline");

  const gantt = await createView(request, planning.boardId, "gantt");
  await open(planning.boardId, gantt.id, "gantt-view");
  await expect(page.getByTestId("tl-link").first()).toBeAttached();
  await shot(page, "views-gantt");

  const calendar = await createView(request, planning.boardId, "calendar");
  await open(planning.boardId, calendar.id, "calendar-view");
  await shot(page, "views-calendar");

  const workload = await createView(request, planning.boardId, "workload", "workload", { granularity: "week", estimateColumnId: colByKey(pf, "uren_dev").id });
  await open(planning.boardId, workload.id, "workload-view");
  await shot(page, "views-workload");
  expect(weekDay(0)).toBeTruthy();
  expect(errors.filter((e) => !/openstreetmap|tile|status of 4\d\d/i.test(e))).toEqual([]);
});
