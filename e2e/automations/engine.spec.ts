import { expect, login, resetDb, test, collectConsoleErrors } from "./fixtures";
import { createTestBoard, getItem, openCenter, setStatus, startMailCatcher, tick, type TestBoard, openLog } from "./helpers";

let tb: TestBoard;
let seed: Awaited<ReturnType<typeof resetDb>>;
test.beforeEach(async ({ request, page }) => {
  seed = await resetDb(request);
  await login(page, "admin");
  tb = await createTestBoard(page.request, seed.workspaceIds["Delivery"]);
});

test("custom recipe builder: When item is created, if Owner is empty, then post an update", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await openCenter(page, tb.boardId);
  await page.getByTestId("auto-tab-builder").click();
  await page.getByTestId("builder-trigger-block").selectOption("item_created");
  await page.getByTestId("builder-add-condition").click();
  await page.getByTestId("builder-cond-0-block").selectOption("column_is_empty");
  await page.getByTestId("builder-cond-0-columnId").selectOption({ label: "Owner" });
  await page.getByTestId("builder-add-action").click();
  await page.getByTestId("builder-action-0-block").selectOption("create_update");
  await page.getByTestId("builder-action-0-text").fill("Welkom bij {item} op {board}");
  await page.getByTestId("builder-name").fill("Welkomstupdate");
  await page.getByTestId("builder-save").click();
  await expect(page.getByTestId("auto-manage")).toBeVisible();
  await expect(page.getByTestId("auto-name")).toHaveText("Welkomstupdate");

  // an item without owner gets the update, one with an owner does not
  const a = await (await page.request.post("/api/v1/items", { data: { boardId: tb.boardId, groupId: tb.groups.Todo, name: "Zonder eigenaar" } })).json();
  const b = await (await page.request.post("/api/v1/items", { data: { boardId: tb.boardId, groupId: tb.groups.Todo, name: "Met eigenaar", values: { people: [seed.userIds.dev1] } } })).json();
  await expect.poll(async () => ((await (await page.request.get(`/api/v1/items/${a.id}/updates`)).json()) as { bodyText: string }[]).map((u) => u.bodyText), { timeout: 15_000 }).toEqual(["Welkom bij Zonder eigenaar op Auto test"]);
  expect(((await (await page.request.get(`/api/v1/items/${b.id}/updates`)).json()) as unknown[]).length).toBe(0);

  // edit the automation: rename through the builder
  await page.getByTestId("auto-tab-manage").click();
  await page.locator('[data-testid^="auto-edit-"]').click();
  await page.getByTestId("builder-name").fill("Welkomstupdate v2");
  await page.getByTestId("builder-save").click();
  await expect(page.getByTestId("auto-name")).toHaveText("Welkomstupdate v2");
  expect(errors, errors.join("\n")).toEqual([]);
});

test("builder: describe it in a sentence fills the form", async ({ page }) => {
  await openCenter(page, tb.boardId);
  await page.getByTestId("auto-tab-builder").click();
  await page.getByTestId("builder-sentence").fill("When status changes to Done, move item to group Afgerond");
  await page.getByTestId("builder-parse").click();
  await expect(page.getByTestId("builder-trigger-block")).toHaveValue("status_changes_to");
  await expect(page.getByTestId("builder-action-0-block")).toHaveValue("move_item_to_group");
  await page.getByTestId("builder-save").click();
  await expect(page.getByTestId("auto-manage")).toBeVisible();
  await setStatus(page.request, tb.itemId, tb.columns.status.id, "Done");
  await expect.poll(async () => (await getItem(page.request, tb.itemId)).groupId, { timeout: 15_000 }).toBe(tb.groups.Afgerond);
});

test("button trigger: clicking the button column fires the automation", async ({ page }) => {
  const col = await (await page.request.post(`/api/v1/boards/${tb.boardId}/columns`, { data: { title: "Afronden", type: "button" } })).json();
  await openCenter(page, tb.boardId);
  const card = page.getByTestId("recipe-card-button-move");
  await page.getByTestId("auto-search").locator("input").fill("knop");
  await card.getByTestId("token-button-move-group").selectOption({ label: "Afgerond" });
  await expect(card.getByTestId("token-button-move-button")).toHaveValue(col.id);
  await card.getByTestId("recipe-add-button-move").click();
  await expect(page.getByTestId("auto-toast")).toBeVisible();
  await page.getByTestId("automation-center-close").click();
  // click the button in the table
  const row = page.locator(`[data-testid="item-row"][data-item-id="${tb.itemId}"]`);
  await row.locator(`[data-testid="cell-${col.key}"]`).getByRole("button").click();
  await expect.poll(async () => (await getItem(page.request, tb.itemId)).groupId, { timeout: 15_000 }).toBe(tb.groups.Afgerond);
});

test("date arrives trigger fires through the scheduler test hook, once", async ({ page }) => {
  const day = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  await page.request.put(`/api/v1/items/${tb.itemId}/values/${tb.columns.date.id}`, { data: { value: day } });
  const res = await page.request.post("/api/v1/automations", { data: {
    boardId: tb.boardId, name: "Deadline bereikt",
    trigger: { type: "date_arrives", config: { columnId: tb.columns.date.id, direction: "at", time: "09:00" } },
    actions: [{ type: "set_status", config: { columnId: tb.columns.status.id, labelId: "Stuck" } }],
  } });
  expect(res.ok()).toBeTruthy();
  expect((await tick(page.request, new Date(Date.now()).toISOString())).fired).toBe(0);
  expect((await getItem(page.request, tb.itemId)).values[tb.columns.status.id]).toBeUndefined();
  expect((await tick(page.request, `${day}T12:00:00Z`)).fired).toBe(1);
  expect((await getItem(page.request, tb.itemId)).values[tb.columns.status.id]).toEqual({ index: 2 });
  expect((await tick(page.request, `${day}T12:05:00Z`)).fired).toBe(0);
  await openCenter(page, tb.boardId);
  await openLog(page);
  await expect(page.getByTestId("run-row")).toHaveCount(1);
  await expect(page.getByTestId("run-row").first()).toHaveAttribute("data-status", "success");
});

test("notification + email to the mail catcher mock", async ({ page, browser, baseURL }) => {
  const catcher = await startMailCatcher();
  try {
    await page.request.post("/api/test/automations/smtp", { data: { port: catcher.port } });
    const res = await page.request.post("/api/v1/automations", { data: {
      boardId: tb.boardId, name: "Meld nieuwe items",
      trigger: { type: "item_created", config: {} },
      actions: [{ type: "notify", config: { recipients: [seed.userIds.dev1], message: "Nieuw item: {item}", email: true } }],
    } });
    expect(res.ok()).toBeTruthy();
    await page.request.post("/api/v1/items", { data: { boardId: tb.boardId, groupId: tb.groups.Todo, name: "Offerte Example" } });
    await expect.poll(() => catcher.mails.length, { timeout: 15_000 }).toBe(1);
    expect(catcher.mails[0]).toContain("RCPT TO:<dev1@example.com>");
    const body = Buffer.from(/base64\n\n([\s\S]*)/.exec(catcher.mails[0])![1].replace(/\s+/g, ""), "base64").toString();
    expect(body).toContain("/boards/");
    // in-app notification for Builder
    const ctx = await browser.newContext({ baseURL, locale: "nl-NL" });
    await login(ctx, "dev1");
    const memberPage = await ctx.newPage();
    await memberPage.goto("/inbox");
    await expect(memberPage.getByText("Nieuw item: Offerte Example").first()).toBeVisible({ timeout: 15_000 });
    await ctx.close();
  } finally {
    await page.request.post("/api/test/automations/smtp", { data: { port: null } });
    await catcher.close();
  }
});

test("run log, failures with error text and disabling an automation", async ({ page }) => {
  const res = await page.request.post("/api/v1/automations", { data: {
    boardId: tb.boardId, name: "Stuur naar niets", trigger: { type: "item_created", config: {} },
    actions: [{ type: "webhook_post", config: { url: "http://127.0.0.1:1/nothing" } }],
  } });
  const auto = await res.json();
  await page.request.post("/api/v1/items", { data: { boardId: tb.boardId, groupId: tb.groups.Todo, name: "Faal" } });
  await openCenter(page, tb.boardId);
  await openLog(page);
  const row = page.getByTestId("run-row").first();
  await expect(row).toHaveAttribute("data-status", "retrying", { timeout: 15_000 });
  await expect(row.getByTestId("run-error")).toBeVisible();

  // disable via the manage panel: new items no longer create runs
  await page.getByTestId("auto-tab-manage").click();
  await page.getByTestId(`auto-toggle-${auto.id}`).evaluate((el) => (el as HTMLInputElement).click()); // Vibe hides the native switch input
  await expect(page.getByTestId(`auto-row-${auto.id}`)).toHaveAttribute("data-active", "false");
  const before = (await (await page.request.get(`/api/v1/automations/${auto.id}/runs`)).json()).length;
  await page.request.post("/api/v1/items", { data: { boardId: tb.boardId, groupId: tb.groups.Todo, name: "Nog een" } });
  await page.waitForTimeout(1500);
  expect((await (await page.request.get(`/api/v1/automations/${auto.id}/runs`)).json()).length).toBe(before);
  // duplicate and delete
  await page.getByTestId(`auto-duplicate-${auto.id}`).click();
  await expect(page.locator('[data-testid^="auto-row-"]')).toHaveCount(2);
  page.on("dialog", (d) => void d.accept());
  await page.getByTestId(`auto-delete-${auto.id}`).click();
  await expect(page.locator('[data-testid^="auto-row-"]')).toHaveCount(1);
});
