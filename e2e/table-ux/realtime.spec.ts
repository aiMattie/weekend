import { collectConsoleErrors, expect, login, newUserPage, resetDb, test } from "../fixtures";
import { createBoard, dragRow, group, openTestBoard, order, row } from "./grid-helpers";

test.setTimeout(600_000);

test("two browsers see creates, drags, value changes and deletes live", async ({ page, browser, baseURL, request }) => {
  await resetDb(request);
  await login(page, "admin");
  const errors = collectConsoleErrors(page);
  const b = await createBoard(page.context().request, { groups: [{ title: "Eerste", items: ["A", "B"] }, { title: "Tweede", items: ["X"] }] });
  const other = await newUserPage(browser, baseURL, "pm1");
  await openTestBoard(page, b.boardId);
  await other.page.goto(`/boards/${b.boardId}`);
  await expect(other.page.getByTestId("board-table")).toBeVisible();

  // create
  await group(page, "Eerste").getByTestId("add-item").click();
  await page.getByTestId("add-item-input").fill("Live item");
  await page.getByTestId("add-item-input").press("Enter");
  await expect(row(other.page, "Live item")).toBeVisible();

  // drag across groups on A, seen on B
  await dragRow(page, "A", row(page, "X"), "bottom");
  await expect.poll(() => order(other.page, "Tweede")).toEqual(["X", "A"]);

  // value change on B, seen on A
  await row(other.page, "B").getByTestId("cell-status").click();
  await other.page.getByTestId("status-option").filter({ hasText: "Stuck" }).first().click();
  await expect(row(page, "B").getByTestId("cell-status")).toContainText("Stuck");

  // undo on A only touches A's own actions (the drag) and B follows
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+z");
  await expect.poll(() => order(other.page, "Eerste")).toContain("A");

  // delete on B, gone on A
  await row(other.page, "Live item").hover();
  await row(other.page, "Live item").getByTestId("row-menu").click();
  await other.page.getByTestId("row-delete").click();
  await expect(row(page, "Live item")).toHaveCount(0);
  await other.context.close();
  expect(errors).toEqual([]);
});
