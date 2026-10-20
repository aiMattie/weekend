import path from "node:path";
import { go } from "../admin/helpers";
import { boardIdByName, collectConsoleErrors, emailOf, expect, login, newUserPage, PASSWORD, resetDb, test } from "../fixtures";

/** Screenshots for docs/handleiding/12-beheer-en-rechten.md (npm run manuals). */
const IMG = path.join(process.cwd(), "docs/handleiding/img");
const shot = (page: import("@playwright/test").Page, name: string) => page.screenshot({ path: path.join(IMG, `admin-${name}.png`) });

test.skip(!process.env.RUN_MANUALS, "manual screenshots only run with RUN_MANUALS=1");

test("handleiding beheer en rechten: screenshots", async ({ page, request, browser, baseURL }) => {
  test.setTimeout(600_000);
  const errors = collectConsoleErrors(page);
  await resetDb(request);
  await login(page, "admin");
  const klanten = await boardIdByName(page.request, "Klanten");
  await page.request.post("/api/v1/items", { data: { boardId: klanten, name: "Zoekmachine optimalisatie" } });

  await go(page, "/admin/roles");
  await expect(page.getByTestId("builtin-matrix")).toBeVisible();
  await page.getByTestId("role-name").fill("Auditor");
  await page.getByTestId("role-create").click();
  const card = page.getByTestId("role-card").filter({ hasText: "Auditor" });
  await card.getByTestId("cap-account:audit").selectOption("allow");
  await card.getByTestId("cap-workspace:create").selectOption("deny");
  await card.getByTestId("role-save").click();
  await expect(card.getByTestId("role-save")).toBeDisabled();
  await shot(page, "eigen-rol");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId("builtin-matrix").scrollIntoViewIfNeeded();
  await page.getByTestId("builtin-matrix").screenshot({ path: path.join(IMG, "admin-rollen-matrix.png") });

  await go(page, "/admin/users");
  await page.getByTestId("users-invite").click();
  await page.getByTestId("invite-email").fill("nieuwe.collega@voorbeeld.nl");
  await page.getByTestId("invite-name").fill("Nieuwe Collega");
  await page.getByRole("button", { name: "Uitnodiging versturen" }).click();
  await expect(page.getByTestId("invite-link")).toBeVisible();
  await shot(page, "gebruikers");

  await go(page, "/admin/teams");
  await page.getByTestId("team-name").fill("Support");
  await page.getByTestId("team-create").click();
  const team = page.getByTestId("team-card").filter({ hasText: "Support" });
  await team.getByTestId("team-add-select").selectOption({ label: "Builder" });
  await team.getByTestId("team-add").click();
  await expect(team.getByTestId("team-member")).toBeVisible();
  await shot(page, "teams");

  await go(page, "/admin/guests");
  await page.getByTestId("guest-invite").click();
  await page.getByTestId("guest-email").fill("klant@extern.nl");
  await page.getByTestId("board-pick").filter({ hasText: "Klanten" }).first().click();
  await shot(page, "gasten");
  await page.getByRole("button", { name: "Uitnodiging versturen" }).click();
  await expect(page.getByTestId("invite-link")).toBeVisible();

  await go(page, `/permissions?board=${klanten}`);
  await page.getByTestId("board-level").selectOption("edit_content");
  await expect(page.getByTestId("board-level")).toHaveValue("edit_content");
  await shot(page, "boardrechten");
  const row = page.getByTestId("column-perm-row").filter({ hasText: "Uurtarief dev" });
  await row.getByTestId("column-edit-mode").selectOption("owners");
  await expect(row.getByTestId("column-edit-mode")).toHaveValue("owners");
  await page.getByTestId("column-permissions").scrollIntoViewIfNeeded();
  await page.getByTestId("column-permissions").screenshot({ path: path.join(IMG, "admin-kolomrechten.png") });

  await go(page, "/admin/account");
  await expect(page.getByTestId("account-general")).toBeVisible();
  await shot(page, "account");

  await go(page, "/admin/security");
  await expect(page.getByTestId("security-panic")).toBeVisible();
  await shot(page, "beveiliging");

  await go(page, "/admin/billing");
  await expect(page.getByTestId("billing-usage")).toBeVisible();
  await shot(page, "abonnement");

  // audit log with a deleted board
  const ws = (await (await page.request.get("/api/v1/workspaces")).json())[0].id;
  const b = await (await page.request.post("/api/v1/boards", { data: { workspaceId: ws, name: "Wegwerpbord" } })).json();
  await page.request.delete(`/api/v1/boards/${b.id}`);
  await go(page, "/admin/audit?event=board.deleted");
  await expect(page.getByTestId("audit-row").first()).toBeVisible();
  await shot(page, "auditlog");

  await go(page, "/profile");
  await expect(page.getByTestId("profile-page")).toBeVisible();
  await shot(page, "profiel");

  await page.goto("/");
  await page.keyboard.press("/");
  await page.keyboard.type("klan");
  await expect(page.getByTestId("search-group-board")).toBeVisible();
  await shot(page, "zoeken");

  // panic: the locked state seen by a colleague
  const dev1 = await newUserPage(browser, baseURL, "dev1");
  await go(page, "/admin/security");
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("panic-button").click();
  await expect(page.getByTestId("panic-code")).toBeVisible();
  await shot(page, "panic");
  await dev1.context.close();
  const ctx = await browser.newContext({ baseURL, locale: "nl-NL", viewport: { width: 1440, height: 900 } });
  const p2 = await ctx.newPage();
  await p2.goto("/login");
  await p2.getByTestId("login-email").fill(emailOf("dev1"));
  await p2.getByTestId("login-password").fill(PASSWORD);
  await p2.getByTestId("login-submit").click();
  await expect(p2.getByTestId("login-error")).toContainText("vergrendeld");
  await ctx.close();
  await page.getByTestId("panic-unlock").click();
  expect(errors, errors.join("\n")).toEqual([]);
});
