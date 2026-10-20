import { collectConsoleErrors, emailOf, login, newUserPage, PASSWORD, resetDb, test } from "../fixtures";
import { expect, go } from "./helpers";
import { totpAt } from "../../src/modules/admin/lib/totp";

test.beforeEach(async ({ request }, info) => { info.setTimeout(300_000); await resetDb(request); });

test("2FA: enable in the profile, then log in with a code and with a recovery code", async ({ page, browser, baseURL }) => {
  const errors = collectConsoleErrors(page);
  await login(page, "dev1");
  await go(page, "/profile");
  await page.getByTestId("twofa-start").click();
  await expect(page.getByTestId("twofa-qr").locator("svg")).toBeVisible();
  const secret = (await page.getByTestId("twofa-secret").textContent())!.trim();
  await page.getByTestId("twofa-code").fill("000000");
  await page.getByTestId("twofa-confirm").click();
  await expect(page.getByTestId("twofa-error")).toContainText("Invalid code");
  await page.getByTestId("twofa-code").fill(totpAt(secret));
  await page.getByTestId("twofa-confirm").click();
  await expect(page.getByTestId("recovery-codes")).toBeVisible();
  const codes = await page.getByTestId("recovery-code").allTextContents();
  expect(codes).toHaveLength(10);

  // fresh browser: password first, then the code
  const ctx = await browser.newContext({ baseURL, locale: "nl-NL" });
  const p2 = await ctx.newPage();
  await p2.goto("/login");
  await expect(p2.getByTestId("login-submit")).toBeEnabled();
  await p2.getByTestId("login-email").fill(emailOf("dev1"));
  await p2.getByTestId("login-password").fill(PASSWORD);
  await p2.getByTestId("login-submit").click();
  await expect(p2.getByTestId("login-2fa-code")).toBeVisible();
  await p2.getByTestId("login-2fa-code").fill("123456");
  await p2.getByTestId("login-submit").click();
  await expect(p2.getByTestId("login-error")).toContainText("Onjuiste code");
  await p2.getByTestId("login-2fa-code").fill(totpAt(secret, Date.now() + 30_000));
  await p2.getByTestId("login-submit").click();
  await expect(p2.getByTestId("topbar")).toBeVisible();

  // a recovery code works once
  const ctx2 = await browser.newContext({ baseURL, locale: "nl-NL" });
  const p3 = await ctx2.newPage();
  for (const attempt of [1, 2]) {
    await p3.goto("/login");
    await expect(p3.getByTestId("login-submit")).toBeEnabled();
    await p3.getByTestId("login-email").fill(emailOf("dev1"));
    await p3.getByTestId("login-password").fill(PASSWORD);
    await p3.getByTestId("login-submit").click();
    await p3.getByTestId("login-2fa-code").fill(codes[0]);
    await p3.getByTestId("login-submit").click();
    if (attempt === 1) await expect(p3.getByTestId("topbar")).toBeVisible();
    else await expect(p3.getByTestId("login-error")).toContainText("Onjuiste code");
    if (attempt === 1) {
      await expect(async () => {
        await p3.getByTestId("avatar-menu").click();
        await p3.getByTestId("logout").click({ timeout: 2000 });
      }).toPass({ timeout: 30_000 });
      await expect(p3.getByTestId("login-form")).toBeVisible();
    }
  }

  // sessions: two devices are listed; the other one can be signed out
  await page.reload();
  await expect(page.getByTestId("session-row").first()).toBeVisible();
  expect(await page.getByTestId("session-row").count()).toBeGreaterThanOrEqual(2);
  await page.getByTestId("sessions-revoke-others").click();
  await expect(page.getByTestId("session-row")).toHaveCount(1);
  expect((await p2.request.get("/api/v1/users/me")).status()).toBe(401);

  // disabling needs the password
  await page.getByTestId("twofa-disable-password").fill(PASSWORD);
  await page.getByTestId("twofa-disable").click();
  await expect(page.getByTestId("twofa-start")).toBeVisible();
  expect(errors.filter((e) => !/status of 40\d/.test(e)), errors.join("\n")).toEqual([]);
  await ctx.close();
  await ctx2.close();
});

test("panic button locks the account; only an admin with the recovery code gets in", async ({ page, browser, baseURL }) => {
  await login(page, "admin");
  const dev1 = await newUserPage(browser, baseURL, "dev1");
  expect((await dev1.page.request.get("/api/v1/users/me")).ok()).toBeTruthy();

  await go(page, "/admin/security");
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("panic-button").click();
  const code = (await page.getByTestId("panic-code").textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
  await expect(page.getByTestId("panic-banner")).toBeVisible();

  // everybody else is out, including API access
  expect((await dev1.page.request.get("/api/v1/users/me")).status()).toBe(401);
  const blocked = await dev1.page.request.post("/api/auth/login", { data: { email: emailOf("dev1"), password: PASSWORD } });
  expect(blocked.status()).toBe(423);
  // the admin who pressed it keeps a recovery session
  expect((await page.request.get("/api/v1/users/me")).ok()).toBeTruthy();

  // another admin logs in through the UI with the recovery code
  const ctx = await browser.newContext({ baseURL, locale: "nl-NL" });
  const p2 = await ctx.newPage();
  await p2.goto("/login");
  await expect(p2.getByTestId("login-submit")).toBeEnabled();
  await p2.getByTestId("login-email").fill(emailOf("owner"));
  await p2.getByTestId("login-password").fill(PASSWORD);
  await p2.getByTestId("login-submit").click();
  await expect(p2.getByTestId("login-error")).toContainText("vergrendeld");
  await p2.getByTestId("login-panic-code").fill(code);
  await p2.getByTestId("login-submit").click();
  await expect(p2.getByTestId("topbar")).toBeVisible();

  // unlock: Builder can log in again
  await go(p2, "/admin/security");
  await p2.getByTestId("panic-unlock").click();
  await expect(p2.getByTestId("panic-banner")).toHaveCount(0);
  const ok = await dev1.page.request.post("/api/auth/login", { data: { email: emailOf("dev1"), password: PASSWORD } });
  expect(ok.ok()).toBeTruthy();
  await ctx.close();
  await dev1.context.close();
});

test("security settings: password policy, IP allow-list guard, SSO stub and SCIM token", async ({ page, request }) => {
  const errors = collectConsoleErrors(page);
  await login(page, "admin");
  await go(page, "/admin/security");
  await expect(page.getByTestId("sso-state")).toHaveText("Niet verbonden");
  await page.getByTestId("policy-min").fill("14");
  await page.getByTestId("policy-requireNumber").evaluate((el: HTMLElement) => el.click()); // Vibe Toggle hides its input
  await page.getByTestId("policy-save").click();
  await expect(page.getByTestId("security-password").getByText("Opgeslagen")).toBeVisible();
  await go(page, "/profile");
  await page.getByTestId("pw-current").fill(PASSWORD);
  await page.getByTestId("pw-new").fill("kort1");
  await page.getByTestId("pw-save").click();
  await expect(page.getByTestId("pw-error")).toContainText("Minimaal 14 tekens");

  // an allow-list without the own address is refused; with it the app keeps working
  await go(page, "/admin/security");
  await page.getByTestId("ip-list").fill("203.0.113.0/24");
  await page.getByTestId("ip-save").click();
  await expect(page.getByTestId("admin-error")).toContainText("lock yourself out");
  await page.getByTestId("ip-list").fill("203.0.113.0/24\n127.0.0.1");
  await page.getByTestId("ip-save").click();
  await expect(page.getByTestId("security-ip").getByText("Opgeslagen")).toBeVisible();
  // a request that claims another address is blocked by the proxy
  const blocked = await request.get("/login", { headers: { "x-forwarded-for": "198.51.100.9" } });
  expect(blocked.status()).toBe(403);
  const allowed = await request.get("/login", { headers: { "x-forwarded-for": "203.0.113.50" } });
  expect(allowed.status()).toBe(200);
  await page.getByTestId("ip-list").fill("");
  await page.getByTestId("ip-save").click();
  await expect(page.getByTestId("security-ip").getByText("Niet actief")).toBeVisible();

  // SCIM token + endpoint
  await page.getByTestId("scim-create").click();
  const token = (await page.getByTestId("scim-token").textContent())!.trim();
  const res = await request.get("/api/scim/v2/Users?count=2", { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/scim+json");
  expect(await res.json()).toMatchObject({ schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], itemsPerPage: 2 });
  expect((await request.get("/api/scim/v2/Users", { headers: { Authorization: "Bearer scim_fout" } })).status()).toBe(401);
  expect(errors.filter((e) => !/status of 40\d/.test(e)), errors.join("\n")).toEqual([]);
});
