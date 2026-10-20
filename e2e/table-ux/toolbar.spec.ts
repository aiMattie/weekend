import { collectConsoleErrors, expect as baseExpect, login, openBoard, resetDb, test } from "../fixtures";
import type { Locator, Page } from "@playwright/test";

/** Toolbar: search, person filter, filter rules per column type, sort, group by, hide, customize. */

const rowNames = (page: Page) => page.locator('[data-testid="item-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-item-name")));
const expectRows = async (page: Page, names: string[]) => { await expect.poll(async () => (await rowNames(page)).slice().sort()).toEqual(names.slice().sort()); };

async function openPop(page: Page, id: string, popId: string) {
  await page.getByTestId(id).click();
  await expect(page.getByTestId(popId)).toBeVisible();
}
const closePop = async (page: Page) => { await page.keyboard.press("Escape"); };

/** Adds a filter rule; `operand` is text for inputs, string[] of chip labels for set operators. */
async function addRule(page: Page, i: number, opts: { column: string; op: string; operand?: string | string[]; join?: "and" | "or" }) {
  if (!(await page.getByTestId("filter-popover").isVisible())) await openPop(page, "toolbar-filter", "filter-popover");
  await page.getByTestId("filter-add").click();
  const rule: Locator = page.getByTestId("filter-rule").nth(i);
  if (opts.join && i > 0) await rule.getByTestId("filter-join").selectOption(opts.join);
  await rule.getByTestId("filter-column").selectOption({ label: opts.column });
  await rule.getByTestId("filter-op").selectOption({ label: opts.op });
  if (Array.isArray(opts.operand)) for (const label of opts.operand) await rule.locator(`[data-testid="filter-operand-option"][data-label="${label}"]`).click();
  else if (opts.operand !== undefined) await rule.getByTestId("filter-operand").fill(opts.operand);
}

const expect = baseExpect.configure({ timeout: 40_000 }); // slow dev servers when many agents share the host
test.describe.configure({ timeout: 420_000 }); // dev servers are slow when many agents share the host

test.describe("toolbar", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetDb(request);
    await login(page, "admin");
  });

  test("global search matches names and column values", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await openBoard(page, "Klanten");
    await expect(page.locator('[data-testid="item-row"]')).toHaveCount(6);
    await page.getByTestId("toolbar-search").click();
    const input = page.getByTestId("toolbar-search-input");
    await input.fill("bra");
    await expectRows(page, ["Bravo"]);
    await input.fill("strippenkaart"); // value of a dropdown column
    await expectRows(page, ["LMS"]);
    await input.fill("zzzz");
    await expect(page.getByTestId("board-table")).toContainText("Geen items");
    await input.press("Escape");
    await expect(page.locator('[data-testid="item-row"]')).toHaveCount(6);
    expect(errors).toEqual([]);
  });

  test("person filter incl. unassigned", async ({ page, request }) => {
    const id = await openBoard(page, "Klanten");
    await openPop(page, "toolbar-person", "person-popover");
    await page.getByTestId("person-filter-Admin User").click();
    await expectRows(page, ["Delta", "Charlie"]);
    await page.getByTestId("person-filter-Planner").click();
    await expectRows(page, ["Delta", "Charlie", "Alpha", "LMS"]);
    await page.getByTestId("person-clear").click();
    await expect(page.locator('[data-testid="item-row"]')).toHaveCount(6);
    await closePop(page);
    // an item nobody is assigned to shows up under "Niet toegewezen"
    const created = await page.context().request.post("/api/v1/items", { data: { boardId: id, name: "Zonder eigenaar" } });
    expect(created.ok()).toBeTruthy();
    await expect(page.locator('[data-item-name="Zonder eigenaar"]')).toBeVisible();
    await openPop(page, "toolbar-person", "person-popover");
    await page.getByTestId("person-filter-none").click();
    await expectRows(page, ["Zonder eigenaar"]);
    await expect(page.getByTestId("toolbar-person-count")).toHaveText("1");
    void request;
  });

  test("filter rule types: name, status, dropdown, people, numbers, empty", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await openBoard(page, "Klanten");
    await addRule(page, 0, { column: "Name", op: "bevat", operand: "a" });
    await expectRows(page, ["Delta", "Alpha", "Bravo", "Charlie", "LMS", "Echo"].filter((n) => /a/i.test(n)));
    await page.getByTestId("filter-clear").click();
    await expectRows(page, ["Delta", "Alpha", "Bravo", "Charlie", "LMS", "Echo"]);

    await addRule(page, 0, { column: "Status", op: "is een van", operand: ["Done"] });
    await expectRows(page, ["Charlie", "Echo"]);
    await page.getByTestId("filter-rule").nth(0).getByTestId("filter-op").selectOption({ label: "is geen van" });
    await expectRows(page, ["Delta", "Alpha", "Bravo", "LMS"]); // same kind of input: the value stays
    await page.getByTestId("filter-rule").nth(0).getByTestId("filter-op").selectOption({ label: "is een van" });
    await expectRows(page, ["Charlie", "Echo"]);
    await page.getByTestId("filter-rule").nth(0).getByTestId("filter-op").selectOption({ label: "is geen van" });
    await expectRows(page, ["Delta", "Alpha", "Bravo", "LMS"]);
    await page.getByTestId("filter-clear").click();

    await addRule(page, 0, { column: "Contractvorm(en)", op: "is een van", operand: ["SLA"] });
    await expectRows(page, ["Bravo"]);
    await page.getByTestId("filter-clear").click();

    await addRule(page, 0, { column: "Accountmanager", op: "is een van", operand: ["Planner"] });
    await expectRows(page, ["Alpha", "LMS"]);
    await page.getByTestId("filter-clear").click();

    await addRule(page, 0, { column: "Uurtarief dev", op: "is groter dan", operand: "90" });
    await expectRows(page, ["Delta", "Bravo", "Charlie"]);
    await page.getByTestId("filter-clear").click();

    await addRule(page, 0, { column: "Uurtarief PM", op: "is leeg" });
    await expectRows(page, ["LMS", "Echo"]);
    await page.getByTestId("filter-rule").nth(0).getByTestId("filter-op").selectOption({ label: "is niet leeg" });
    await expectRows(page, ["Delta", "Alpha", "Bravo", "Charlie"]);
    await expect(page.getByTestId("toolbar-filter-count")).toHaveText("1");
    expect(errors).toEqual([]);
  });

  test("filter rules combine with AND and OR", async ({ page }) => {
    await openBoard(page, "Klanten");
    await addRule(page, 0, { column: "Status", op: "is een van", operand: ["Done"] });
    await addRule(page, 1, { column: "Accountmanager", op: "is een van", operand: ["Admin User"], join: "and" });
    await expectRows(page, ["Charlie"]);
    await page.getByTestId("filter-rule").nth(1).getByTestId("filter-join").selectOption("or");
    await expectRows(page, ["Delta", "Charlie", "Echo"]);
    await expect(page.getByTestId("toolbar-filter-count")).toHaveText("2");
    // removing a rule
    await page.getByTestId("filter-rule").nth(1).getByTestId("filter-remove").click();
    await expectRows(page, ["Charlie", "Echo"]);
  });

  test("filter rule types: date, timeline-like and checkbox on other boards", async ({ page }) => {
    await openBoard(page, "Projecten & Fases");
    await addRule(page, 0, { column: "Go/no-go datum", op: "is na", operand: "2026-11-20" });
    await expectRows(page, ["Charlie - Security audit"]);
    await page.getByTestId("filter-rule").nth(0).getByTestId("filter-op").selectOption({ label: "is voor" });
    await expectRows(page, ["Delta - Fase 1: MVP"]);
    await page.getByTestId("filter-rule").nth(0).getByTestId("filter-op").selectOption({ label: "is leeg" });
    await expectRows(page, ["LMS - Doorontwikkeling", "Alpha - AI Maturity", "Echo - Oplevering"]);
    // the relative buttons fill the date
    await page.getByTestId("filter-rule").nth(0).getByTestId("filter-op").selectOption({ label: "is voor" });
    await page.getByTestId("filter-date-today").click();
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await expect(page.getByTestId("filter-rule").nth(0).locator('input[type="date"]')).toHaveValue(iso);
  });

  test("checkbox column filter", async ({ page }) => {
    const id = await openBoard(page, "Klanten");
    const req = page.context().request;
    const col = await (await req.post(`/api/v1/boards/${id}/columns`, { data: { title: "Gefactureerd", type: "checkbox" } })).json();
    const items = (await (await req.get(`/api/v1/boards/${id}/full`)).json()).items as { id: string; name: string }[];
    const delta = items.find((i) => i.name === "Delta")!;
    expect((await req.put(`/api/v1/items/${delta.id}/values`, { data: { [col.id]: { checked: true } } })).ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByTestId("board-page")).toBeVisible();
    await addRule(page, 0, { column: "Gefactureerd", op: "is aangevinkt" });
    await expectRows(page, ["Delta"]);
    await page.getByTestId("filter-rule").nth(0).getByTestId("filter-op").selectOption({ label: "is niet aangevinkt" });
    await expect(page.locator('[data-testid="item-row"]')).toHaveCount(5);
  });

  test("multi-level sort", async ({ page }) => {
    await openBoard(page, "Klanten");
    const firstGroup = async () => (await rowNames(page)).slice(0, 4);
    await openPop(page, "toolbar-sort", "sort-popover");
    await page.getByTestId("sort-add").click();
    await page.getByTestId("sort-rule").nth(0).getByTestId("sort-column").selectOption({ label: "Uurtarief dev" });
    await page.getByTestId("sort-rule").nth(0).getByTestId("sort-dir").selectOption("desc");
    await expect.poll(firstGroup).toEqual(["Charlie", "Delta", "Bravo", "Alpha"]);
    // second level: name ascending (only matters for ties; check the level UI and reorder)
    await page.getByTestId("sort-add").click();
    await expect(page.getByTestId("sort-rule")).toHaveCount(2);
    await page.getByTestId("sort-rule").nth(1).getByTestId("sort-up").click();
    await expect(page.getByTestId("sort-rule").nth(0).getByTestId("sort-column")).toHaveValue("__name");
    await expect(page.getByTestId("toolbar-sort-count")).toHaveText("2");
    await page.getByTestId("sort-rule").nth(0).getByTestId("sort-remove").click();
    await page.getByTestId("sort-rule").nth(0).getByTestId("sort-column").selectOption({ label: "Name" });
    await page.getByTestId("sort-rule").nth(0).getByTestId("sort-dir").selectOption("asc");
    await expect.poll(firstGroup).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
    await page.getByTestId("sort-clear").click();
    await expect.poll(firstGroup).toEqual(["Delta", "Alpha", "Bravo", "Charlie"]);
  });

  test("group by status and by people", async ({ page }) => {
    await openBoard(page, "Klanten");
    await openPop(page, "toolbar-groupby", "groupby-popover");
    await page.getByTestId("groupby-status").click();
    const titles = () => page.getByTestId("group-title").allTextContents();
    await expect.poll(titles).toEqual(["Working on it", "Done", "Stuck"]);
    await expect(page.getByTestId("add-group")).toHaveCount(0); // virtual groups cannot get new groups
    await openPop(page, "toolbar-groupby", "groupby-popover");
    await page.getByTestId("groupby-accountmanager").click();
    await expect.poll(titles).toEqual(["Admin User", "Coordinator", "Planner"]);
    await openPop(page, "toolbar-groupby", "groupby-popover");
    await page.getByTestId("groupby-none").click();
    await expect.poll(titles).toEqual(["Actieve klanten", "Support SLA & strippenkaart", "Taken completed"]);
  });

  test("hide columns, search in the list, show all", async ({ page }) => {
    await openBoard(page, "Klanten");
    await expect(page.getByTestId("col-header-uurtarief_dev").first()).toBeVisible();
    await openPop(page, "toolbar-hide", "hide-popover");
    await page.getByTestId("hide-col-uurtarief_dev").uncheck();
    await expect(page.getByTestId("col-header-uurtarief_dev")).toHaveCount(0);
    await expect(page.getByTestId("col-header-uurtarief_pm").first()).toBeVisible();
    await expect(page.getByTestId("toolbar-hide-count")).toHaveText("1");
    await page.getByTestId("pop-search").fill("pm");
    await expect(page.getByTestId("hide-col-uurtarief_dev")).toHaveCount(0);
    await page.getByTestId("pop-search").fill("");
    await page.getByTestId("hide-all").click();
    await expect(page.getByTestId("col-header-status")).toHaveCount(0);
    await page.getByTestId("show-all").click();
    await expect(page.getByTestId("col-header-uurtarief_dev").first()).toBeVisible();
  });

  test("customize: toolbar buttons move to the more menu and clear all resets", async ({ page }) => {
    await openBoard(page, "Klanten");
    await page.getByTestId("toolbar-more").click();
    await page.getByTestId("toolbar-customize").click();
    await page.getByTestId("customize-hide").uncheck();
    await expect(page.getByTestId("toolbar-hide")).toHaveCount(0);
    await closePop(page);
    await page.getByTestId("toolbar-more").click();
    await page.getByTestId("more-hide").click();
    await expect(page.getByTestId("hide-popover")).toBeVisible();
    await closePop(page);
    // restore and test "clear all"
    await page.getByTestId("toolbar-more").click();
    await page.getByTestId("toolbar-customize").click();
    await page.getByTestId("customize-hide").check();
    await expect(page.getByTestId("toolbar-hide")).toBeVisible();
    await closePop(page);
    await addRule(page, 0, { column: "Name", op: "bevat", operand: "bra" });
    await expectRows(page, ["Bravo"]);
    await closePop(page);
    await page.getByTestId("toolbar-more").click();
    await page.getByTestId("toolbar-clear-all").click();
    await expect(page.locator('[data-testid="item-row"]')).toHaveCount(6);
  });
});
