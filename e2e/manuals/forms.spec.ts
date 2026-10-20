import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";
import { settle, shot } from "./shots";

/** Screenshots for docs/handleiding/07-forms-en-docs.md, part Forms (npm run manuals). */
test.skip(!process.env.RUN_MANUALS, "manual screenshots only run with RUN_MANUALS=1");
test.use({ actionTimeout: 20_000, navigationTimeout: 60_000 }); // fail fast: a hanging step must not block the shared e2e lock

test("handleiding forms: screenshots", async ({ page, browser, baseURL, request }) => {
  test.setTimeout(420_000);
  const errors = collectConsoleErrors(page);
  await resetDb(request);
  await login(page, "admin");

  await page.goto("/forms");
  await expect(page.getByTestId("forms-page")).toBeVisible();
  await page.getByTestId("new-form").click();
  await page.getByTestId("form-name-input").fill("Klantaanvraag");
  await settle(page, 300);
  await shot(page, "extra-forms-nieuw");
  await page.getByRole("button", { name: "Formulier maken" }).click();
  await expect(page.getByTestId("form-builder")).toBeVisible({ timeout: 60_000 });

  await page.locator('[data-testid^="q-row-"][data-question-title="Status"]').click();
  await page.getByTestId("q-title").fill("Hoe urgent is het?");
  await page.getByTestId("tab-design").click();
  await page.getByTestId("f-description").fill("Vul het formulier in, dan maken wij een item aan.");
  await page.getByTestId("f-thank-title").fill("Dank voor je aanvraag");
  await page.getByTestId("f-thank-message").fill("We nemen snel contact op.");
  await expect(page.getByTestId("saved-note")).toBeVisible();
  await page.locator('[data-testid^="q-row-"][data-question-title="Date"]').click();
  await page.getByTestId("q-required").evaluate((el: HTMLElement) => el.click());
  await settle(page, 300);
  await shot(page, "extra-forms-builder");

  await page.getByTestId("publish-toggle").click();
  await expect(page.getByTestId("publish-state")).toHaveText("Gepubliceerd");
  await page.getByTestId("share-form-button").click();
  const link = await page.getByTestId("share-link").inputValue();
  await settle(page, 300);
  await shot(page, "extra-forms-delen");
  await page.keyboard.press("Escape");

  const anon = await browser.newContext({ baseURL, locale: "nl-NL", viewport: { width: 1440, height: 900 } });
  const ap = await anon.newPage();
  await ap.goto(link, { timeout: 90_000 });
  await expect(ap.getByTestId("form-title")).toHaveText("Klantaanvraag");
  await ap.locator('[data-testid^="form-input-"]').first().fill("Nieuwe website voor Delta");
  await ap.locator('input[type="date"]').fill("2026-11-15");
  await ap.locator("select").first().selectOption({ label: "Done" });
  await settle(ap, 300);
  await shot(ap, "extra-forms-invullen");
  await ap.getByTestId("form-submit").click();
  await expect(ap.getByTestId("form-thanks")).toContainText("Dank voor je aanvraag");
  await settle(ap, 300);
  await shot(ap, "extra-forms-bedankt");
  await anon.close();
  expect(errors).toEqual([]);
});
