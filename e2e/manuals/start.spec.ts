import { collectConsoleErrors, expect, login, newUserPage, resetDb, test } from "../fixtures";
import { settle, shot } from "./shots";

/** Screenshots for docs/handleiding/00-aan-de-slag.md (npm run manuals). Doubles as a check of the quick start steps. */
test.skip(!process.env.RUN_MANUALS, "manual screenshots only run with RUN_MANUALS=1");
test.use({ actionTimeout: 20_000, navigationTimeout: 60_000 }); // fail fast: a hanging step must not block the shared e2e lock

test("handleiding aan de slag: screenshots", async ({ page, browser, baseURL, request }) => {
  test.setTimeout(420_000);
  const errors = collectConsoleErrors(page);
  await resetDb(request);

  // 1. login page (no session)
  const anon = await browser.newContext({ baseURL, locale: "nl-NL", viewport: { width: 1440, height: 900 } });
  const lp = await anon.newPage();
  await lp.goto("/login");
  await expect(lp.getByTestId("login-submit")).toBeEnabled();
  await lp.getByTestId("login-email").fill("admin@example.com");
  await settle(lp, 300);
  await shot(lp, "start-login");
  await anon.close();

  // 2. home
  await login(page, "admin");
  await page.goto("/");
  await expect(page.getByTestId("home-page")).toBeVisible();
  await settle(page);
  await shot(page, "start-home");

  // 3. new board from a template
  await page.getByTestId("sidebar-add").click();
  await page.getByTestId("add-board").click();
  await page.getByTestId("add-board-name").fill("Mijn eerste board");
  await page.getByTestId("template-task-tracker").click();
  await settle(page, 400);
  await shot(page, "start-nieuw-board");
  await page.getByTestId("add-board-submit").click();
  await expect(page.getByTestId("board-title")).toContainText("Mijn eerste board");
  await settle(page);
  await shot(page, "start-board");

  // 4. item + status
  await page.getByTestId("add-item").first().click();
  const input = page.getByTestId("add-item-input").first();
  await input.fill("Offerte versturen");
  await input.press("Enter");
  const row = page.locator('[data-testid="item-row"][data-item-name="Offerte versturen"]');
  await expect(row).toBeVisible();
  await row.getByTestId("cell-status").click();
  await expect(page.getByTestId("status-option").first()).toBeVisible();
  await settle(page, 300);
  await shot(page, "start-status");
  await page.getByTestId("status-option").filter({ hasText: "Bezig" }).first().click();
  await expect(row.getByTestId("cell-status")).toContainText("Bezig");

  // 5. item panel with an update that mentions a colleague
  await row.hover();
  await row.getByTestId("update-bubble").click();
  await expect(page.getByTestId("item-panel")).toBeVisible();
  await page.getByTestId("update-editor").click();
  await page.keyboard.type("Concept staat klaar, ");
  await page.keyboard.type("@Bu");
  const opt = page.getByTestId("mention-option").filter({ hasText: "Builder" }).first();
  await expect(opt).toBeVisible();
  await opt.click();
  await page.keyboard.type(" kun jij meekijken?");
  await settle(page, 300);
  await shot(page, "start-update-schrijven");
  await page.getByTestId("update-submit").click();
  await expect(page.getByTestId("update-card").first()).toContainText("kun jij meekijken");
  await settle(page, 400);
  await shot(page, "start-update");
  await page.getByTestId("panel-close").click();

  // 6. Inbox of the mentioned colleague, then My work
  const memberCtx = await newUserPage(browser, baseURL, "dev1");
  await memberCtx.page.goto("/inbox");
  await expect(memberCtx.page.getByTestId("inbox-page")).toBeVisible();
  await expect(memberCtx.page.getByText("Offerte versturen").first()).toBeVisible();
  await settle(memberCtx.page, 600);
  await shot(memberCtx.page, "start-inbox");
  await memberCtx.context.close();
  await page.goto("/my-work");
  await settle(page, 800);
  await shot(page, "start-my-work");

  // 7. global search
  await page.goto("/");
  await expect(page.getByTestId("home-page")).toBeVisible();
  await page.keyboard.press("/");
  await page.keyboard.type("Delta");
  await settle(page, 1200);
  await shot(page, "start-zoeken");
  await page.keyboard.press("Escape");

  expect(errors).toEqual([]);
});
