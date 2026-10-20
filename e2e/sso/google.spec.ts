import { collectConsoleErrors, emailOf, expect, login, PASSWORD, resetDb, test } from "../fixtures";
import { clickGoogle, toggle, googleOff, googleReset, pointAtMock, putSso, useMockGoogle } from "./helpers";
import type { MockGoogle } from "./mock-google";

/**
 * Google SSO e2e against a local mock OpenID Connect provider (never the real Google). The spec starts the mock
 * itself and points the running server (E2E_RESET=1) at it through POST /api/test/google.
 */
let mock: MockGoogle | null = null;

test.beforeAll(async ({ request, baseURL }) => {
  mock = await useMockGoogle(request, baseURL!);
  test.skip(!mock, "needs a server started with E2E_RESET=1 (playwright.config.ts does that)");
});
test.afterAll(async ({ request }) => { await googleReset(request).catch(() => undefined); await mock?.close(); });
test.beforeEach(async ({ request, baseURL }) => {
  if (!mock) return;
  await pointAtMock(request, mock, baseURL!);
  await resetDb(request);
  mock.setNext({ sub: "g-dev1", email: "dev1@example.com", name: "Builder", hd: "example.com" });
});

const me = async (page: import("@playwright/test").Page) => (await (await page.request.get("/api/v1/profile")).json()) as { email: string; name: string; role: string };

test("button is hidden while Google is not configured; the start URL explains why", async ({ page, request }) => {
  await googleOff(request);
  await page.goto("/login");
  await expect(page.getByTestId("login-submit")).toBeEnabled();
  await expect(page.getByTestId("login-google")).toHaveCount(0);
  await expect(page.getByTestId("login-email")).toBeVisible();
  await page.goto("/api/auth/google/start");
  await expect(page).toHaveURL(/\/login\?error=not_configured/);
  await expect(page.getByTestId("login-sso-error")).toContainText("nog niet ingesteld");
  // admin page: status + env checks, no values
  await login(page, "admin");
  await page.goto("/admin/sso");
  await expect(page.getByTestId("sso-status")).toHaveText("Niet geconfigureerd");
  await expect(page.getByTestId("sso-env-GOOGLE_CLIENT_ID")).toHaveAttribute("data-present", "false");
  await expect(page.getByTestId("sso-env-GOOGLE_CLIENT_SECRET")).toHaveAttribute("data-present", "false");
  await expect(page.getByTestId("sso-redirect-current")).toHaveText(/\/api\/auth\/google\/callback$/);
  await expect(page.getByTestId("sso-test")).toBeDisabled();
});

test("existing user signs in with Google (PKCE, state, nonce), gets a real session and a linked identity", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await clickGoogle(page);
  await expect(page.getByTestId("topbar")).toBeVisible();
  expect((await me(page)).email).toBe("dev1@example.com");
  const q = mock!.lastAuth()!;
  expect(q.get("code_challenge_method")).toBe("S256");
  expect(q.get("scope")).toBe("openid email profile");
  expect(q.get("prompt")).toBe("select_account");
  expect(q.get("state")).toBeTruthy();
  expect(q.get("nonce")).toBeTruthy();
  expect(q.get("hd")).toBeNull(); // no allowed domains: no hint

  // the session is a server side session (listed on the profile) and the identity shows up on the profile
  await page.goto("/profile");
  await expect(page.getByTestId("google-linked-email")).toContainText("dev1@example.com");
  const sessions = (await (await page.request.get("/api/v1/profile/sessions")).json()) as unknown[];
  expect(sessions.length).toBeGreaterThan(0);

  // audit: success + identity linked, no tokens
  const admin = await page.context().browser()!.newContext({ baseURL: test.info().project.use.baseURL });
  await login(admin, "admin");
  const audit = await (await admin.request.get("/api/v1/audit-log?event=sso.login_success")).json();
  expect(JSON.stringify(audit)).toContain("dev1@example.com");
  expect(JSON.stringify(audit)).not.toMatch(/id_token|eyJ/);
  await admin.close();
  expect(errors).toEqual([]);
});

test("a second login matches by Google subject and `next` is honoured", async ({ page, browser, baseURL }) => {
  await clickGoogle(page);
  await expect(page.getByTestId("topbar")).toBeVisible();
  const second = await browser.newContext({ baseURL });
  const p2 = await second.newPage();
  await p2.goto("/login?next=%2Fprofile");
  await p2.getByTestId("login-google").click();
  await expect(p2).toHaveURL(/\/profile$/);
  await expect(p2.getByTestId("profile-page")).toBeVisible();
  await second.close();
});

test("open redirect: a hostile next never leaves the site", async ({ browser, baseURL }) => {
  for (const hostile of ["//evil.example/x", "https://evil.example/", "/\\evil.example", "/%2f%2fevil.example"]) {
    const ctx = await browser.newContext({ baseURL });
    const page = await ctx.newPage();
    await page.goto("/api/auth/google/start?next=" + encodeURIComponent(hostile));
    await expect(page.getByTestId("topbar")).toBeVisible();
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
    expect(new URL(page.url()).pathname).toBe("/");
    await ctx.close();
  }
});

test("domain rejection, unverified e-mail, unknown user and tampering show friendly Dutch errors", async ({ page, request }) => {
  const err = async (code: string, text: RegExp) => {
    await expect(page).toHaveURL(new RegExp(`/login\\?error=${code}`));
    await expect(page.getByTestId("login-sso-error")).toHaveAttribute("data-code", code);
    await expect(page.getByTestId("login-sso-error")).toContainText(text);
    await expect(page.getByTestId("topbar")).toHaveCount(0);
  };
  await login(page, "admin");
  await putSso(page.request, { allowedDomains: ["example.com"] });
  await page.context().clearCookies();

  mock!.setNext({ sub: "g-ext", email: "dev1@example.com", hd: "evil.example" });
  await clickGoogle(page);
  await err("domain_not_allowed", /toegestaan domein/);
  expect((await page.request.get("/api/v1/profile")).status()).toBe(401);

  mock!.setNext({ sub: "g-dev1", email: "dev1@example.com", hd: null }); // consumer account that merely has a company address
  await clickGoogle(page);
  await err("domain_not_allowed", /toegestaan domein/);

  mock!.setNext({ sub: "g-dev1", email: "dev1@example.com", email_verified: false });
  await clickGoogle(page);
  await err("email_not_verified", /niet geverifieerd/);

  mock!.setNext({ sub: "g-new", email: "onbekend@example.com" });
  await clickGoogle(page);
  await err("no_account", /Vraag een beheerder/);

  mock!.setNext("deny");
  await clickGoogle(page);
  await err("idp_error", /gaf een fout/);

  for (const bad of [{ signWithOtherKey: true }, { aud: "andere-client" }, { iss: "https://evil.example" }, { expired: true }, { nonce: "niet-de-nonce" }]) {
    mock!.setNext({ sub: "g-dev1", email: "dev1@example.com", ...bad });
    await clickGoogle(page);
    await err("idp_error", /niet geldig/);
  }

  // callback without our flow cookie / with a foreign state
  await page.goto("/api/auth/google/callback?code=abc&state=xyz");
  await err("state_mismatch", /verlopen/);
  await request.post("/api/test/reset");
});

test("deactivated users and the panic lock are refused", async ({ page }) => {
  await login(page, "admin");
  const users = (await (await page.request.get("/api/v1/admin/users")).json()) as { id: string; email: string }[];
  const dev1 = users.find((u) => u.email === "dev1@example.com")!;
  expect((await page.request.patch(`/api/v1/admin/users/${dev1.id}`, { data: { isActive: false } })).ok()).toBeTruthy();
  await page.context().clearCookies();
  await clickGoogle(page);
  await expect(page.getByTestId("login-sso-error")).toHaveAttribute("data-code", "account_disabled");

  await page.request.post("/api/test/reset");
  await login(page, "admin");
  expect((await page.request.post("/api/v1/admin/security/panic")).ok()).toBeTruthy();
  await page.context().clearCookies();
  await clickGoogle(page);
  await expect(page.getByTestId("login-sso-error")).toHaveAttribute("data-code", "locked");
});

test("an unknown user is created as Member when auto-provisioning is on and the domain is allowed", async ({ page, browser, baseURL }) => {
  const admin = await browser.newContext({ baseURL });
  await login(admin, "admin");
  // auto-provision needs a domain first
  const refused = await admin.request.put("/api/v1/admin/sso", { data: { autoProvision: true } });
  expect(refused.status()).toBe(400);
  await putSso(admin.request, { allowedDomains: ["example.com"], autoProvision: true });

  mock!.setNext({ sub: "g-new", email: "Nieuwe.Collega@example.com", name: "Nieuwe Collega", picture: "https://lh3.googleusercontent.com/a/mock", hd: "example.com" });
  await clickGoogle(page);
  await expect(page.getByTestId("topbar")).toBeVisible();
  expect(await me(page)).toMatchObject({ email: "nieuwe.collega@example.com", name: "Nieuwe Collega", role: "member" });
  expect(mock!.lastAuth()!.get("hd")).toBe("example.com"); // exactly one allowed domain: hint

  // outside the allowed domain nobody is created
  await page.context().clearCookies();
  mock!.setNext({ sub: "g-ext", email: "extern@evil.example", hd: "evil.example" });
  await clickGoogle(page);
  await expect(page.getByTestId("login-sso-error")).toHaveAttribute("data-code", "domain_not_allowed");

  // admin sees the identity; unlink removes it again
  await admin.newPage().then(async (p) => {
    await p.goto("/admin/sso");
    await expect(p.getByTestId("sso-identity-row").filter({ hasText: "nieuwe.collega@example.com" })).toBeVisible();
    p.once("dialog", (d) => d.accept());
    await p.getByTestId("sso-identity-row").filter({ hasText: "nieuwe.collega@example.com" }).getByTestId("sso-unlink").click();
    await expect(p.getByTestId("sso-identity-row").filter({ hasText: "nieuwe.collega@example.com" })).toHaveCount(0);
  });
  await admin.close();
});

test("admin page: settings, test sign-in and linked identities", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/sso");
  await expect(page.getByTestId("sso-status")).toHaveText("Geconfigureerd");
  await expect(page.getByTestId("sso-env-GOOGLE_CLIENT_ID")).toHaveAttribute("data-present", "true");
  await expect(page.getByTestId("sso-env-GOOGLE_CLIENT_SECRET")).toHaveAttribute("data-present", "true");
  await expect(page.getByTestId("sso-redirect-current")).toBeVisible();
  await expect(page.getByTestId("sso-redirect-current")).toHaveText(/\/api\/auth\/google\/callback$/);
  await expect(page.getByTestId("admin-nav-sso")).toHaveText("Single sign-on");
  await expect(page.getByTestId("admin-nav-saml")).toHaveText("SAML (nog niet beschikbaar)");
  await expect(page.getByTestId("sso-identities-empty")).toBeVisible();

  await page.getByTestId("sso-domains").fill("example.com, example.org");
  await page.getByTestId("sso-domains-save").click();
  await expect(page.getByTestId("sso-saved")).toBeVisible();

  // "Test inloggen": admin's own Google account, nothing changes in the session
  mock!.setNext({ sub: "g-admin", email: "admin@example.com", hd: "example.com" });
  await page.getByTestId("sso-test").click();
  await expect(page.getByTestId("sso-test-result")).toHaveAttribute("data-ok", "true");
  await expect(page.getByTestId("sso-test-result")).toContainText("admin@example.com");
  expect((await me(page)).email).toBe("admin@example.com");
  await expect(page.getByTestId("sso-identities-empty")).toBeVisible(); // test does not link anything

  mock!.setNext({ sub: "g-x", email: "x@evil.example", hd: "evil.example" });
  await page.getByTestId("sso-test").click();
  await expect(page.getByTestId("sso-test-result")).toHaveAttribute("data-ok", "false");

  // SAML screen stays reachable
  await page.getByTestId("sso-saml-link").click();
  await expect(page.getByTestId("security-sso")).toBeVisible();
});

test("link on the profile, enforce 'only Google', break-glass and unlink", async ({ page, browser, baseURL }) => {
  await login(page, "admin");
  // enforcing without a linked Google account is refused
  await page.goto("/admin/sso");
  await page.waitForLoadState("networkidle"); // hydrated: the toggle has its click handler
  await toggle(page, "sso-enforce");
  await expect(page.getByTestId("admin-error")).toContainText("Koppel eerst je eigen Google- of Microsoft-account");

  // link from the profile page
  mock!.setNext({ sub: "g-admin", email: "admin@example.com", hd: "example.com" });
  await page.goto("/profile");
  await page.getByTestId("google-link").click();
  await expect(page).toHaveURL(/\/profile\?google=linked/);
  await expect(page.getByTestId("google-flash")).toBeVisible();
  await expect(page.getByTestId("google-linked-email")).toContainText("admin@example.com");

  // enforce on, admin is break-glass
  await page.goto("/admin/sso");
  await page.getByTestId("sso-breakglass-admin@example.com").click();
  await expect(page.getByTestId("sso-breakglass-admin@example.com")).toBeChecked();
  await toggle(page, "sso-enforce");
  await expect(page.getByTestId("sso-enforce-active")).toBeVisible();
  // unlinking now would remove the only way for others; for admin the password still works through break-glass
  const anon = await browser.newContext({ baseURL });
  const p2 = await anon.newPage();
  await p2.goto("/login");
  await expect(p2.getByTestId("login-google")).toBeVisible();
  await expect(p2.getByTestId("login-email")).toHaveCount(0);
  await expect(p2.getByTestId("login-submit")).toHaveCount(0);
  await expect(p2.getByTestId("login-sso-enforced")).toBeVisible();
  const denied = await anon.request.post("/api/auth/login", { data: { email: emailOf("dev1"), password: PASSWORD } });
  expect(denied.status()).toBe(403);
  // noodtoegang reveals the form; the break-glass admin gets in with the password
  await p2.getByTestId("login-breakglass").click();
  await p2.getByTestId("login-email").fill(emailOf("admin"));
  await p2.getByTestId("login-password").fill(PASSWORD);
  await p2.getByTestId("login-submit").click();
  await expect(p2.getByTestId("topbar")).toBeVisible();
  await anon.close();

  // normal Google login keeps working, even for somebody else
  const other = await browser.newContext({ baseURL });
  const p3 = await other.newPage();
  mock!.setNext({ sub: "g-dev1", email: "dev1@example.com", hd: "example.com" });
  await clickGoogle(p3);
  await expect(p3.getByTestId("topbar")).toBeVisible();
  await other.close();

  // turn enforcement off again, then unlink on the profile
  await page.goto("/admin/sso");
  await toggle(page, "sso-enforce");
  await expect(page.getByTestId("sso-enforce-active")).toHaveCount(0);
  await page.goto("/profile");
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("google-unlink").click();
  await expect(page.getByTestId("google-link")).toBeVisible();
});

test("every error code has a Dutch message on /login", async ({ page }) => {
  for (const code of ["not_configured", "state_mismatch", "domain_not_allowed", "no_account", "email_not_verified", "account_disabled", "locked", "idp_error", "rate_limited"]) {
    await page.goto(`/login?error=${code}`);
    await expect(page.getByTestId("login-sso-error")).toHaveAttribute("data-code", code);
    await expect(page.getByTestId("login-sso-error")).not.toContainText("sso.error");
  }
  await page.goto("/login?error=<script>alert(1)</script>");
  await expect(page.getByTestId("login-sso-error")).toHaveCount(0);
});
