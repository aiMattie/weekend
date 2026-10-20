import { collectConsoleErrors, login, newUserPage, resetDb, test } from "../fixtures";
import { expect, createDev, warm } from "./helpers";

test.describe("retrospectives", () => {
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("cards per sprint with voting by two users", async ({ page, browser, baseURL }) => {
    test.setTimeout(180_000);
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    const ids = await createDev(page.request);
    await warm(page.request, ids);
    const sp = await (await page.request.post(`/api/v1/dev/boards/${ids.boards.sprints}/sprints`, { data: { name: "Sprint 1" } })).json();
    await page.goto(`/boards/${ids.boards.retrospectives}`);
    await expect(page.getByTestId("retro-view")).toBeVisible();
    await expect(page.getByTestId("retro-sprint")).toHaveValue(sp.id);

    await page.getByTestId("retro-add-input-keep").fill("Dagelijkse standup");
    await page.getByTestId("retro-add-keep").click();
    await page.getByTestId("retro-add-input-improve").fill("Reviews sneller oppakken");
    await page.getByTestId("retro-add-improve").click();
    await page.getByTestId("retro-add-input-discussion").fill("Meerwerk tijdens de sprint");
    await page.getByTestId("retro-add-discussion").click();
    await expect(page.getByTestId("retro-card")).toHaveCount(3);
    await expect(page.getByTestId("retro-column-keep").getByTestId("retro-card")).toHaveCount(1);

    const card = page.getByTestId("retro-column-improve").getByTestId("retro-card");
    await card.getByTestId("retro-vote").click();
    await expect(card.getByTestId("retro-votes")).toHaveText("1");
    await expect(card.getByTestId("retro-vote")).toHaveAttribute("aria-pressed", "true");

    // a second user votes on the same card
    const dev1 = await newUserPage(browser, baseURL, "dev1");
    await dev1.page.goto(`/boards/${ids.boards.retrospectives}`);
    const wcard = dev1.page.getByTestId("retro-column-improve").getByTestId("retro-card");
    await expect(wcard.getByTestId("retro-votes")).toHaveText("1");
    await expect(wcard.getByTestId("retro-vote")).toHaveAttribute("aria-pressed", "false");
    await wcard.getByTestId("retro-vote").click();
    await expect(wcard.getByTestId("retro-votes")).toHaveText("2");
    // realtime: admin sees it without reloading
    await expect(card.getByTestId("retro-votes")).toHaveText("2", { timeout: 20_000 });
    // toggle off again
    await card.getByTestId("retro-vote").click();
    await expect(card.getByTestId("retro-votes")).toHaveText("1");
    await dev1.context.close();
    expect(errors).toEqual([]);
  });
});
