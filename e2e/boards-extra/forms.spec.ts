import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";

const SHOT = process.env.RUN_MANUALS ? "docs/handleiding/img" : null;

test.describe("boards-extra: WorkForms", () => {
  test.setTimeout(420_000); // first compile of each route in dev can be slow
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("build a form, publish it and submit it anonymously in a fresh browser context", async ({ page, browser, baseURL }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");

    // 1. create the form (new backing board)
    await page.goto("/forms");
    await expect(page.getByTestId("forms-page")).toBeVisible();
    await page.getByTestId("new-form").click();
    await page.getByTestId("form-name-input").fill("Klantaanvraag");
    if (SHOT) await page.screenshot({ path: `${SHOT}/extra-forms-nieuw.png` });
    await page.getByRole("button", { name: "Formulier maken" }).click();
    await expect(page.getByTestId("form-builder")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("builder-name")).toHaveValue("Klantaanvraag");
    const boardHref = await page.getByTestId("open-board").getAttribute("href");

    // 2. edit a question + design
    const statusRow = page.locator('[data-testid^="q-row-"][data-question-title="Status"]');
    await statusRow.click();
    await page.getByTestId("q-title").fill("Hoe urgent is het?");
    await expect(page.getByTestId("form-preview")).toContainText("Hoe urgent is het?");
    await page.getByTestId("tab-design").click();
    await page.getByTestId("f-description").fill("Vul het formulier in, dan maken wij een item aan.");
    await page.getByTestId("f-thank-title").fill("Dank voor je aanvraag");
    await page.getByTestId("f-thank-message").fill("We nemen snel contact op.");
    await expect(page.getByTestId("saved-note")).toBeVisible();
    await expect(page.getByTestId("form-preview")).toContainText("Vul het formulier in");
    // hide the (people) owner question stays hidden, the Date question becomes required
    await page.locator('[data-testid^="q-row-"][data-question-title="Date"]').click();
    await page.getByTestId("q-required").evaluate((el: HTMLElement) => el.click()); // Vibe Toggle hides its input
    await expect(page.locator('[data-testid^="q-row-"][data-question-title="Date"]')).toContainText("*");
    if (SHOT) await page.screenshot({ path: `${SHOT}/extra-forms-builder.png` });

    // 3. publish + share link
    await page.getByTestId("publish-toggle").click();
    await expect(page.getByTestId("publish-state")).toHaveText("Gepubliceerd");
    await page.getByTestId("share-form-button").click();
    const link = await page.getByTestId("share-link").inputValue();
    expect(link).toMatch(/\/f\/[\w-]+$/);
    await expect(page.getByTestId("share-embed")).toHaveValue(/<iframe src=".*\/f\//);
    if (SHOT) await page.screenshot({ path: `${SHOT}/extra-forms-delen.png` });
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.getByTestId("publish-state")).toHaveText("Gepubliceerd");

    // 4. anonymous respondent (new context, no login)
    const anon = await browser.newContext({ baseURL, locale: "nl-NL" });
    const ap = await anon.newPage();
    const anonErrors = collectConsoleErrors(ap);
    await ap.goto(link, { timeout: 90_000 });
    await expect(ap.getByTestId("form-title")).toHaveText("Klantaanvraag");
    await expect(ap.getByTestId("public-form")).toContainText("Vul het formulier in");
    // required field blocks submit
    await ap.locator('[data-testid^="form-input-"]').first().fill("Anoniem verzoek 1");
    await ap.getByTestId("form-submit").click();
    await expect(ap.locator('[data-testid^="form-error-"]')).toHaveCount(1);
    await ap.locator('input[type="date"]').fill("2026-11-15");
    await ap.locator("select").first().selectOption({ label: "Done" });
    if (SHOT) await ap.screenshot({ path: `${SHOT}/extra-forms-invullen.png` });
    await ap.getByTestId("form-submit").click();
    await expect(ap.getByTestId("form-thanks")).toContainText("Dank voor je aanvraag");
    await expect(ap.getByTestId("form-thanks")).toContainText("We nemen snel contact op.");
    expect(anonErrors).toEqual([]);
    await anon.close();

    // 5. the item exists on the backing board
    await page.goto(boardHref!);
    await expect(page.getByTestId("board-page")).toBeVisible();
    const row = page.locator('[data-testid="item-row"][data-item-name="Anoniem verzoek 1"]');
    await expect(row).toBeVisible();
    await expect(row.getByTestId("cell-status")).toContainText("Done");
    expect(errors).toEqual([]);
  });

  test("unpublished forms are not reachable, honeypot is silent and rate limit answers 429", async ({ page, request, baseURL }) => {
    await login(page, "admin");
    const api = page.context().request;
    const created = await (await api.post("/api/v1/forms", { data: { name: "Beveiligd", workspaceId: (await (await api.get("/api/v1/workspaces")).json())[0].id } })).json();
    const token = created.form.token as string;
    const noLogin = await page.context().browser()!.newContext({ baseURL });
    const anon = noLogin.request;
    expect((await anon.get(`/api/public/forms/${token}`)).status()).toBe(404);
    await api.post(`/api/v1/forms/${created.form.id}/publish`, { data: { published: true } });
    const pub = await (await anon.get(`/api/public/forms/${token}`)).json();
    expect(JSON.stringify(pub)).not.toContain("passwordHash");
    const nameQ = pub.questions.find((q: { kind: string }) => q.kind === "name");

    const bot = await anon.post(`/api/public/forms/${token}`, { data: { answers: { [nameQ.id]: "Bot" }, website: "http://spam" } });
    expect(bot.status()).toBe(201);
    expect((await bot.json()).itemId).toBeNull();
    expect((await (await api.get(`/api/v1/forms/${created.form.id}/submissions`)).json()).length).toBe(0);

    let limited = 0;
    for (let i = 0; i < 8; i++) {
      const r = await anon.post(`/api/public/forms/${token}`, { data: { answers: { [nameQ.id]: `Spam ${i}` } } });
      if (r.status() === 429) { limited++; expect(r.headers()["retry-after"]).toBeTruthy(); }
    }
    expect(limited).toBeGreaterThan(0);
    await noLogin.close();
    void request;
  });
});
