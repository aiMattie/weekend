import type { Page } from "@playwright/test";
import { boardIdByName, collectConsoleErrors, expect, login, newUserPage, openBoard, resetDb, test } from "../fixtures";
import { settle, shot } from "./shots";

/** Screenshots for docs/handleiding/01-workspaces-en-boards.md and 04-itempaneel-en-updates.md (npm run manuals). */
test.skip(!process.env.RUN_MANUALS, "manual screenshots only run with RUN_MANUALS=1");
test.use({ actionTimeout: 20_000, navigationTimeout: 60_000 }); // fail fast: a hanging step must not block the shared e2e lock

const row = (page: Page, name: string) => page.locator(`[data-testid="item-row"][data-item-name="${name}"]`);

test("handleiding workspaces en boards: screenshots", async ({ page, request }) => {
  test.setTimeout(420_000);
  const errors = collectConsoleErrors(page);
  await resetDb(request);
  await login(page, "admin");

  // add board dialog with a template
  await page.goto("/");
  await page.getByTestId("sidebar-add").click();
  await page.getByTestId("add-board").click();
  await expect(page.getByTestId("add-board-dialog")).toBeVisible();
  await page.getByTestId("add-board-name").fill("Mijn project");
  await page.getByTestId("template-search").fill("project");
  await page.getByTestId("template-project-management").click();
  await expect(page.getByTestId("template-preview")).toContainText("Gepland");
  await settle(page, 300);
  await shot(page, "tableux-chrome-add-board");
  await page.getByTestId("add-board-submit").click();
  await expect(page.getByTestId("board-title")).toContainText("Mijn project");

  // workspace page
  await page.goto("/");
  await page.getByTestId("sidebar-add").click();
  await page.getByTestId("add-workspace").click();
  await page.getByTestId("workspace-name").fill("Mijn workspace");
  await page.getByTestId("workspace-description").fill("Voor een team of een klant");
  await page.getByTestId("workspace-kind-closed").check();
  await page.getByTestId("workspace-submit").click();
  await expect(page.getByTestId("workspace-page")).toContainText("Mijn workspace");
  await settle(page);
  await shot(page, "tableux-chrome-workspace");

  // board info and settings
  await openBoard(page, "Klanten");
  await page.getByTestId("board-info-button").click();
  await expect(page.getByTestId("board-info-panel")).toBeVisible();
  await settle(page, 400);
  await shot(page, "tableux-chrome-info");
  await page.getByTestId("info-close").click();
  await page.getByTestId("board-menu").click();
  await page.getByTestId("menu-settings").click();
  await expect(page.getByTestId("board-settings-dialog")).toBeVisible();
  await page.getByTestId("settings-tab-permissions").click();
  await settle(page, 300);
  await shot(page, "tableux-chrome-settings");
  await page.keyboard.press("Escape");

  // filter popover with two rules
  await openBoard(page, "Klanten");
  await page.getByTestId("toolbar-filter").click();
  await expect(page.getByTestId("filter-popover")).toBeVisible();
  await page.getByTestId("filter-add").click();
  await page.getByTestId("filter-rule").nth(0).getByTestId("filter-column").selectOption({ label: "Status" });
  await page.getByTestId("filter-rule").nth(0).getByTestId("filter-op").selectOption({ label: "is een van" });
  await page.locator('[data-testid="filter-operand-option"][data-label="Done"]').click();
  await page.getByTestId("filter-add").click();
  await page.getByTestId("filter-rule").nth(1).getByTestId("filter-column").selectOption({ label: "Uurtarief dev" });
  await page.getByTestId("filter-rule").nth(1).getByTestId("filter-op").selectOption({ label: "is groter dan" });
  await page.getByTestId("filter-rule").nth(1).getByTestId("filter-operand").fill("90");
  await settle(page, 400);
  await shot(page, "tableux-filter");
  await page.keyboard.press("Escape");

  // archive
  await page.getByTestId("board-menu").click();
  await page.getByTestId("menu-archive").click();
  await page.getByTestId("confirm-ok").click();
  await expect(page.getByTestId("home-page")).toBeVisible();
  await page.getByTestId("nav-archive").click();
  await expect(page.getByTestId("archive-page")).toBeVisible();
  await expect(page.getByTestId("trash-row").filter({ hasText: "Klanten" })).toBeVisible();
  await settle(page, 400);
  await shot(page, "tableux-chrome-archive");
  await page.getByTestId("trash-row").filter({ hasText: "Klanten" }).getByTestId("restore").click();
  await openBoard(page, "Klanten");

  // trash
  await page.getByTestId("board-menu").click();
  await page.getByTestId("board-delete").click();
  await page.getByTestId("confirm-ok").click();
  await expect(page.getByTestId("home-page")).toBeVisible();
  await page.goto("/trash");
  await expect(page.getByTestId("trash-row").filter({ hasText: "Klanten" })).toBeVisible();
  await settle(page, 400);
  await shot(page, "tableux-chrome-trash");
  await page.getByTestId("trash-row").filter({ hasText: "Klanten" }).getByTestId("restore").click();
  expect(errors.filter((e) => !/status of 404/.test(e))).toEqual([]); // stale fetches after archive/delete
});

test("handleiding itempaneel: screenshots", async ({ page, browser, baseURL, request }) => {
  test.setTimeout(420_000);
  const errors = collectConsoleErrors(page);
  await resetDb(request);
  await login(page, "admin");
  const boardId = await boardIdByName(page.context().request, "Klanten");
  const full = (await (await page.context().request.get(`/api/v1/boards/${boardId}/full`)).json()) as { items: { id: string; name: string }[] };
  const delta = full.items.find((i) => i.name === "Delta")!.id;
  await page.goto(`/boards/${boardId}`);
  await expect(page.getByTestId("board-page")).toBeVisible();

  // status change by Admin, rate change by Builder (for the activity log)
  await row(page, "Delta").getByTestId("cell-status").click();
  await page.getByTestId("status-option").filter({ hasText: "Done" }).first().click();
  await expect(row(page, "Delta").getByTestId("cell-status")).toContainText("Done");
  const dev1 = await newUserPage(browser, baseURL, "dev1");
  expect((await dev1.context.request.put(`/api/v1/items/${delta}/values`, { data: { uurtarief_dev: 111 } })).ok()).toBeTruthy();
  await dev1.context.close();

  await row(page, "Delta").hover();
  await row(page, "Delta").getByTestId("update-bubble").click();
  await expect(page.getByTestId("item-panel")).toBeVisible();

  // update with bold text and a mention
  await page.getByTestId("update-editor").click();
  await page.getByTestId("tb-bold").click();
  await page.keyboard.type("Belangrijk ");
  await page.getByTestId("tb-bold").click();
  await page.keyboard.type("Hallo @Bu");
  const opt = page.getByTestId("mention-option").filter({ hasText: "Builder" }).first();
  await expect(opt).toBeVisible();
  await settle(page, 300);
  await shot(page, "tableux-panel-mention");
  await opt.click();
  await page.keyboard.type(" kijk even mee");
  await page.getByTestId("update-submit").click();
  await expect(page.getByTestId("update-card").first()).toContainText("kijk even mee");
  await settle(page, 400);
  await shot(page, "tableux-panel-updates");

  // files
  await page.getByTestId("tab-files").click();
  await page.getByTestId("files-input").setInputFiles({ name: "notities.txt", mimeType: "text/plain", buffer: Buffer.from("hallo wereld") });
  await expect(page.getByTestId("file-row").filter({ hasText: "notities.txt" })).toBeVisible();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.getByTestId("files-input").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("file-row")).toHaveCount(2);
  await settle(page, 400);
  await shot(page, "tableux-panel-files");

  // activity log filtered on a column
  await page.getByTestId("tab-activity").click();
  await expect(page.getByTestId("activity-row").first()).toBeVisible();
  await page.getByTestId("activity-filter-column").selectOption({ label: "Status" });
  await settle(page, 400);
  await shot(page, "tableux-panel-activity");

  // details and the actions menu
  await page.getByTestId("tab-updates").click();
  await page.getByTestId("panel-details-toggle").click();
  await expect(page.getByTestId("panel-field-status")).toBeVisible();
  await page.getByTestId("panel-menu").click();
  await settle(page, 400);
  await shot(page, "tableux-panel-details");
  expect(errors).toEqual([]);
});
