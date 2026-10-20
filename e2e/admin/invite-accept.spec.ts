import { test, collectConsoleErrors, login, resetDb } from "../fixtures";
import { expect, go } from "./helpers";

test.beforeEach(async ({ request }, info) => { info.setTimeout(300_000); await resetDb(request); });

test("admin invites a colleague by e-mail, the colleague accepts with a password", async ({ page, browser, baseURL }) => {
  const errors = collectConsoleErrors(page);
  await login(page, "admin");
  await go(page, "/admin/users");
  await expect(page.getByTestId("users-table")).toBeVisible();
  await page.getByTestId("users-invite").click();
  await page.getByTestId("invite-email").fill("nieuwe.collega@voorbeeld.nl");
  await page.getByTestId("invite-name").fill("Nieuwe Collega");
  await page.getByRole("button", { name: "Uitnodiging versturen" }).click();
  const link = (await page.getByTestId("invite-link").textContent())!.trim();
  expect(link).toMatch(/\/accept-invite\/[A-Za-z0-9_-]{20,}$/);
  await expect(page.getByTestId("invitation-row").filter({ hasText: "nieuwe.collega@voorbeeld.nl" })).toBeVisible();

  // the invited person (not logged in) opens the link
  const ctx = await browser.newContext({ baseURL, locale: "nl-NL" });
  const guest = await ctx.newPage();
  const guestErrors = collectConsoleErrors(guest);
  await guest.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await expect(guest.getByTestId("accept-invite")).toContainText("nieuwe.collega@voorbeeld.nl");
  // the submit button stays disabled until the page is hydrated and a password is typed
  await expect(async () => {
    await guest.getByTestId("invite-password").fill("Geheim-12345");
    await expect(guest.getByTestId("invite-submit")).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await guest.getByTestId("invite-password2").fill("anders-12345");
  await guest.getByTestId("invite-submit").click();
  await expect(guest.getByTestId("invite-error")).toContainText("niet gelijk");
  await guest.getByTestId("invite-password2").fill("Geheim-12345");
  await guest.getByTestId("invite-submit").click();
  await expect(guest.getByTestId("topbar")).toBeVisible();
  // the page is server-rendered before it is hydrated: retry the click until the menu opens
  await expect(async () => {
    await guest.getByTestId("avatar-menu").click();
    await expect(guest.getByText("nieuwe.collega@voorbeeld.nl")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });

  // the link only works once
  await guest.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await expect(guest.getByTestId("invite-invalid")).toBeVisible();

  // the colleague shows up as a user and can log in with the new password
  await page.reload();
  await expect(page.getByTestId("user-row").filter({ hasText: "nieuwe.collega@voorbeeld.nl" })).toBeVisible();
  const again = await ctx.request.post("/api/auth/login", { data: { email: "nieuwe.collega@voorbeeld.nl", password: "Geheim-12345" } });
  expect(again.ok()).toBeTruthy();
  expect(errors, errors.join("\n")).toEqual([]);
  expect(guestErrors, guestErrors.join("\n")).toEqual([]);
  await ctx.close();
});

test("expired or unknown invitation links show a clear message", async ({ page }) => {
  await page.goto("/accept-invite/does-not-exist-does-not-exist");
  await expect(page.getByTestId("invite-invalid")).toBeVisible();
});

test("bulk import creates invitations from a CSV", async ({ page }) => {
  await login(page, "admin");
  await go(page, "/admin/users");
  await page.getByTestId("users-import").click();
  await page.getByTestId("import-csv").fill("naam,email,rol\nAnna,anna@voorbeeld.nl,member\nBert,bert@voorbeeld.nl,viewer\nFout,geen-mail,member\n");
  await page.getByRole("button", { name: "Importeren", exact: true }).last().click();
  await expect(page.getByTestId("import-result")).toContainText("2 uitnodigingen aangemaakt, 1 overgeslagen");
});

test("deactivate and reactivate a user; deactivated users cannot log in", async ({ page, request }) => {
  await login(page, "admin");
  await go(page, "/admin/users");
  const row = page.getByTestId("user-row").filter({ hasText: "consultant1@example.com" });
  await row.getByTestId("user-deactivate").click();
  await expect(row.getByTestId("user-reactivate")).toBeVisible();
  const r = await request.post("/api/auth/login", { data: { email: "consultant1@example.com", password: process.env.SEED_PASSWORD ?? "Welkom123!" } });
  expect(r.status()).toBe(401);
  await row.getByTestId("user-reactivate").click();
  await expect(row.getByTestId("user-deactivate")).toBeVisible();
});
