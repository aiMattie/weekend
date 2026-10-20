import path from "node:path";
import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";

/** Screenshots for docs/handleiding/10-mcp-en-api.md (npm run manuals). */
const IMG = path.join(process.cwd(), "docs/handleiding/img");
const shot = (page: import("@playwright/test").Page, name: string) => page.screenshot({ path: path.join(IMG, `platform-${name}.png`) });

const expectSlow = expect.configure({ timeout: 90_000 });

test.skip(!process.env.RUN_MANUALS, "manual screenshots only run with RUN_MANUALS=1");

test("handleiding MCP en API: screenshots", async ({ page, request }) => {
  test.setTimeout(600_000);
  const errors = collectConsoleErrors(page);
  await resetDb(request);
  await login(page, "admin");
  await page.goto("/admin/api");
  await expectSlow(page.getByTestId("admin-title")).toBeVisible();

  await page.getByTestId("token-new").click();
  await page.locator('[data-testid="token-name"] input, input[data-testid="token-name"]').first().fill("Claude Code");
  await page.getByTestId("token-submit").click();
  await expectSlow(page.getByTestId("token-created")).toBeVisible();
  await shot(page, "token-aangemaakt");
  await page.getByTestId("token-done").click();
  await expectSlow(page.getByTestId("tokens-table")).toBeVisible();
  await shot(page, "tokens");

  await page.getByTestId("platform-tab-explorer").click();
  await page.getByTestId("explorer-example").selectOption("boards");
  await page.getByTestId("explorer-run").click();
  await expectSlow(page.getByTestId("explorer-result")).toContainText("columns");
  await shot(page, "explorer");

  await page.getByTestId("platform-tab-mcp").click();
  await expectSlow(page.getByTestId("mcp-cli")).toBeVisible();
  await shot(page, "mcp");

  await page.getByTestId("platform-tab-webhooks").click();
  await expectSlow(page.getByTestId("platform-webhooks")).toBeVisible();
  await shot(page, "webhooks");
  expect(errors, errors.join("\n")).toEqual([]);
});
