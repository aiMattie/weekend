import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";
import { createBoard, dragRow, dragTo, group, openTestBoard, order, persistedOrder, row } from "./grid-helpers";

test.setTimeout(600_000);

test.describe("drag and drop", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetDb(request);
    await login(page, "admin");
  });

  test("reorders rows within a group and persists after reload", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const b = await createBoard(page.context().request, { groups: [{ title: "Alpha", items: ["A", "B", "C", "D"] }] });
    await openTestBoard(page, b.boardId);
    expect(await order(page, "Alpha")).toEqual(["A", "B", "C", "D"]);
    await dragRow(page, "A", row(page, "C"), "bottom");
    await expect.poll(() => order(page, "Alpha")).toEqual(["B", "C", "A", "D"]);
    await dragRow(page, "D", row(page, "B"), "top");
    await expect.poll(() => order(page, "Alpha")).toEqual(["D", "B", "C", "A"]);
    await expect.poll(async () => (await persistedOrder(page.context().request, b.boardId)).Alpha).toEqual(["D", "B", "C", "A"]);
    await page.reload();
    await expect(page.getByTestId("board-table")).toBeVisible();
    expect(await order(page, "Alpha")).toEqual(["D", "B", "C", "A"]);
    expect(errors).toEqual([]);
  });

  test("drags a row across groups, onto an empty group and onto a collapsed group", async ({ page }) => {
    const b = await createBoard(page.context().request, { groups: [{ title: "Eerste", items: ["A", "B", "C"] }, { title: "Tweede", items: ["X", "Y"] }, { title: "Leeg", items: [] }] });
    await openTestBoard(page, b.boardId);
    await dragRow(page, "B", row(page, "Y"), "top");
    await expect.poll(() => order(page, "Tweede")).toEqual(["X", "B", "Y"]);
    expect(await order(page, "Eerste")).toEqual(["A", "C"]);
    // empty group: drop on its "+ Add item" row
    await dragRow(page, "A", group(page, "Leeg").getByTestId("add-item-row"));
    await expect.poll(() => order(page, "Leeg")).toEqual(["A"]);
    // collapsed group: drop on its header (the board refetches after each drag; retry the toggle until it sticks)
    await expect.poll(async () => (await persistedOrder(page.context().request, b.boardId)).Leeg).toEqual(["A"]);
    const rows = group(page, "Eerste").locator('[data-testid="item-row"]');
    await expect(async () => {
      if ((await rows.count()) > 0) await group(page, "Eerste").getByTestId("group-toggle").click();
      await expect(rows).toHaveCount(0, { timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await dragRow(page, "X", group(page, "Eerste").getByTestId("group-header"));
    await expect.poll(async () => (await persistedOrder(page.context().request, b.boardId)).Eerste).toEqual(["C", "X"]);
    await expect(async () => {
      if ((await rows.count()) === 0) await group(page, "Eerste").getByTestId("group-toggle").click();
      await expect(rows).toHaveCount(2, { timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await expect.poll(() => order(page, "Eerste")).toEqual(["C", "X"]);
    await page.reload();
    expect(await order(page, "Tweede")).toEqual(["B", "Y"]);
    expect(await order(page, "Leeg")).toEqual(["A"]);
  });

  test("undo and redo of a drag restore the exact position", async ({ page }) => {
    const b = await createBoard(page.context().request, { groups: [{ title: "Eerste", items: ["A", "B", "C"] }, { title: "Tweede", items: ["X"] }] });
    await openTestBoard(page, b.boardId);
    await dragRow(page, "A", row(page, "X"), "bottom");
    await expect.poll(() => order(page, "Tweede")).toEqual(["X", "A"]);
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+z");
    await expect.poll(() => order(page, "Eerste")).toEqual(["A", "B", "C"]);
    await expect(page.getByTestId("undo-toast")).toContainText("Ongedaan gemaakt");
    await page.keyboard.press("Control+Shift+z");
    await expect.poll(() => order(page, "Tweede")).toEqual(["X", "A"]);
    expect((await persistedOrder(page.context().request, b.boardId)).Eerste).toEqual(["B", "C"]);
  });

  test("reorders groups with the group handle", async ({ page }) => {
    const b = await createBoard(page.context().request, { groups: [{ title: "Een", items: ["A"] }, { title: "Twee", items: ["B"] }, { title: "Drie", items: ["C"] }] });
    await openTestBoard(page, b.boardId);
    const handle = group(page, "Een").getByTestId("group-header");
    await handle.hover();
    await dragTo(page, group(page, "Een").getByTestId("group-drag-handle"), group(page, "Drie"), "bottom");
    await expect.poll(async () => Object.keys(await persistedOrder(page.context().request, b.boardId))).toEqual(["Twee", "Drie", "Een"]);
    await page.reload();
    await expect(page.locator("section[data-group-title]").first()).toHaveAttribute("data-group-title", "Twee");
  });

  test("reorders columns by dragging the header and persists the order", async ({ page }) => {
    const b = await createBoard(page.context().request, { groups: [{ title: "Alpha", items: ["A"] }], columns: [{ title: "Notitie", type: "text", key: "notitie" }] });
    await openTestBoard(page, b.boardId);
    const headers = () => group(page, "Alpha").locator('[data-testid^="col-header-"]:not([data-testid="col-header-name"])').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid));
    const before = await headers();
    expect(before.at(-1)).toBe("col-header-notitie");
    const wrap = group(page, "Alpha").locator('[data-testid="col-header-notitie"]');
    await dragTo(page, wrap, group(page, "Alpha").locator('[data-testid="col-header-people"]'), "center");
    await expect.poll(headers).toEqual(["col-header-notitie", ...before.slice(0, -1)]);
    // optimistic UI: wait until the server has the new order before reloading
    await expect.poll(async () => {
      const cols = (await (await page.context().request.get(`/api/v1/boards/${b.boardId}/columns`)).json()) as { id: string; key: string; scope: string; position: number }[];
      return cols.filter((c) => c.scope === "item").sort((x, y) => x.position - y.position).map((c) => c.key).slice(0, 2);
    }).toEqual(["name", "notitie"]);
    await page.reload();
    await expect(page.getByTestId("board-table")).toBeVisible();
    expect((await headers())[0]).toBe("col-header-notitie");
  });
});
