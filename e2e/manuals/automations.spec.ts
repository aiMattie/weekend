import path from "node:path";
import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";
import { createTestBoard, openCenter, setStatus, startReceiver, openLog } from "../automations/helpers";

/** Screenshots for docs/handleiding/05-automations.md (npm run manuals). */
const IMG = path.join(process.cwd(), "docs/handleiding/img");
const shot = (page: import("@playwright/test").Page, name: string) => page.screenshot({ path: path.join(IMG, `automations-${name}.png`) });

test.skip(!process.env.RUN_MANUALS, "manual screenshots only run with RUN_MANUALS=1");

test("handleiding automations: screenshots", async ({ page, request }) => {
  test.setTimeout(600_000);
  const errors = collectConsoleErrors(page);
  const seed = await resetDb(request);
  await login(page, "admin");
  const tb = await createTestBoard(page.request, seed.workspaceIds["Delivery"], "Klantprojecten");

  await openCenter(page, tb.boardId);
  await expect(page.locator('[data-testid^="recipe-card-"]').first()).toBeVisible();
  await shot(page, "center");
  await page.getByTestId("auto-search").locator("input").fill("verplaats het item naar");
  await expect(page.getByTestId("recipe-card-notify-status")).toHaveCount(0);
  const card = page.getByTestId("recipe-card-status-move-group");
  await card.getByTestId("token-status-move-group-group").selectOption({ label: "Afgerond" });
  await shot(page, "recipe");
  await card.getByTestId("recipe-add-status-move-group").click();
  await expect(page.getByTestId("auto-toast")).toBeVisible();

  await page.getByTestId("auto-tab-builder").click();
  await page.getByTestId("builder-trigger-block").selectOption("item_created");
  await page.getByTestId("builder-add-condition").click();
  await page.getByTestId("builder-cond-0-block").selectOption("column_is_empty");
  await page.getByTestId("builder-cond-0-columnId").selectOption({ label: "Owner" });
  await page.getByTestId("builder-add-action").click();
  await page.getByTestId("builder-action-0-block").selectOption("create_update");
  await page.getByTestId("builder-action-0-text").fill("Welkom bij {item}");
  await page.getByTestId("builder-name").fill("Welkomstupdate");
  await shot(page, "builder");
  await page.getByTestId("builder-save").click();
  await expect(page.getByTestId("auto-manage")).toBeVisible();
  await shot(page, "manage");

  await setStatus(page.request, tb.itemId, tb.columns.status.id, "Done");
  await expect.poll(async () => (await (await page.request.get(`/api/v1/items/${tb.itemId}`)).json()).groupId).toBe(tb.groups.Afgerond);
  await openLog(page);
  await expect(page.getByTestId("run-row").first()).toBeVisible();
  await shot(page, "log");

  await page.goto("/workflows");
  await page.getByTestId("wf-new-board").selectOption(tb.boardId);
  await page.getByTestId("wf-new-name").fill("Goedkeuring nieuwe items");
  await page.getByTestId("wf-new").click();
  await expect(page.getByTestId("workflow-editor")).toBeVisible();
  await page.getByTestId("wf-add-approval-0-1").click();
  await page.getByTestId("wf-add-branch-0-2").click();
  await shot(page, "workflow");

  const receiver = await startReceiver();
  await page.goto("/integrations");
  await expect(page.getByTestId("integrations-page")).toBeVisible();
  await page.getByTestId("int-connect-webhook_in").click();
  await page.getByTestId("wh-add").click();
  await page.getByTestId("wh-url").fill(receiver.url);
  await page.getByTestId("integrations-page").evaluate((el) => el.scrollTo(0, 0));
  await shot(page, "integrations");
  await receiver.close();
  expect(errors, errors.join("\n")).toEqual([]);
});
