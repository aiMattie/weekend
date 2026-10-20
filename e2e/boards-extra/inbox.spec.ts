import { collectConsoleErrors, expect, login, newUserPage, resetDb, test } from "../fixtures";

// the dev server is slow when many agents compile at once
const ex = expect.configure({ timeout: 200_000 });

async function clearInbox(req: import("@playwright/test").APIRequestContext) {
  const page = await (await req.get("/api/v1/inbox?limit=200")).json();
  for (const n of page.notifications) await req.delete(`/api/v1/inbox/${n.id}`);
}

test.describe("Inbox", () => {
  test.describe.configure({ timeout: 300_000 });
  let ids: Awaited<ReturnType<typeof resetDb>>;
  test.beforeEach(async ({ request }) => { ids = await resetDb(request); });

  test("mention flow: bell badge, inbox filters, read, bookmark, settings", async ({ page, browser, baseURL }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    const req = page.context().request;
    await clearInbox(req);
    const board = await (await req.post("/api/v1/boards", { data: { workspaceId: ids.workspaceIds.Delivery, name: "Inbox board" } })).json();
    const item = await (await req.post("/api/v1/items", { data: { boardId: board.id, name: "Inbox item" } })).json();

    await page.goto("/");
    await ex(page.getByTestId("notification-bell")).toBeVisible();
    await ex(page.getByTestId("notification-badge")).toHaveCount(0);

    // pm1 mentions admin in a second browser context
    const other = await newUserPage(browser, baseURL, "pm1");
    const body = `<p><span data-type="mention" data-id="${ids.userIds.admin}" data-label="Admin">@Admin</span> kun je dit bekijken?</p>`;
    const res = await other.context.request.post(`/api/v1/items/${item.id}/updates`, { data: { body } });
    ex(res.ok()).toBeTruthy();
    await other.context.close();

    // badge appears by polling
    await ex(page.getByTestId("notification-badge")).toHaveText("1", { timeout: 25_000 });

    // dropdown
    await page.getByTestId("notification-bell").click();
    await ex(page.getByTestId("bell-dropdown")).toBeVisible();
    await ex(page.getByTestId("bell-item").first()).toContainText("Inbox item");
    await page.getByTestId("bell-view-all").click();

    // inbox page, "I was mentioned"
    await ex(page.getByTestId("inbox-page")).toBeVisible();
    await page.getByTestId("inbox-tab-mentioned").click();
    const row = page.getByTestId("inbox-row").first();
    await ex(row).toContainText("Inbox item");
    await ex(row).toHaveAttribute("data-read", "false");
    await ex(page.getByTestId("inbox-unread-dot")).toBeVisible();
    await page.getByTestId("inbox-tab-unread").click();
    await ex(page.getByTestId("inbox-row")).toHaveCount(1);

    // select -> read + detail with the update text
    await page.getByTestId("inbox-row").first().click();
    await ex(page.getByTestId("inbox-detail-update")).toContainText("kun je dit bekijken?");
    await ex(page.getByTestId("inbox-open-item")).toHaveAttribute("href", `/boards/${board.id}?item=${item.id}`);
    await ex(page.getByTestId("notification-badge")).toHaveCount(0, { timeout: 15_000 });
    await page.screenshot({ path: "test-results-inbox/inbox.png" });

    // bookmark
    await page.getByTestId("inbox-tab-all").click();
    const r2 = page.getByTestId("inbox-row").first();
    await ex(r2).toHaveAttribute("data-read", "true");
    await r2.hover();
    await r2.getByTestId("inbox-bookmark").click();
    await page.getByTestId("inbox-tab-bookmarked").click();
    await ex(page.getByTestId("inbox-row")).toHaveCount(1);

    // settings: switch off in-app mentions -> list empty
    await page.getByTestId("inbox-tab-mentioned").click();
    await ex(page.getByTestId("inbox-row")).toHaveCount(1);
    await page.getByTestId("inbox-settings-button").click();
    await ex(page.getByTestId("inbox-settings")).toBeVisible();
    await page.getByTestId("setting-mention-inapp").click();
    await page.getByText("Opslaan", { exact: true }).click();
    await ex(page.getByTestId("inbox-row")).toHaveCount(0);
    await ex(page.getByTestId("inbox-empty")).toBeVisible();
    ex(errors).toEqual([]);
  });

  test("mark all as read", async ({ page, request }) => {
    await login(page, "admin");
    const req = page.context().request;
    await clearInbox(req);
    for (const title of ["Een", "Twee"]) {
      const r = await req.post("/api/v1/inbox", { data: { userId: ids.userIds.admin, title } });
      ex(r.ok()).toBeTruthy();
    }
    void request;
    await page.goto("/inbox");
    await ex(page.getByTestId("inbox-row")).toHaveCount(2);
    await ex(page.getByTestId("notification-badge")).toHaveText("2");
    await page.getByTestId("inbox-mark-all").click();
    await ex(page.getByTestId("notification-badge")).toHaveCount(0, { timeout: 15_000 });
  });
});
