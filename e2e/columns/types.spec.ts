import {collectConsoleErrors, login, resetDb } from "../fixtures";
import { addColumnViaCenter, cellOf, gotoBoard, makeBoard, expect, SLOW, test } from "./helpers";

test.describe.configure({ timeout: SLOW });
test.describe("column types through the Column center", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetDb(request);
    await login(page, "admin");
  });

  test("Column center: categories, search and add", async ({ page, request }) => {
    const errors = collectConsoleErrors(page);
    const { boardId } = await makeBoard(page.context().request, "Centrum test");
    await gotoBoard(page, boardId);
    await page.getByTestId("add-column").click();
    await expect(page.getByTestId("column-center")).toBeVisible();
    await expect(page.getByTestId("add-column-status")).toBeVisible();
    await page.getByTestId("column-center-cat-essentials").click();
    await expect(page.getByTestId("add-column-timeline")).toBeVisible();
    await expect(page.getByTestId("add-column-formula")).toHaveCount(0);
    await page.getByTestId("column-center-cat-super_useful").click();
    await expect(page.getByTestId("add-column-formula")).toBeVisible();
    await expect(page.getByTestId("add-column-status")).toHaveCount(0);
    await page.getByTestId("column-center-cat-all").click();
    await page.getByTestId("column-center-search").fill("timer");
    await expect(page.getByTestId("add-column-time_tracking")).toBeVisible();
    await expect(page.getByTestId("add-column-status")).toHaveCount(0);
    await page.getByTestId("column-center-search").fill("");
    await page.getByTestId("add-column-rating").click();
    await expect(page.getByTestId("col-header-rating")).toBeVisible();
    expect(request).toBeTruthy();
    expect(errors).toEqual([]);
  });

  test("date, text and number-like types: edit, reload, persisted", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const { boardId } = await makeBoard(page.context().request, "Types A");
    await gotoBoard(page, boardId);

    await addColumnViaCenter(page, "timeline");
    await cellOf(page, "timeline").click();
    await page.getByTestId("timeline-from").fill("2026-10-05");
    await page.getByTestId("timeline-to").fill("2026-10-09");
    await page.getByTestId("timeline-save").click();
    await expect(cellOf(page, "timeline")).toContainText(/5 - 9 okt/);

    await addColumnViaCenter(page, "week");
    await cellOf(page, "week").click();
    await page.getByTestId("week-input").fill("2026-W41");
    await expect(cellOf(page, "week")).toContainText("Week 41");
    await page.keyboard.press("Escape");

    await addColumnViaCenter(page, "hour");
    await cellOf(page, "hour").click();
    await page.getByTestId("hour-input").fill("14:30");
    await page.getByTestId("hour-save").click();
    await expect(cellOf(page, "hour")).toContainText("14:30");

    await addColumnViaCenter(page, "world_clock");
    await cellOf(page, "world_clock").click();
    await page.getByTestId("clock-search").fill("Tokyo");
    await page.getByTestId("clock-option-Asia/Tokyo").click();
    await expect(cellOf(page, "world_clock")).toContainText("Tokyo");

    await addColumnViaCenter(page, "rating");
    await cellOf(page, "rating").getByTestId("rating-4").click();
    await expect(cellOf(page, "rating").locator('[class*="starOn"]')).toHaveCount(4);

    await addColumnViaCenter(page, "vote");
    await cellOf(page, "vote").getByTestId("vote-button").click();
    await expect(cellOf(page, "vote").getByTestId("vote-count")).toHaveText("1");

    await addColumnViaCenter(page, "email");
    await cellOf(page, "email").click();
    await page.getByTestId("cell-input").fill("test@example.com");
    await page.getByTestId("cell-input").press("Enter");
    await expect(cellOf(page, "email").locator('a[href="mailto:test@example.com"]')).toBeVisible();

    await addColumnViaCenter(page, "phone");
    await cellOf(page, "phone").click();
    await page.getByTestId("cell-input").fill("+31 6 12345678");
    await page.getByTestId("cell-input").press("Enter");
    await expect(cellOf(page, "phone")).toContainText("+31 6 12345678");

    await addColumnViaCenter(page, "location");
    await cellOf(page, "location").click();
    await page.getByTestId("location-address").fill("Amsterdam Centraal");
    await page.getByTestId("location-save").click();
    await expect(cellOf(page, "location")).toContainText("Amsterdam Centraal");

    await addColumnViaCenter(page, "country");
    await cellOf(page, "country").click();
    await page.getByTestId("country-search").fill("Nederland");
    await page.getByTestId("country-option-NL").click();
    await expect(cellOf(page, "country")).toContainText("Nederland");

    await addColumnViaCenter(page, "color_picker");
    await cellOf(page, "color_picker").click();
    await page.getByTestId("color-00c875").click();
    await expect(cellOf(page, "color_picker").getByTestId("color-swatch")).toBeVisible();
    await page.keyboard.press("Escape");

    // everything survives a reload
    await page.reload();
    await expect(page.getByTestId("board-page")).toBeVisible();
    await expect(cellOf(page, "timeline")).toContainText(/5 - 9 okt/);
    await expect(cellOf(page, "week")).toContainText("Week 41");
    await expect(cellOf(page, "hour")).toContainText("14:30");
    await expect(cellOf(page, "world_clock")).toContainText("Tokyo");
    await expect(cellOf(page, "rating").locator('[class*="starOn"]')).toHaveCount(4);
    await expect(cellOf(page, "vote").getByTestId("vote-count")).toHaveText("1");
    await expect(cellOf(page, "email").locator('a[href="mailto:test@example.com"]')).toBeVisible();
    await expect(cellOf(page, "phone")).toContainText("+31 6 12345678");
    await expect(cellOf(page, "location")).toContainText("Amsterdam Centraal");
    await expect(cellOf(page, "country")).toContainText("Nederland");
    await expect(cellOf(page, "color_picker").getByTestId("color-swatch")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("tags, dependency, button, time tracking, doc", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const { boardId } = await makeBoard(page.context().request, "Types B", ["Eerste item", "Tweede item"]);
    await gotoBoard(page, boardId);

    await addColumnViaCenter(page, "tags");
    await cellOf(page, "tags").click();
    await page.getByTestId("tags-search").fill("Urgent");
    await page.getByTestId("tags-search").press("Enter");
    await expect(page.getByTestId("tag-option-Urgent")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(cellOf(page, "tags").getByTestId("tag-chip")).toHaveText("Urgent");

    await addColumnViaCenter(page, "dependency");
    await cellOf(page, "dependency").click();
    await page.getByTestId("item-picker-option").filter({ hasText: "Tweede item" }).click();
    await page.keyboard.press("Escape");
    await expect(cellOf(page, "dependency").getByTestId("relation-chip")).toHaveText("Tweede item");
    // a cycle is rejected by the server (400 is expected, the browser logs it as a console error): the dependency is not stored
    expect(errors).toEqual([]);
    await cellOf(page, "dependency", "Tweede item").click();
    await page.getByTestId("item-picker-option").filter({ hasText: "Eerste item" }).click();
    await page.keyboard.press("Escape");
    await expect(cellOf(page, "dependency", "Tweede item").getByTestId("relation-chip")).toHaveCount(0);
    errors.splice(0, errors.length, ...errors.filter((e) => !/status of 400/.test(e)));

    await addColumnViaCenter(page, "button");
    const clicked = page.waitForResponse((r) => /\/values\/\d+\/action$/.test(r.url()) && r.request().method() === "POST");
    await cellOf(page, "button").getByTestId("button-cell").click();
    expect((await clicked).ok()).toBeTruthy();

    await addColumnViaCenter(page, "time_tracking");
    await cellOf(page, "time_tracking").getByTestId("time-start").click();
    await expect(cellOf(page, "time_tracking").getByTestId("time-stop")).toBeVisible();
    await page.waitForTimeout(2200);
    await cellOf(page, "time_tracking").getByTestId("time-stop").click();
    await expect(cellOf(page, "time_tracking").getByTestId("time-start")).toBeVisible();
    await expect(cellOf(page, "time_tracking").getByTestId("time-text")).not.toHaveText("0:00:00");
    // manual entry
    await cellOf(page, "time_tracking").getByTestId("time-text").click();
    await page.getByTestId("time-hours").fill("1");
    await page.getByTestId("time-minutes").fill("30");
    await page.getByTestId("time-add").click();
    await expect(page.getByTestId("time-total")).toContainText("1:3");
    await page.keyboard.press("Escape");

    await addColumnViaCenter(page, "doc");
    await cellOf(page, "doc").getByTestId("doc-create").click();
    await expect(page).toHaveURL(/\/docs\/\d+/, { timeout: 15_000 });
    await gotoBoard(page, boardId);
    await expect(cellOf(page, "doc").getByTestId("doc-chip")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("board-page")).toBeVisible();
    await expect(cellOf(page, "tags").getByTestId("tag-chip")).toHaveText("Urgent");
    await expect(cellOf(page, "dependency").getByTestId("relation-chip")).toHaveText("Tweede item");
    await expect(cellOf(page, "time_tracking").getByTestId("time-text")).toContainText("1:3");
    expect(errors).toEqual([]);
  });

  test("computed types: auto number, item id, creation log, last updated, progress, assignees, formula", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const { boardId } = await makeBoard(page.context().request, "Types C", ["Eerste item", "Tweede item"]);
    await gotoBoard(page, boardId);
    await addColumnViaCenter(page, "auto_number");
    await expect(cellOf(page, "auto_number").getByTestId("auto-number")).toHaveText("1");
    await expect(cellOf(page, "auto_number", "Tweede item").getByTestId("auto-number")).toHaveText("2");
    await addColumnViaCenter(page, "item_id");
    await expect(cellOf(page, "item_id").getByTestId("item-id")).toHaveText(/^\d{10}$/);
    await addColumnViaCenter(page, "creation_log");
    await expect(cellOf(page, "creation_log")).not.toBeEmpty();
    await addColumnViaCenter(page, "last_updated");
    await expect(cellOf(page, "last_updated")).not.toBeEmpty();
    await addColumnViaCenter(page, "item_assignees");
    await addColumnViaCenter(page, "progress");
    await expect(page.getByTestId("col-header-progress")).toBeVisible();
    await page.reload();
    await expect(cellOf(page, "auto_number").getByTestId("auto-number")).toHaveText("1");
    expect(errors).toEqual([]);
  });
});
