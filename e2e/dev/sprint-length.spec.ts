import { collectConsoleErrors, login, resetDb, test } from "../fixtures";
import { expect, createDev, warm } from "./helpers";

test.describe("sprint length (Weekend dev)", () => {
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("choosing 1 week in the planning view makes new sprints one week long", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    const api = page.request;
    const ids = await createDev(api);
    await warm(api, ids);

    await page.goto(`/boards/${ids.boards.sprints}`);
    await expect(page.getByTestId("planning-view")).toBeVisible();
    const length = page.getByTestId("sprint-length");
    await expect(length).toHaveValue("2");
    await length.selectOption("1");
    await expect.poll(async () => (await (await api.get(`/api/v1/dev/boards/${ids.boards.sprints}/sprint-settings`)).json()).sprintWeeks).toBe(1);

    await page.getByTestId("create-sprint").click();
    await expect(page.getByTestId("sprint-section")).toHaveCount(1);
    const list = await (await api.get(`/api/v1/dev/boards/${ids.boards.sprints}/sprints`)).json();
    const s = (list.data ?? list)[0];
    const days = (Date.parse(s.endsOn) - Date.parse(s.startsOn)) / 86_400_000;
    expect(days).toBe(4);

    await page.reload();
    await expect(page.getByTestId("sprint-length")).toHaveValue("1");
    await page.screenshot({ path: `${process.env.PW_OUTPUT_DIR ?? "test-results"}/sprint-length.png` });
    expect(errors).toEqual([]);
  });
});
