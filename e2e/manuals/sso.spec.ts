import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";
import { googleReset, putSso, toggle, useMockGoogle } from "../sso/helpers";
import type { MockGoogle } from "../sso/mock-google";
import { settle, shot } from "./shots";

/** Screenshots for docs/handleiding/12-beheer-en-rechten.md > "Inloggen met Google" (npm run manuals). Uses the local mock IdP. */
test.skip(!process.env.RUN_MANUALS, "manual screenshots only run with RUN_MANUALS=1");
test.use({ actionTimeout: 20_000, navigationTimeout: 60_000 });

let mock: MockGoogle | null = null;
test.afterAll(async ({ request }) => { await googleReset(request).catch(() => undefined); await mock?.close(); });

test("handleiding inloggen met Google: screenshots", async ({ page, browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const errors = collectConsoleErrors(page);
  await resetDb(request);
  mock = await useMockGoogle(request, baseURL!);
  test.skip(!mock, "needs a server started with E2E_RESET=1");
  const idp = mock!;

  // login page with the Google button, and with an error from Google
  const anon = await browser.newContext({ baseURL, locale: "nl-NL", viewport: { width: 1440, height: 900 } });
  const lp = await anon.newPage();
  await lp.goto("/login");
  await expect(lp.getByTestId("login-google")).toBeVisible();
  await settle(lp, 300);
  await shot(lp, "sso-login");
  await lp.goto("/login?error=domain_not_allowed");
  await expect(lp.getByTestId("login-sso-error")).toBeVisible();
  await shot(lp, "sso-login-fout");
  await anon.close();

  // admin page: admin links his Google account first, then sets domains and auto-provisioning
  await login(page, "admin");
  idp.setNext({ sub: "g-admin", email: "admin@example.com", name: "Admin", hd: "example.com" });
  await page.goto("/profile");
  await page.getByTestId("google-link").click();
  await expect(page.getByTestId("google-linked-email")).toBeVisible();
  await page.getByTestId("profile-google").scrollIntoViewIfNeeded();
  await shot(page.getByTestId("profile-google"), "sso-profiel");

  await putSso(page.request, { allowedDomains: ["example.com"], autoProvision: true });
  await page.goto("/admin/sso");
  await expect(page.getByTestId("sso-status")).toHaveText("Geconfigureerd");
  await expect(page.getByTestId("sso-identity-row")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1900 }); // the whole page in one picture
  await settle(page);
  await shot(page, "sso-admin");
  await page.setViewportSize({ width: 1440, height: 900 });

  // "alleen inloggen met Google" on, login page shows only the Google button
  await page.getByTestId("sso-breakglass-admin@example.com").click();
  await expect(page.getByTestId("sso-breakglass-admin@example.com")).toBeChecked();
  await toggle(page, "sso-enforce");
  await expect(page.getByTestId("sso-enforce-active")).toBeVisible();
  const anon2 = await browser.newContext({ baseURL, locale: "nl-NL", viewport: { width: 1440, height: 900 } });
  const lp2 = await anon2.newPage();
  await lp2.goto("/login");
  await expect(lp2.getByTestId("login-breakglass")).toBeVisible();
  await settle(lp2, 300);
  await shot(lp2, "sso-login-alleen-google");
  await anon2.close();
  await toggle(page, "sso-enforce");
  await expect(page.getByTestId("sso-enforce-active")).toHaveCount(0);

  expect(errors).toEqual([]);
});
