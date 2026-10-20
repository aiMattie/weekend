import { readFileSync } from "node:fs";
import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";
import { createBoard, group, openTestBoard, order, persistedOrder, row } from "./grid-helpers";

test.setTimeout(600_000);

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await login(page, "admin");
});

const pick = async (page: import("@playwright/test").Page, name: string) => {
  await row(page, name).getByTestId("row-checkbox").click();
};

test.describe("multi-select and bulk actions", () => {
  test("selects rows, shows the bar, selects a whole group and clears with Escape", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const b = await createBoard(page.context().request, { groups: [{ title: "Eerste", items: ["A", "B", "C"] }, { title: "Tweede", items: ["X"] }] });
    await openTestBoard(page, b.boardId);
    await expect(page.getByTestId("bulk-bar")).toHaveCount(0);
    await pick(page, "A");
    await expect(page.getByTestId("bulk-count")).toContainText("1");
    await row(page, "C").getByTestId("row-checkbox").click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("bulk-count")).toContainText("3");
    await page.getByTestId("bulk-clear").click();
    await expect(page.getByTestId("bulk-bar")).toHaveCount(0);
    await group(page, "Eerste").getByTestId("group-checkbox").check();
    await expect(page.getByTestId("bulk-count")).toContainText("3");
    await page.locator('[data-testid="board-table"]').press("Escape");
    await expect(page.getByTestId("bulk-bar")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("duplicate, update column, move to group, archive and delete the selection", async ({ page }) => {
    const b = await createBoard(page.context().request, { groups: [{ title: "Eerste", items: ["A", "B", "C"] }, { title: "Tweede", items: ["X"] }] });
    await openTestBoard(page, b.boardId);

    await pick(page, "A");
    await pick(page, "B");
    await page.getByTestId("bulk-duplicate").click();
    await expect(page.locator('[data-testid="item-row"]')).toHaveCount(6);
    expect((await order(page, "Eerste")).sort()).toEqual(["A", "A (copy)", "B", "B (copy)", "C"]);
    await expect(page.getByTestId("bulk-bar")).toHaveCount(0);

    await pick(page, "A");
    await pick(page, "C");
    await page.getByTestId("bulk-update").click();
    await page.getByTestId("bulk-column-status").click();
    await page.getByTestId("status-option").filter({ hasText: "Done" }).first().click();
    await expect(row(page, "A").getByTestId("cell-status")).toContainText("Done");
    await expect(row(page, "C").getByTestId("cell-status")).toContainText("Done");
    await expect(row(page, "B").getByTestId("cell-status")).not.toContainText("Done");

    await pick(page, "B");
    await pick(page, "C");
    await page.getByTestId("bulk-move").click();
    await page.getByTestId(`bulk-move-group-${b.groups[1].id}`).click();
    await expect.poll(async () => (await persistedOrder(page.context().request, b.boardId)).Tweede).toEqual(["X", "B", "C"]);
    expect((await order(page, "Tweede")).sort()).toEqual(["B", "C", "X"]);

    await pick(page, "B");
    await page.getByTestId("bulk-archive").click();
    await expect(row(page, "B")).toHaveCount(0);
    await pick(page, "X");
    await page.getByTestId("bulk-delete").click();
    await expect(row(page, "X")).toHaveCount(0);
    // optimistic UI: let the server (and the undo log) catch up before reloading
    await expect.poll(async () => JSON.stringify(await persistedOrder(page.context().request, b.boardId))).not.toContain('"X"');
    await page.waitForTimeout(800);
    // the unread request is fired by useBoard's mount effect: when it is back the page is hydrated (shortcuts are registered)
    const hydrated = page.waitForResponse((r) => r.url().includes(`/boards/${b.boardId}/unread`));
    await page.reload();
    await hydrated;
    await expect(page.getByTestId("board-table")).toBeVisible();
    await expect(row(page, "B")).toHaveCount(0);
    await expect(row(page, "X")).toHaveCount(0);
    await expect(row(page, "C")).toBeVisible();
    // undo the delete and the archive
    await page.keyboard.press("Control+z");
    await expect(row(page, "X")).toBeVisible();
    await page.keyboard.press("Control+z");
    await expect(row(page, "B")).toBeVisible();
  });

  test("exports the selection to CSV and Excel (downloaded file)", async ({ page }) => {
    const b = await createBoard(page.context().request, { name: "Exportboard", groups: [{ title: "Eerste", items: ["Alpha", "Beta", "Gamma"] }] });
    await openTestBoard(page, b.boardId);
    await pick(page, "Alpha");
    await pick(page, "Gamma");
    await page.getByTestId("bulk-export").click();
    const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("bulk-export-csv").click()]);
    expect(csv.suggestedFilename()).toBe("Exportboard.csv");
    const text = readFileSync((await csv.path())!, "utf8");
    expect(text).toContain("Alpha");
    expect(text).toContain("Gamma");
    expect(text).not.toContain("Beta");
    await page.getByTestId("bulk-export").click();
    const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByTestId("bulk-export-xlsx").click()]);
    expect(xlsx.suggestedFilename()).toBe("Exportboard.xlsx");
    expect(readFileSync((await xlsx.path())!).subarray(0, 2).toString()).toBe("PK");
    // a whole group from the group menu
    await group(page, "Eerste").getByTestId("group-menu").click();
    const [grp] = await Promise.all([page.waitForEvent("download"), page.getByTestId("group-export-csv").click()]);
    expect(readFileSync((await grp.path())!, "utf8")).toContain("Beta");
  });
});

test.describe("undo and redo", () => {
  test("undoes and redoes a status change, a rename and a deleted row with Ctrl+Z / Ctrl+Shift+Z", async ({ page }) => {
    const b = await createBoard(page.context().request, { groups: [{ title: "Eerste", items: ["A", "B"] }] });
    await openTestBoard(page, b.boardId);
    const status = row(page, "A").getByTestId("cell-status");
    await status.click();
    await page.getByTestId("status-option").filter({ hasText: "Done" }).first().click();
    await expect(status).toContainText("Done");
    await page.keyboard.press("Control+z");
    await expect(status).not.toContainText("Done");
    await expect(page.getByTestId("undo-toast")).toContainText("Waarde gewijzigd");
    await page.keyboard.press("Control+Shift+z");
    await expect(status).toContainText("Done");
    await page.keyboard.press("Control+z");
    await expect(status).not.toContainText("Done");

    // rename
    await row(page, "B").getByTestId("item-name").click();
    await page.getByTestId("item-name-input").fill("B hernoemd");
    await page.getByTestId("item-name-input").press("Enter");
    await expect(row(page, "B hernoemd")).toBeVisible();
    await page.keyboard.press("Control+z");
    await expect(row(page, "B")).toBeVisible();

    // delete via the row menu
    await row(page, "A").hover();
    await row(page, "A").getByTestId("row-menu").click();
    await page.getByTestId("row-delete").click();
    await expect(row(page, "A")).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect(row(page, "A")).toBeVisible();
    await page.keyboard.press("Control+Shift+z");
    await expect(row(page, "A")).toHaveCount(0);
    // creating an item can be undone too
    await group(page, "Eerste").getByTestId("add-item").click();
    await page.getByTestId("add-item-input").fill("Nieuw");
    await page.getByTestId("add-item-input").press("Enter");
    await expect(row(page, "Nieuw")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.locator('[data-testid="board-table"]').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press("Control+z");
    await expect(row(page, "Nieuw")).toHaveCount(0);
  });

  test("Ctrl+Z inside a text input does not trigger the board undo", async ({ page }) => {
    const b = await createBoard(page.context().request, { groups: [{ title: "Eerste", items: ["A"] }] });
    await openTestBoard(page, b.boardId);
    await row(page, "A").getByTestId("cell-status").click();
    await page.getByTestId("status-option").filter({ hasText: "Done" }).first().click();
    await expect(row(page, "A").getByTestId("cell-status")).toContainText("Done");
    await group(page, "Eerste").getByTestId("add-item").click();
    await page.getByTestId("add-item-input").fill("tekst");
    await page.keyboard.press("Control+z");
    await expect(row(page, "A").getByTestId("cell-status")).toContainText("Done");
  });
});

test.describe("keyboard navigation", () => {
  test("arrows, Enter, typing, Delete, Tab, Space and copy/paste", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const b = await createBoard(page.context().request, { groups: [{ title: "Eerste", items: ["A", "B", "C"] }], columns: [{ title: "Notitie", type: "text", key: "notitie" }] });
    await openTestBoard(page, b.boardId);
    const cell = (name: string, key: string) => row(page, name).getByTestId(`cell-${key}`);
    const focused = page.locator('[data-focused="true"]');

    // click opens the inline editor; Enter commits and keeps the cell focused
    await cell("A", "notitie").click();
    await page.getByTestId("cell-input").fill("een");
    await page.getByTestId("cell-input").press("Enter");
    await expect(cell("A", "notitie")).toContainText("een");
    await expect(focused).toHaveCount(1);
    await page.locator('[data-testid="board-table"]').focus();

    await page.keyboard.press("ArrowDown");
    await expect(cell("B", "notitie")).toHaveAttribute("data-focused", "true");
    await page.keyboard.press("ArrowDown");
    await expect(cell("C", "notitie")).toHaveAttribute("data-focused", "true");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowLeft");
    await expect(cell("B", "date")).toHaveAttribute("data-focused", "true");
    await page.keyboard.press("ArrowRight");

    // typing starts editing with the typed characters
    await page.keyboard.press("x");
    await expect(page.getByTestId("cell-input")).toHaveValue("x");
    await page.keyboard.type("yz");
    await page.getByTestId("cell-input").press("Enter");
    await expect(cell("B", "notitie")).toContainText("xyz");

    // Enter edits the existing value, Escape cancels
    await page.locator('[data-testid="board-table"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("cell-input")).toHaveValue("xyz");
    await expect(page.getByTestId("cell-input")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("cell-input")).toHaveCount(0);
    await expect(cell("B", "notitie")).toContainText("xyz");

    // copy B -> paste on C, Delete clears A
    await page.locator('[data-testid="board-table"]').focus();
    await page.keyboard.press("Control+c");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Control+v");
    await expect(cell("C", "notitie")).toContainText("xyz");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Delete");
    await expect(cell("A", "notitie")).not.toContainText("een");

    // Tab moves right, Space selects the row, Escape clears
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Tab");
    await expect(cell("A", "notitie")).toHaveAttribute("data-focused", "true");
    await page.keyboard.press("Space");
    await expect(page.getByTestId("bulk-count")).toContainText("1");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("bulk-bar")).toHaveCount(0);

    // Tab inside an open inline editor commits and moves on
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.getByTestId("cell-input").fill("tabbed");
    await page.keyboard.press("Tab");
    await expect(cell("B", "notitie")).toContainText("tabbed");
    await page.reload();
    await expect(cell("B", "notitie")).toContainText("tabbed");
    await expect(cell("C", "notitie")).toContainText("xyz");
    expect(errors).toEqual([]);
  });

  test("Enter on the name cell renames the item", async ({ page }) => {
    const b = await createBoard(page.context().request, { groups: [{ title: "Eerste", items: ["A", "B"] }] });
    await openTestBoard(page, b.boardId);
    await row(page, "A").getByTestId("cell-name").click({ position: { x: 4, y: 4 } });
    await page.locator('[data-testid="board-table"]').focus();
    await page.keyboard.press("Enter");
    await page.getByTestId("item-name-input").fill("A2");
    await page.getByTestId("item-name-input").press("Enter");
    await expect(row(page, "A2")).toBeVisible();
  });
});

test.describe("screenshots for the manual", () => {
  test("bulk bar, drag preview and subitems", async ({ page }) => {
    const b = await createBoard(page.context().request, { name: "Projectoverzicht", groups: [{ title: "Actief", items: ["Website vernieuwen", "Offerte versturen", "Kick-off plannen"] }, { title: "Gepland", items: ["Evaluatie"] }] });
    await page.context().request.post("/api/v1/items", { data: { boardId: b.boardId, parentItemId: b.items["Website vernieuwen"], name: "Ontwerp goedkeuren" } });
    await page.context().request.post("/api/v1/items", { data: { boardId: b.boardId, parentItemId: b.items["Website vernieuwen"], name: "Teksten aanleveren" } });
    await openTestBoard(page, b.boardId);
    await row(page, "Website vernieuwen").getByTestId("expand-subitems").click();
    await expect(page.getByTestId("subitem-table")).toBeVisible();
    await page.screenshot({ path: "docs/handleiding/img/tableux-grid-subitems.png" });
    await row(page, "Offerte versturen").getByTestId("row-checkbox").click();
    await row(page, "Kick-off plannen").getByTestId("row-checkbox").click();
    await expect(page.getByTestId("bulk-bar")).toBeVisible();
    await page.screenshot({ path: "docs/handleiding/img/tableux-grid-bulk.png" });
    await page.getByTestId("bulk-clear").click();
    const r = row(page, "Evaluatie");
    await r.hover();
    const h = await r.getByTestId("row-drag-handle").boundingBox();
    const t = await row(page, "Offerte versturen").boundingBox();
    await page.mouse.move(h!.x + 7, h!.y + 11);
    await page.mouse.down();
    await page.mouse.move(h!.x + 40, h!.y - 30, { steps: 5 });
    await page.mouse.move(t!.x + 300, t!.y + t!.height - 4, { steps: 10 });
    await expect(page.getByTestId("drag-overlay")).toBeVisible();
    await page.screenshot({ path: "docs/handleiding/img/tableux-grid-drag.png" });
    await page.mouse.up();
    await page.screenshot({ path: "docs/design/tableux/tableux-grid-after-drag.png" });
  });
});

test.describe("pinned columns and sticky parts", () => {
  test("a pinned column and the name column stay put while scrolling horizontally; the header sticks while scrolling vertically", async ({ page }) => {
    const cols = ["c1", "c2", "c3", "c4", "c5", "c6"].map((k) => ({ title: k.toUpperCase(), type: "text", key: k }));
    const items = Array.from({ length: 40 }, (_, i) => `Rij ${i + 1}`);
    const b = await createBoard(page.context().request, { groups: [{ title: "Eerste", items }], columns: cols });
    const req = page.context().request;
    const views = (await (await req.get(`/api/v1/boards/${b.boardId}/views`)).json()) as { id: string; settings: Record<string, unknown> }[];
    await req.patch(`/api/v1/views/${views[0].id}`, { data: { settings: { ...views[0].settings, pinnedColumnIds: [b.columns.c1] } } });
    await openTestBoard(page, b.boardId);
    const x = async (testId: string) => Math.round((await group(page, "Eerste").getByTestId(testId).first().boundingBox())!.x);
    const nameX = await x("col-header-name");
    const pinnedX = await x("col-header-c1");
    const freeX = await x("col-header-c3");
    await page.getByTestId("board-table").evaluate((el) => { el.scrollLeft = 500; });
    await expect.poll(() => x("col-header-c3")).toBeLessThan(freeX - 300);
    expect(await x("col-header-name")).toBe(nameX);
    expect(await x("col-header-c1")).toBe(pinnedX);
    // the pinned cell sits in the rows too
    expect(Math.round((await row(page, "Rij 1").getByTestId("cell-c1").boundingBox())!.x)).toBe(pinnedX);
    // vertical: the header row of the group sticks to the top of the scroll area
    await page.getByTestId("board-table").evaluate((el) => { el.scrollTop = 600; });
    const box = await group(page, "Eerste").getByTestId("header-row").boundingBox();
    const area = await page.getByTestId("board-table").boundingBox();
    expect(Math.abs(box!.y - area!.y)).toBeLessThan(12);
    await page.screenshot({ path: "docs/design/tableux/tableux-grid-pinned.png" });
  });
});
