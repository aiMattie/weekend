import { expect, login, resetDb, test, collectConsoleErrors } from "../fixtures";
import { loginApi, colByKey, createView, drag, getItem, itemByName, seedPlanning, setValue, weekDay, boardFull } from "./helpers";

test.describe("views: workload", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetDb(request);
    await login(page, "admin");
    await loginApi(request);
  });

  test("shows load per person per week with capacity colors, and reassigns by drag", async ({ page, request }) => {
    const errors = collectConsoleErrors(page);
    const { boardId, full, tl } = await seedPlanning(request);
    const people = colByKey(full, "verantwoordelijke");
    const hours = colByKey(full, "uren_dev");
    const admin = full.users.find((u) => u.name.startsWith("Admin"))!;
    const dev1 = full.users.find((u) => u.name === "Builder")!;
    const delta = itemByName(full, "Delta");
    // Delta: Mon-Thu this week, 80h dev on Admin -> 80h in a week with 40h capacity = over
    await setValue(request, delta.id, hours.id, 80);
    const v = await createView(request, boardId, "workload", "workload", { granularity: "week", estimateColumnId: hours.id });
    await page.goto(`/boards/${boardId}?view=${v.id}`);
    const cell = (person: string, day: string) => page.locator(`[data-testid="wl-cell"][data-person="${person}"][data-bucket="${day}"]`);
    await expect(cell(admin.id, weekDay(0))).toHaveAttribute("data-level", "over");
    await expect(cell(admin.id, weekDay(0))).toContainText("80u / 40u");
    await expect(cell(dev1.id, weekDay(0))).toHaveAttribute("data-level", "empty");
    await expect(page.locator(`[data-testid="wl-row"][data-person="${admin.id}"]`)).toBeVisible();

    // drag the item chip of Admin onto Builder's block
    const chip = page.locator(`[data-testid="wl-person"][data-person="${admin.id}"] [data-testid="wl-item"][data-item-name^="Delta"]`);
    await expect(chip).toBeVisible();
    await drag(page, chip, page.locator(`[data-testid="wl-person"][data-person="${dev1.id}"] [data-testid="wl-row"]`));
    await expect.poll(async () => (await getItem(request, boardId, delta.id)).values[people.id]).toEqual({ personsAndTeams: [{ id: dev1.id, kind: "person" }] });
    await expect(cell(dev1.id, weekDay(0))).toHaveAttribute("data-level", "over");
    await expect(cell(admin.id, weekDay(0))).toHaveAttribute("data-level", "empty");
    expect(errors).toEqual([]);
    void tl;
  });

  test("day granularity, item mode and an editable capacity per person", async ({ page, request }) => {
    const { boardId, full } = await seedPlanning(request);
    const admin = full.users.find((u) => u.name.startsWith("Admin"))!;
    const v = await createView(request, boardId, "workload");
    await page.goto(`/boards/${boardId}?view=${v.id}`);
    // default = hours without estimates: 4h per working day (Delta is Admin's)
    await expect(page.locator(`[data-testid="wl-cell"][data-person="${admin.id}"][data-bucket="${weekDay(0)}"]`)).toHaveAttribute("data-load", "16"); // 4 days x 4h
    await page.getByTestId("wl-gran-day").click();
    await expect(page.locator(`[data-testid="wl-cell"][data-person="${admin.id}"][data-bucket="${weekDay(1)}"]`)).toHaveAttribute("data-load", "4");
    // lower Admin's capacity to 2h/day: 4h on one day is over capacity
    const capacity = page.locator(`[data-testid="wl-row"][data-person="${admin.id}"]`).getByTestId("wl-capacity");
    await capacity.fill("2");
    await capacity.press("Enter");
    await expect(page.locator(`[data-testid="wl-cell"][data-person="${admin.id}"][data-bucket="${weekDay(1)}"]`)).toHaveAttribute("data-level", "over");
    await page.getByTestId("wl-next").click();
    await page.getByTestId("wl-today").click();
    await expect(page.getByTestId("workload-table")).toBeVisible();
    void boardFull; void itemByName;
  });
});
