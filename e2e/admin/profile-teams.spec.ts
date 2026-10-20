import { collectConsoleErrors, login, PASSWORD, resetDb, emailOf, test } from "../fixtures";
import { expect, go } from "./helpers";

test.beforeEach(async ({ request }, info) => { info.setTimeout(300_000); await resetDb(request); });

// 1x1 transparent PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test("profile: details, avatar upload and password change", async ({ page, request }) => {
  const errors = collectConsoleErrors(page);
  await login(page, "pm1");
  await go(page, "/profile");
  await page.getByTestId("profile-name").fill("Planner de Vries");
  await page.getByTestId("profile-title").fill("Senior projectmanager");
  await page.getByTestId("profile-phone").fill("+31 6 12345678");
  await page.getByTestId("profile-save").click();
  await expect(page.getByTestId("profile-saved")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("profile-name")).toHaveValue("Planner de Vries");
  await expect(page.getByTestId("profile-title")).toHaveValue("Senior projectmanager");

  await page.getByTestId("avatar-input").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("profile-details").locator("img").first()).toBeVisible();
  const me = await (await page.request.get("/api/v1/users/me")).json();
  expect(me.photoUrl).toMatch(/^\/api\/v1\/profile\/avatar\//);
  const img = await page.request.get(me.photoUrl);
  expect(img.headers()["content-type"]).toBe("image/png");
  // not an image: refused
  const bad = await page.request.post("/api/v1/profile/avatar", { multipart: { file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("niet echt een plaatje") } } });
  expect(bad.status()).toBe(400);

  await page.getByTestId("pw-current").fill("fout");
  await page.getByTestId("pw-new").fill("Nieuw-wachtwoord-1");
  await page.getByTestId("pw-save").click();
  await expect(page.getByTestId("pw-error")).toContainText("klopt niet");
  await page.getByTestId("pw-current").fill(PASSWORD);
  await page.getByTestId("pw-save").click();
  await expect(page.getByTestId("pw-done")).toBeVisible();
  const old = await request.post("/api/auth/login", { data: { email: emailOf("pm1"), password: PASSWORD } });
  expect(old.status()).toBe(401);
  const fresh = await request.post("/api/auth/login", { data: { email: emailOf("pm1"), password: "Nieuw-wachtwoord-1" } });
  expect(fresh.ok()).toBeTruthy();
  expect(errors.filter((e) => !/status of 40\d/.test(e)), errors.join("\n")).toEqual([]);
});

test("teams: create, add members, make owner and account settings", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await login(page, "admin");
  await go(page, "/admin/teams");
  await page.getByTestId("team-name").fill("Support");
  await page.getByTestId("team-create").click();
  const card = page.getByTestId("team-card").filter({ hasText: "Support" });
  await expect(card).toBeVisible();
  await card.getByTestId("team-add-select").selectOption({ label: "Builder" });
  await card.getByTestId("team-add").click();
  await expect(card.getByTestId("team-member").filter({ hasText: "Builder" })).toBeVisible();
  await card.getByTestId("team-member").filter({ hasText: "Builder" }).getByRole("button", { name: "Owner maken" }).click();
  await expect(card.getByTestId("team-member").filter({ hasText: "Builder" })).toContainText("Team owner");

  await go(page, "/admin/account");
  await page.getByTestId("account-name").fill("Example Test");
  await page.getByTestId("account-week").selectOption("sunday");
  await page.getByTestId("account-save").click();
  await expect(page.getByTestId("account-saved")).toBeVisible();

  expect(errors, errors.join("\n")).toEqual([]);
});

test("admin center pages render for an admin and are closed to members", async ({ page, browser, baseURL }) => {
  const errors = collectConsoleErrors(page);
  await login(page, "admin");
  for (const path of ["users", "teams", "guests", "roles", "account", "security", "audit"]) {
    await go(page, `/admin/${path}`);
    await expect(page.getByTestId("admin-title")).toBeVisible();
  }
  await go(page, "/admin");
  await expect(page).toHaveURL(/\/admin\/users/);
  await page.goto("/profile/" + (await (await page.request.get("/api/v1/users")).json()).find((u: { email: string }) => u.email === "dev1@example.com").id);
  await expect(page.getByTestId("user-profile")).toContainText("dev1@example.com");
  const ctx = await browser.newContext({ baseURL });
  await ctx.request.post("/api/auth/login", { data: { email: emailOf("dev1"), password: PASSWORD } });
  const p = await ctx.newPage();
  await p.goto("/admin/users");
  await expect(p.getByTestId("no-access")).toBeVisible();
  await ctx.close();
  expect(errors, errors.join("\n")).toEqual([]);
});
