import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";
import { loginApi, colByTitle, createView, drag, getItem, itemByName, seedPlanning, setValue, weekDay, boardFull } from "./helpers";

const dep = (...ids: string[]) => ({ linkedPulseIds: ids.map((linkedPulseId) => ({ linkedPulseId })) });

async function setup(request: import("@playwright/test").APIRequestContext) {
  const planning = await seedPlanning(request);
  const res = await request.post(`/api/v1/boards/${planning.boardId}/columns`, { data: { title: "Afhankelijk van", type: "dependency" } });
  expect(res.ok()).toBeTruthy();
  const full = await boardFull(request, planning.boardId);
  const depCol = full.columns.find((c) => c.type === "dependency")!;
  const delta = itemByName(full, "Delta"); const lms = itemByName(full, "LMS"); const charlie = itemByName(full, "Charlie");
  await setValue(request, lms.id, depCol.id, dep(delta.id));
  await setValue(request, charlie.id, depCol.id, dep(lms.id));
  return { ...planning, full, depCol, delta, lms, charlie };
}

test.describe("views: gantt", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetDb(request);
    await login(page, "admin");
    await loginApi(request);
  });

  test("draws dependency arrows and highlights the critical path", async ({ page, request }) => {
    const errors = collectConsoleErrors(page);
    const s = await setup(request);
    const v = await createView(request, s.boardId, "gantt");
    await page.goto(`/boards/${s.boardId}?view=${v.id}`);
    await expect(page.getByTestId("tl-link")).toHaveCount(2);
    await expect(page.locator(`[data-testid="tl-link"][data-from="${s.delta.id}"][data-to="${s.lms.id}"]`)).toBeAttached();
    // the Delta -> LMS -> Charlie chain is the critical path: those bars carry the critical colour
    const crit = await page.locator('[data-testid="tl-bar"]').evaluateAll((els) => els.map((e) => [e.getAttribute("data-item-name"), getComputedStyle(e).backgroundColor]));
    const colorOf = (n: string) => crit.find(([name]) => (name as string).startsWith(n))![1];
    expect(colorOf("Delta")).toBe("rgb(223, 47, 74)");
    expect(colorOf("LMS")).toBe("rgb(223, 47, 74)");
    expect(colorOf("Echo")).not.toBe("rgb(223, 47, 74)");
    // toggling the critical path off recolors by status
    await page.getByTestId("gantt-critical-toggle").click();
    await expect.poll(async () => page.locator('[data-testid="tl-bar"][data-item-name^="Delta"]').evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe("rgb(223, 47, 74)");
    expect(errors).toEqual([]);
  });

  test("moving a task pushes its dependents forward (dependency shifting) and persists", async ({ page, request }) => {
    const s = await setup(request);
    const v = await createView(request, s.boardId, "gantt", "gantt", { zoom: "day" });
    await page.goto(`/boards/${s.boardId}?view=${v.id}`);
    const delta = page.locator('[data-testid="tl-bar"][data-item-name^="Delta"]');
    await expect(delta).toBeVisible();
    // Delta (Mon-Thu) -> LMS (Fri..+8) -> Charlie (+9..+11). Extend Delta's end by 3 days (40px/day):
    await drag(page, delta.getByTestId("tl-resize-end"), { dx: 120 }, { x: 4 });
    await expect.poll(async () => (await getItem(request, s.boardId, s.delta.id)).values[s.tl.id]).toEqual({ from: weekDay(0), to: weekDay(6) });
    // LMS started on day 4 (<= new end 6): pushed to start on day 7, keeping its 5 days
    await expect.poll(async () => (await getItem(request, s.boardId, s.lms.id)).values[s.tl.id]).toEqual({ from: weekDay(7), to: weekDay(11) });
    // Charlie (9..11) now starts before LMS ends (11): pushed to day 12, keeping 3 days
    await expect.poll(async () => (await getItem(request, s.boardId, s.charlie.id)).values[s.tl.id]).toEqual({ from: weekDay(12), to: weekDay(14) });
    await page.reload();
    await expect(page.locator('[data-testid="tl-bar"][data-item-name^="Charlie"]')).toHaveAttribute("data-start", weekDay(12));
  });

  test("with 'shift dependents' off only the moved task changes", async ({ page, request }) => {
    const s = await setup(request);
    const v = await createView(request, s.boardId, "gantt", "gantt", { zoom: "day", shiftDependents: false });
    await page.goto(`/boards/${s.boardId}?view=${v.id}`);
    const delta = page.locator('[data-testid="tl-bar"][data-item-name^="Delta"]');
    await drag(page, delta.getByTestId("tl-resize-end"), { dx: 120 }, { x: 4 });
    await expect.poll(async () => (await getItem(request, s.boardId, s.delta.id)).values[s.tl.id]).toEqual({ from: weekDay(0), to: weekDay(6) });
    expect((await getItem(request, s.boardId, s.lms.id)).values[s.tl.id]).toEqual({ from: weekDay(4), to: weekDay(8) });
  });

  test("link two tasks by dragging a connector, and remove the link with a double click", async ({ page, request }) => {
    const s = await setup(request);
    const v = await createView(request, s.boardId, "gantt", "gantt", { zoom: "day" });
    await page.goto(`/boards/${s.boardId}?view=${v.id}`);
    const denieuwe = itemByName(s.full, "Alpha");
    await setValue(request, denieuwe.id, s.tl.id, { from: weekDay(14), to: weekDay(16) });
    await page.reload();
    const from = page.locator('[data-testid="tl-bar"][data-item-name^="Charlie"]');
    await expect(from).toBeVisible();
    await from.hover();
    const target = page.locator('[data-testid="tl-row"][data-item-name^="Alpha"]').getByTestId("tl-bar");
    await drag(page, from.getByTestId("tl-connector"), target);
    await expect.poll(async () => (await getItem(request, s.boardId, denieuwe.id)).values[s.depCol.id]).toMatchObject(dep(s.charlie.id));
    await expect(page.getByTestId("tl-link")).toHaveCount(3);
    // double click removes it again
    // the link is a 1.5px stroke: the center of its bounding box is usually not on it, so double click a point on the path itself
    const link = page.locator(`[data-testid="tl-link"][data-from="${s.charlie.id}"][data-to="${denieuwe.id}"]`);
    const pt = await link.evaluate((p) => { const el = p as unknown as SVGPathElement; const q = el.getPointAtLength(Math.max(0, el.getTotalLength() - 20)); const m = el.getScreenCTM()!; return { x: q.x * m.a + m.e, y: q.y * m.d + m.f }; });
    await page.mouse.dblclick(pt.x, pt.y);
    await expect.poll(async () => (await getItem(request, s.boardId, denieuwe.id)).values[s.depCol.id] ?? null).toBeNull();
  });

  test("a checked milestone column renders a diamond; baseline shows under the bar", async ({ page, request }) => {
    const s = await setup(request);
    const ms = await request.post(`/api/v1/boards/${s.boardId}/columns`, { data: { title: "Mijlpaal", type: "checkbox" } });
    expect(ms.ok()).toBeTruthy();
    const bl = await request.post(`/api/v1/boards/${s.boardId}/columns`, { data: { title: "Baseline", type: "timeline" } });
    expect(bl.ok()).toBeTruthy();
    const full = await boardFull(request, s.boardId);
    const msCol = colByTitle(full, "Mijlpaal"); const blCol = colByTitle(full, "Baseline");
    await setValue(request, itemByName(full, "Echo").id, msCol.id, { checked: true });
    await setValue(request, itemByName(full, "Delta").id, blCol.id, { from: weekDay(0), to: weekDay(2) });
    const v = await createView(request, s.boardId, "gantt", "gantt", { milestoneColumnId: msCol.id, baselineColumnId: blCol.id });
    await page.goto(`/boards/${s.boardId}?view=${v.id}`);
    const diamond = page.locator('[data-testid="tl-bar"][data-item-name^="Echo"]');
    await expect(diamond).toBeVisible();
    await expect(diamond).toHaveAttribute("data-start", weekDay(-6));
    await expect(diamond).toHaveAttribute("data-end", weekDay(-6)); // a milestone is a single day
    await expect(page.getByTestId("tl-baseline")).toHaveCount(1);
  });
});
