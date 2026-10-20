import { boardIdByName, collectConsoleErrors, expect, login, newUserPage, resetDb, test } from "../fixtures";

test.describe("boards-extra: WorkDocs", () => {
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("create a doc with slash menu, mention, comment and board/item embeds; persists after reload; mention notifies", async ({ page, browser, baseURL }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    await page.goto("/docs");
    await expect(page.getByTestId("docs-page")).toBeVisible();
    await page.getByTestId("new-doc").click();
    await expect(page).toHaveURL(/\/docs\/\d+$/);
    const docId = page.url().split("/").pop()!;
    await expect(page.getByTestId("doc-page")).toHaveAttribute("data-hydrated", "true");

    await page.getByTestId("doc-title").fill("Projectplan Klanten");
    const editor = page.getByTestId("doc-editor");
    await editor.click();
    await page.keyboard.type("Overleg met @Plan");
    await page.getByTestId("mention-option").first().click();
    await page.keyboard.type(" over de planning");
    await expect(editor.locator(".mention")).toContainText("Planner");

    // slash menu -> heading
    await page.keyboard.press("Enter");
    await page.keyboard.type("/kop 2");
    await page.getByTestId("slash-option").first().click();
    await page.keyboard.type("Aanpak");
    await expect(editor.locator("h2")).toContainText("Aanpak");

    // checklist via toolbar
    await page.keyboard.press("Enter");
    await page.getByTestId("doc-tb-tasks").click();
    await page.keyboard.type("Eerste taak");
    await expect(editor.locator('ul[data-type="taskList"]')).toContainText("Eerste taak");

    // embed an item of board Klanten
    await page.getByTestId("doc-tb-embed-item").click();
    await page.getByTestId("embed-option").filter({ hasText: "Klanten" }).first().click();
    await page.getByTestId("embed-option").first().click();
    await expect(editor.locator('[data-type="embed"]')).toHaveCount(1);

    // comment on the first block
    await editor.locator("p").first().hover();
    await page.getByTestId("block-comment-btn").click();
    await page.getByTestId("comment-input").fill("Klopt dit nog?");
    await page.getByTestId("comment-submit").click();
    await expect(page.getByTestId("doc-comment").filter({ hasText: "Klopt dit nog?" })).toBeVisible();
    await expect(editor.locator(".has-comments")).toHaveCount(1);

    // saved, then survives a reload
    await expect(page.getByTestId("doc-save-state")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
    await page.reload();
    await expect(page.getByTestId("doc-page")).toHaveAttribute("data-hydrated", "true");
    const again = page.getByTestId("doc-editor");
    await expect(page.getByTestId("doc-title")).toHaveValue("Projectplan Klanten");
    await expect(again.locator(".mention")).toContainText("Planner");
    await expect(again.locator("h2")).toContainText("Aanpak");
    await expect(again.locator('[data-type="embed"]')).toHaveCount(1);
    await expect(again.locator(".has-comments")).toHaveCount(1);

    // versions + markdown export
    await page.getByTestId("doc-open-versions").click();
    await page.getByTestId("version-save").click();
    await expect(page.getByTestId("version-row").first()).toBeVisible();
    // autosave snapshotted the first edit, plus the version we just saved
    await expect.poll(() => page.getByTestId("version-row").count()).toBeGreaterThanOrEqual(2);
    const md = await page.request.get(`/api/v1/docs/${docId}/markdown`);
    expect(md.ok()).toBeTruthy();
    expect(await md.text()).toContain("## Aanpak");

    // Planner got a mention notification linking to the doc
    const planner = await newUserPage(browser, baseURL, "pm1");
    const inbox = await planner.page.request.get("/api/v1/inbox?filter=mentioned");
    const body = (await inbox.json()) as { notifications: { link: string | null; type: string }[] };
    expect(body.notifications.some((n) => n.type === "mention" && n.link === `/docs/${docId}`)).toBeTruthy();
    await planner.page.goto(`/docs/${docId}`);
    await expect(planner.page.getByTestId("doc-page")).toHaveAttribute("data-hydrated", "true");
    await expect(planner.page.getByTestId("doc-editor").locator(".mention")).toContainText("Planner");
    await planner.context.close();

    expect(errors).toEqual([]);
  });

  test("attach a doc to an item: getOrCreateForItem is idempotent and breadcrumbs link back", async ({ page }) => {
    await login(page, "admin");
    const req = page.context().request;
    const boardId = await boardIdByName(req, "Klanten");
    const list = (await (await req.get(`/api/v1/items?boardId=${boardId}`)).json()) as { id: string; name: string }[];
    const item = list[0];
    const a = await (await req.post("/api/v1/docs/for-item", { data: { itemId: item.id, columnId: "doc" } })).json();
    const b = await (await req.post("/api/v1/docs/for-item", { data: { itemId: item.id, columnId: "doc" } })).json();
    expect(b.id).toBe(a.id);
    await page.goto(`/docs/${a.id}`);
    await expect(page.getByTestId("doc-page")).toHaveAttribute("data-hydrated", "true");
    await expect(page.getByTestId("doc-title")).toHaveValue(item.name);
    await expect(page.locator("nav[aria-label=breadcrumb]").getByRole("link", { name: item.name })).toHaveAttribute("href", `/boards/${boardId}?item=${item.id}`);
    await page.getByTestId("doc-editor").click();
    await page.keyboard.type("Notities bij dit item");
    await expect(page.getByTestId("doc-save-state")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
    const docs = await (await req.get(`/api/v1/docs?itemId=${item.id}`)).json();
    expect(docs).toHaveLength(1);
    expect(docs[0].excerpt).toContain("Notities bij dit item");
  });

  test("private docs are hidden from non-members", async ({ page, browser, baseURL }) => {
    await login(page, "admin");
    const req = page.context().request;
    const wsList = (await (await req.get("/api/v1/workspaces")).json()) as { id: string; name: string }[];
    const doc = await (await req.post("/api/v1/docs", { data: { workspaceId: wsList.find((w) => w.name === "Delivery")!.id, title: "Geheim", markdown: "alleen voor mij", visibility: "private" } })).json();
    const other = await newUserPage(browser, baseURL, "pm1");
    await other.page.goto(`/docs/${doc.id}`);
    await expect(other.page.getByTestId("doc-not-found")).toBeVisible();
    await other.context.close();
  });
});
