import { boardIdByName, collectConsoleErrors, login, newUserPage, resetDb, test } from "../fixtures";
import { expect, go } from "./helpers";

test.beforeEach(async ({ request }, info) => { info.setTimeout(300_000); await resetDb(request); });

test("role change takes effect: a viewer cannot edit", async ({ page, browser, baseURL }) => {
  const errors = collectConsoleErrors(page);
  const dev1 = await newUserPage(browser, baseURL, "dev1");
  const boardId = await boardIdByName(dev1.page.context().request, "Klanten");
  // as member Builder can add items
  const ok = await dev1.page.request.post("/api/v1/items", { data: { boardId, name: "Door Builder" } });
  expect(ok.status()).toBe(201);

  await login(page, "admin");
  await go(page, "/admin/users");
  const row = page.getByTestId("user-row").filter({ hasText: "dev1@example.com" });
  await row.getByTestId("user-role").selectOption("viewer");
  await expect(row.getByTestId("user-role")).toHaveValue("viewer");

  // the same session of Builder is now read only (role is read on every request)
  const denied = await dev1.page.request.post("/api/v1/items", { data: { boardId, name: "Mag niet" } });
  expect(denied.status()).toBe(403);
  const read = await dev1.page.request.get(`/api/v1/boards/${boardId}/full`);
  expect(read.ok()).toBeTruthy();
  await dev1.page.goto(`/boards/${boardId}`);
  await expect(dev1.page.getByTestId("board-page")).toBeVisible();
  await expect(dev1.page.getByTestId("add-item")).toHaveCount(0);

  // back to member: editing works again
  await row.getByTestId("user-role").selectOption("member");
  await expect(row.getByTestId("user-role")).toHaveValue("member");
  const again = await dev1.page.request.post("/api/v1/items", { data: { boardId, name: "Weer toegestaan" } });
  expect(again.status()).toBe(201);
  expect(errors, errors.join("\n")).toEqual([]);
  await dev1.context.close();
});

test("custom role with a capability matrix", async ({ page, browser, baseURL }) => {
  await login(page, "admin");
  await go(page, "/admin/roles");
  await expect(page.getByTestId("builtin-matrix")).toBeVisible();
  await page.getByTestId("role-name").fill("Auditor");
  await page.getByTestId("role-create").click();
  const card = page.getByTestId("role-card").filter({ hasText: "Auditor" });
  await card.getByTestId("cap-account:audit").selectOption("allow");
  await card.getByTestId("cap-workspace:create").selectOption("deny");
  await card.getByTestId("role-save").click();
  await expect(card.getByTestId("role-save")).toBeDisabled();
  await go(page, "/admin/users");
  const row = page.getByTestId("user-row").filter({ hasText: "dev1@example.com" });
  await row.getByTestId("user-role").selectOption({ label: "Auditor" });
  await expect(row.getByTestId("user-role")).toHaveValue(/^custom:/);

  const dev1 = await newUserPage(browser, baseURL, "dev1");
  expect((await dev1.page.request.get("/api/v1/audit-log")).status()).toBe(200);
  expect((await dev1.page.request.post("/api/v1/workspaces", { data: { name: "Verboden" } })).status()).toBe(403);
  expect((await dev1.page.request.get("/api/v1/admin/security")).status()).toBe(403);
  await dev1.page.goto("/admin/audit");
  await expect(dev1.page.getByTestId("audit-table")).toBeVisible();
  await dev1.page.goto("/admin/users");
  await expect(dev1.page.getByTestId("no-access")).toBeVisible();
  await dev1.context.close();
});

test("a guest sees only the board that was shared with them", async ({ page, browser, baseURL }) => {
  const errors = collectConsoleErrors(page);
  await login(page, "admin");
  await go(page, "/admin/guests");
  await page.getByTestId("guest-invite").click();
  await page.getByTestId("guest-email").fill("klant@extern.nl");
  await page.getByTestId("board-pick").filter({ hasText: "Klanten" }).first().click();
  await page.getByRole("button", { name: "Uitnodiging versturen" }).click();
  const link = (await page.getByTestId("invite-link").textContent())!.trim().replace(/^https?:\/\/[^/]+/, "");

  const ctx = await browser.newContext({ baseURL, locale: "nl-NL", viewport: { width: 1440, height: 900 } });
  const guest = await ctx.newPage();
  await guest.goto(link);
  await guest.getByTestId("invite-name-input").fill("Klant Extern");
  await guest.getByTestId("invite-password").fill("Geheim-12345");
  await guest.getByTestId("invite-password2").fill("Geheim-12345");
  await guest.getByTestId("invite-submit").click();
  await expect(guest.getByTestId("topbar")).toBeVisible();

  const boards = (await (await guest.request.get("/api/v1/boards")).json()) as { id: string; name: string }[];
  expect(boards.map((b) => b.name)).toEqual(["Klanten"]);
  const wsList = (await (await guest.request.get("/api/v1/workspaces")).json()) as unknown[];
  expect(wsList).toEqual([]);
  const klanten = boards[0].id;
  // viewer by default: cannot edit, cannot see other boards, no admin screens
  expect((await guest.request.post("/api/v1/items", { data: { boardId: klanten, name: "Nee" } })).status()).toBe(403);
  const all = (await (await page.context().request.get("/api/v1/boards")).json()) as { id: string; name: string }[];
  const hidden = all.find((b) => b.name !== "Klanten")!;
  expect((await guest.request.get(`/api/v1/boards/${hidden.id}/full`)).status()).toBe(403);
  await guest.goto(`/boards/${klanten}`);
  await expect(guest.getByTestId("board-page")).toBeVisible();
  await guest.goto("/admin/users");
  await expect(guest.getByTestId("no-access")).toBeVisible();
  expect((await guest.request.get("/api/v1/admin/users")).status()).toBe(403);

  // the admin sees the guest and their access, and can remove them
  await page.reload();
  const row = page.getByTestId("guest-row").filter({ hasText: "klant@extern.nl" });
  await expect(row).toContainText("Klanten");
  page.once("dialog", (d) => d.accept());
  await row.getByTestId("guest-remove").click();
  await expect(page.getByTestId("guest-row").filter({ hasText: "klant@extern.nl" })).toContainText("Geen toegang");
  expect((await guest.request.get("/api/v1/boards")).status()).toBe(401);
  expect(errors.filter((e) => !/403|401/.test(e)), errors.join("\n")).toEqual([]);
  await ctx.close();
});

test("board and workspace permissions screen: level, visibility, create boards", async ({ page, browser, baseURL }) => {
  await login(page, "admin");
  const klanten = await boardIdByName(page.context().request, "Klanten");
  await go(page, `/permissions?board=${klanten}`);
  await expect(page.getByTestId("board-permissions")).toBeVisible();
  await page.getByTestId("board-level").selectOption("view_only");
  await expect(page.getByTestId("board-level")).toHaveValue("view_only");
  const dev1 = await newUserPage(browser, baseURL, "dev1");
  expect((await dev1.page.request.post("/api/v1/items", { data: { boardId: klanten, name: "Nee" } })).status()).toBe(403);
  await page.getByTestId("board-level").selectOption("edit_content");
  await expect(page.getByTestId("board-level")).toHaveValue("edit_content");
  expect((await dev1.page.request.post("/api/v1/items", { data: { boardId: klanten, name: "Ja" } })).status()).toBe(201);
  expect((await dev1.page.request.post("/api/v1/boards/" + klanten + "/columns", { data: { title: "Nieuw", type: "text" } })).status()).toBe(403);
  await page.getByTestId("board-visibility").selectOption("private");
  await expect(page.getByTestId("board-visibility")).toHaveValue("private");
  expect((await dev1.page.request.get(`/api/v1/boards/${klanten}/full`)).status()).toBe(403);
  await dev1.context.close();
});
