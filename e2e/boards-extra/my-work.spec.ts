import type { APIRequestContext } from "@playwright/test";
import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";

// the dev server is slow when many agents compile at once
const ex = expect.configure({ timeout: 200_000 });

const dayStr = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};

async function post<T>(req: APIRequestContext, url: string, data: unknown): Promise<T> {
  const res = await req.post(url, { data });
  ex(res.ok(), `${url}: ${await res.text()}`).toBeTruthy();
  return res.json() as Promise<T>;
}

test.describe("My work", () => {
  test.describe.configure({ timeout: 300_000 });
  let ids: Awaited<ReturnType<typeof resetDb>>;
  test.beforeEach(async ({ request }) => { ids = await resetDb(request); });

  test("sections, filters and quick status change", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    const req = page.context().request;
    const board = await post<{ id: string }>(req, "/api/v1/boards", { workspaceId: ids.workspaceIds.Delivery, name: "MW board" });
    const mk = (name: string, values: Record<string, unknown>) => post<{ id: string }>(req, "/api/v1/items", { boardId: board.id, name, values });
    const me = ids.userIds.admin;
    await mk("Te laat item", { people: [me], date: dayStr(-3) });
    await mk("Vandaag item", { people: [me], date: dayStr(0) });
    await mk("Later item", { people: [me], date: dayStr(30) });
    await mk("Datumloos item", { people: [me] });
    await mk("Van iemand anders", { people: [ids.userIds.dev1], date: dayStr(0) });

    await page.goto("/my-work");
    await ex(page.getByTestId("my-work-page")).toBeVisible();
    const row = (name: string) => page.locator(`[data-testid="mywork-row"][data-item-name="${name}"]`);
    await ex(page.getByTestId("mywork-section-overdue").getByText("Te laat item")).toBeVisible();
    await ex(page.getByTestId("mywork-section-today").getByText("Vandaag item")).toBeVisible();
    await ex(page.getByTestId("mywork-section-later").getByText("Later item")).toBeVisible();
    await ex(page.getByTestId("mywork-section-no_date").getByText("Datumloos item")).toBeVisible();
    await ex(page.getByText("Van iemand anders")).toHaveCount(0);
    await ex(row("Te laat item")).toContainText("MW board");

    // search filter
    await page.getByPlaceholder("Zoek in mijn items").fill("later");
    await ex(row("Later item")).toBeVisible();
    await ex(row("Vandaag item")).toHaveCount(0);
    await page.getByPlaceholder("Zoek in mijn items").fill("");
    await ex(row("Vandaag item")).toBeVisible();

    // collapse persists
    await page.getByTestId("mywork-toggle-later").click();
    await ex(row("Later item")).toHaveCount(0);
    await page.reload();
    await ex(page.getByTestId("mywork-section-later")).toBeVisible();
    await ex(row("Later item")).toHaveCount(0);
    await page.getByTestId("mywork-toggle-later").click();
    await ex(row("Later item")).toBeVisible();
    await page.screenshot({ path: "test-results-inbox/my-work.png", fullPage: true });

    // quick status change: Done hides the item unless "show done"
    await row("Te laat item").getByTestId("mywork-status").click();
    await page.getByTestId("mywork-status-option").filter({ hasText: "Done" }).click();
    await ex(row("Te laat item")).toHaveCount(0);
    await page.getByTestId("mywork-show-done").click();
    await ex(row("Te laat item")).toBeVisible();
    await ex(row("Te laat item").getByTestId("mywork-status")).toContainText("Done");
    // the change really landed on the board
    const full = await (await req.get(`/api/v1/boards/${board.id}/full`)).json();
    const statusCol = full.columns.find((c: { key: string }) => c.key === "status");
    const item = full.items.find((i: { name: string }) => i.name === "Te laat item");
    ex(item.values[statusCol.id]).toEqual({ index: 1 });
    ex(errors).toEqual([]);
  });

  test("empty state for a user without assignments", async ({ page }) => {
    await login(page, "consultant1");
    await page.goto("/my-work");
    await ex(page.getByTestId("mywork-empty")).toBeVisible();
  });
});
