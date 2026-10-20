import type { Page } from "@playwright/test";
import { boardIdByName, collectConsoleErrors, expect, login, newUserPage, resetDb, test } from "../fixtures";

const row = (page: Page, name: string) => page.locator(`[data-testid="item-row"][data-item-name="${name}"]`);

async function itemId(page: Page, boardId: string, name: string): Promise<string> {
  const res = await page.context().request.get(`/api/v1/boards/${boardId}/full`);
  const full = (await res.json()) as { items: { id: string; name: string }[] };
  const it = full.items.find((i) => i.name === name);
  expect(it, `item ${name}`).toBeTruthy();
  return it!.id;
}

async function openPanelViaBubble(page: Page, name: string) {
  await row(page, name).hover();
  await row(page, name).getByTestId("update-bubble").click();
  await expect(page.getByTestId("item-panel")).toBeVisible();
}

/** Wait for the board page, then open the pulse URL of an item (panel on top of the board). */
async function openPulse(page: Page, boardId: string, id: string) {
  await page.goto(`/boards/${boardId}/pulses/${id}`);
  await expect(page.getByTestId("item-panel")).toBeVisible();
}

async function post(page: Page, html: string) {
  const ed = page.getByTestId("update-editor");
  await ed.click();
  await page.keyboard.type(html);
  await page.getByTestId("update-submit").click();
}

/** Types "@<query>" in the focused editor and picks the suggestion with `label`. */
async function mention(page: Page, query: string, label: string, kind: "user" | "team" = "user") {
  await page.keyboard.type(`@${query}`);
  const opt = page.getByTestId("mention-option").filter({ hasText: label }).and(page.locator(`[data-kind="${kind}"]`));
  await expect(opt.first()).toBeVisible();
  await opt.first().click();
}

test.describe("item panel", () => {
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("opens via bubble and via the pulse URL, edits the title, resizes and persists width", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    const boardId = await boardIdByName(page.context().request, "Klanten");
    await page.goto(`/boards/${boardId}`);
    await openPanelViaBubble(page, "Delta");
    await expect(page.getByTestId("panel-title")).toContainText("Delta");
    await expect(page).toHaveURL(/item=/);
    // title edit
    await page.getByTestId("panel-title-text").click();
    await page.getByTestId("panel-title-text-input").fill("Delta BV");
    await page.getByTestId("panel-title-text-input").press("Enter");
    await expect(page.getByTestId("panel-title")).toContainText("Delta BV");
    await expect(row(page, "Delta BV")).toBeVisible();
    // the rename reached the server (the reload below must not race the request)
    await expect.poll(async () => ((await (await page.context().request.get(`/api/v1/boards/${boardId}/full`)).json()) as { items: { name: string }[] }).items.some((i) => i.name === "Delta BV")).toBe(true);
    // resize by dragging the left edge
    const panel = page.getByTestId("item-panel");
    const before = (await panel.boundingBox())!.width;
    const handle = (await page.getByTestId("panel-resize").boundingBox())!;
    await page.mouse.move(handle.x + 3, handle.y + 200);
    await page.mouse.down();
    await page.mouse.move(handle.x - 120, handle.y + 200, { steps: 8 });
    await page.mouse.up();
    const after = (await panel.boundingBox())!.width;
    expect(after).toBeGreaterThan(before + 60);
    await page.reload();
    await expect(page.getByTestId("item-panel")).toBeVisible();
    await expect.poll(async () => (await page.getByTestId("item-panel").boundingBox())!.width).toBeGreaterThan(before + 60);
    // close
    await page.getByTestId("panel-close").click();
    await expect(page.getByTestId("item-panel")).toHaveCount(0);
    // pulse URL
    const id = await itemId(page, boardId, "Delta BV");
    await openPulse(page, boardId, id);
    await expect(page.getByTestId("panel-title")).toContainText("Delta BV");
    // the server-rendered panel is visible before hydration: retry the click until the handler is attached
    await expect(async () => {
      await page.getByTestId("panel-close").click({ timeout: 2000 });
      await expect(page).toHaveURL(new RegExp(`/boards/${boardId}$`), { timeout: 2000 });
    }).toPass({ timeout: 15000 });
    expect(errors).toEqual([]);
  });

  test("update with bold text and an @mention creates a notification; screenshot", async ({ page, browser, baseURL }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    const boardId = await boardIdByName(page.context().request, "Klanten");
    await page.goto(`/boards/${boardId}`);
    await openPanelViaBubble(page, "Delta");
    await page.getByTestId("update-editor").click();
    await page.getByTestId("tb-bold").click();
    await page.keyboard.type("Belangrijk ");
    await page.getByTestId("tb-bold").click();
    await page.keyboard.type("Hallo ");
    await mention(page, "Bu", "Builder");
    await page.keyboard.type(" kijk even mee");
    await page.getByTestId("update-submit").click();
    const card = page.getByTestId("update-card").first();
    await expect(card.getByTestId("update-body")).toContainText("Belangrijk Hallo @Builder kijk even mee");
    await expect(card.locator("strong")).toHaveText(/Belangrijk/);
    await expect(card.locator('span[data-type="mention"]')).toHaveText("@Builder");
    // the mentioned user got a notification through the service
    const dev1 = await newUserPage(browser, baseURL, "dev1");
    const inbox = await (await dev1.context.request.get("/api/v1/inbox?filter=mentioned")).json();
    expect(inbox.notifications.some((n: { type: string; title: string }) => n.type === "mention" && n.title.includes("Admin"))).toBe(true);
    // admin himself did not get one
    const mine = await (await page.context().request.get("/api/v1/inbox?filter=mentioned")).json();
    expect(mine.notifications).toHaveLength(0);
    await page.screenshot({ path: "docs/design/tableux/tableux-panel-updates.png" });
    await dev1.context.close();
    expect(errors).toEqual([]);
  });

  test("mentioning a team notifies its members", async ({ page, browser, baseURL }) => {
    await login(page, "admin");
    const boardId = await boardIdByName(page.context().request, "Klanten");
    await openPulse(page, boardId, await itemId(page, boardId, "Delta"));
    await page.getByTestId("update-editor").click();
    await page.keyboard.type("Team ");
    await mention(page, "DE", "DEV", "team");
    await page.keyboard.type(" graag oppakken");
    await page.getByTestId("update-submit").click();
    await expect(page.getByTestId("update-card").first().locator('span[data-type="mention"]')).toHaveText("@DEV");
    for (const who of ["dev1", "dev2"] as const) {
      const u = await newUserPage(browser, baseURL, who);
      const inbox = await (await u.context.request.get("/api/v1/inbox?filter=mentioned")).json();
      expect(inbox.notifications.filter((n: { type: string }) => n.type === "mention"), who).toHaveLength(1);
      await u.context.close();
    }
  });

  test("reply, like, edit, pin order and delete", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    page.on("dialog", (d) => void d.accept());
    await login(page, "admin");
    const boardId = await boardIdByName(page.context().request, "Klanten");
    await openPulse(page, boardId, await itemId(page, boardId, "Delta"));
    await expect(page.getByTestId("updates-empty")).toBeVisible();
    await post(page, "Eerste update");
    await expect(page.getByTestId("update-card")).toHaveCount(1);
    await post(page, "Tweede update");
    await expect(page.getByTestId("update-card")).toHaveCount(2);
    // newest first
    await expect(page.getByTestId("update-card").first()).toContainText("Tweede update");
    // pin the older one -> moves to the top
    await page.getByTestId("update-card").filter({ hasText: "Eerste update" }).getByTestId("update-pin").click();
    await expect(page.getByTestId("update-card").first()).toContainText("Eerste update");
    await expect(page.getByTestId("update-card").first().getByTestId("update-pinned-icon")).toBeVisible();
    // like toggles
    const first = page.getByTestId("update-card").first();
    await first.getByTestId("update-like").click();
    await expect(first.getByTestId("update-like")).toHaveAttribute("data-liked", "true");
    await expect(first.getByTestId("update-like")).toContainText("(1)");
    await first.getByTestId("update-like").click();
    await expect(first.getByTestId("update-like")).toHaveAttribute("data-liked", "false");
    // reply
    await first.getByTestId("update-reply").click();
    await page.getByTestId("reply-editor").click();
    await page.keyboard.type("Een antwoord");
    await page.getByTestId("reply-submit").click();
    await expect(first).toContainText("Een antwoord");
    await expect(first.getByTestId("update-card")).toHaveCount(1);
    await expect(first.getByTestId("update-reply").first()).toContainText("(1)");
    // edit own update
    await first.getByTestId("update-edit").first().click();
    await page.getByTestId("update-edit-editor").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" aangepast");
    await page.getByTestId("update-edit-submit").click();
    await expect(first.getByTestId("update-body").first()).toContainText("Eerste update aangepast");
    await expect(first).toContainText("bewerkt");
    // delete the second update
    await page.getByTestId("update-card").filter({ hasText: "Tweede update" }).getByTestId("update-delete").click();
    await expect(page.getByTestId("update-card").filter({ hasText: "Tweede update" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("seen by and unread marks for a second user, live updates in an open panel", async ({ page, browser, baseURL }) => {
    await login(page, "admin");
    const boardId = await boardIdByName(page.context().request, "Klanten");
    const id = await itemId(page, boardId, "Delta");
    await openPulse(page, boardId, id);
    const other = await newUserPage(browser, baseURL, "pm1");
    await openPulse(other.page, boardId, id);
    // live: admin posts, pm1 sees it without reloading and as unread
    await post(page, "Live bericht");
    const theirs = other.page.getByTestId("update-card").filter({ hasText: "Live bericht" });
    await expect(theirs).toBeVisible();
    await expect(theirs).toHaveAttribute("data-unread", "true");
    await expect(theirs.getByTestId("update-unread-dot")).toBeVisible();
    // after a moment the panel marks it as seen: admin's card shows "seen by"
    const mine = page.getByTestId("update-card").filter({ hasText: "Live bericht" });
    await expect(mine.getByTestId("update-seen-by")).toBeVisible({ timeout: 15000 });
    await expect(mine.getByTestId("update-seen-count")).toContainText("1");
    await expect(mine.getByTestId("update-seen-by")).toHaveAttribute("title", /Planner/);
    // reopening later: no unread mark any more
    await other.page.reload();
    await expect(other.page.getByTestId("update-card").filter({ hasText: "Live bericht" })).toHaveAttribute("data-unread", "false");
    // pm1 replies, admin sees it live
    await other.page.getByTestId("update-card").filter({ hasText: "Live bericht" }).getByTestId("update-reply").click();
    await other.page.getByTestId("reply-editor").click();
    await other.page.keyboard.type("Antwoord van Planner");
    await other.page.getByTestId("reply-submit").click();
    await expect(mine).toContainText("Antwoord van Planner");
    await other.context.close();
  });

  test("files: upload in the Files tab, attach to an update (lightbox), delete", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    page.on("dialog", (d) => void d.accept());
    await login(page, "admin");
    const boardId = await boardIdByName(page.context().request, "Klanten");
    await openPulse(page, boardId, await itemId(page, boardId, "Delta"));
    await page.getByTestId("tab-files").click();
    await expect(page.getByTestId("files-empty")).toBeVisible();
    await page.getByTestId("files-input").setInputFiles({ name: "notities.txt", mimeType: "text/plain", buffer: Buffer.from("hallo wereld") });
    const fileRow = page.getByTestId("file-row").filter({ hasText: "notities.txt" });
    await expect(fileRow).toBeVisible();
    await expect(fileRow).toContainText("12 B");
    // 1x1 png in an update
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    await page.getByTestId("tab-updates").click();
    await page.getByTestId("update-file-input").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: png });
    await expect(page.getByTestId("pending-file")).toContainText("pixel.png");
    await page.getByTestId("update-editor").click();
    await page.keyboard.type("Zie bijlage");
    await page.getByTestId("update-submit").click();
    const card = page.getByTestId("update-card").first();
    await expect(card.getByTestId("attachment")).toHaveAttribute("data-asset-name", "pixel.png");
    await card.locator("button img").click();
    await expect(page.getByTestId("lightbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("lightbox")).toHaveCount(0);
    // both files are in the Files tab; delete one
    await page.getByTestId("tab-files").click();
    await expect(page.getByTestId("file-row")).toHaveCount(2);
    await page.getByTestId("file-row").filter({ hasText: "notities.txt" }).getByTestId("file-delete").click();
    await expect(page.getByTestId("file-row")).toHaveCount(1);
    await page.screenshot({ path: "docs/design/tableux/tableux-panel-files.png" });
    // an update with only a file (no text)
    await page.getByTestId("tab-updates").click();
    await page.getByTestId("update-file-input").setInputFiles({ name: "alleen.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
    await page.getByTestId("update-submit").click();
    await expect(page.getByTestId("update-card").first().getByTestId("attachment")).toHaveAttribute("data-asset-name", "alleen.txt");
    expect(errors).toEqual([]);
  });

  test("activity log shows changes and filters by column and person", async ({ page, browser, baseURL }) => {
    await login(page, "admin");
    const boardId = await boardIdByName(page.context().request, "Klanten");
    const id = await itemId(page, boardId, "Delta");
    // admin changes the status via the grid, dev1 changes a rate through the API
    await page.goto(`/boards/${boardId}`);
    await row(page, "Delta").getByTestId("cell-status").click();
    await page.getByTestId("status-option").filter({ hasText: "Done" }).first().click();
    await expect(row(page, "Delta").getByTestId("cell-status")).toContainText("Done");
    const dev1 = await newUserPage(browser, baseURL, "dev1");
    const put = await dev1.context.request.put(`/api/v1/items/${id}/values`, { data: { uurtarief_dev: 111 } });
    expect(put.ok()).toBeTruthy();
    await dev1.context.close();
    await openPulse(page, boardId, id);
    await page.getByTestId("tab-activity").click();
    const rows = page.getByTestId("activity-row");
    await expect(rows.filter({ hasText: "Status" }).first()).toContainText("Admin User heeft Status gewijzigd");
    await expect(rows.filter({ hasText: "Uurtarief dev" }).first()).toContainText("Builder");
    const all = await rows.count();
    // filter by column
    await page.getByTestId("activity-filter-column").selectOption({ label: "Status" });
    await expect(rows.first()).toContainText("Status gewijzigd");
    await expect(rows.filter({ hasText: "Uurtarief dev" })).toHaveCount(0);
    await page.getByTestId("activity-filter-clear").click();
    await expect(rows).toHaveCount(all);
    // filter by person
    await page.getByTestId("activity-filter-person").selectOption({ label: "Builder" });
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Uurtarief dev");
    await page.getByTestId("activity-filter-person").selectOption({ label: "Admin User" });
    await page.getByTestId("activity-filter-column").selectOption({ label: "Uurtarief dev" });
    await expect(page.getByTestId("activity-empty")).toBeVisible();
    await page.getByTestId("activity-filter-clear").click();
    await page.screenshot({ path: "docs/design/tableux/tableux-panel-activity.png" });
  });

  test("item actions: copy link, convert to subitem and back, details editing, prev/next", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await login(page, "admin");
    const boardId = await boardIdByName(page.context().request, "Klanten");
    const delta = await itemId(page, boardId, "Delta");
    const mega = await itemId(page, boardId, "Bravo");
    await openPulse(page, boardId, mega);
    // copy link
    await page.getByTestId("panel-menu").click();
    await page.getByTestId("panel-copy-link").click();
    await expect(page.getByTestId("panel-toast")).toContainText("gekopieerd");
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(`${new URL(page.url()).origin}/boards/${boardId}/pulses/${mega}`);
    // details: collapsed by default, edit a field
    await expect(page.getByTestId("panel-field-status")).toHaveCount(0);
    await page.getByTestId("panel-details-toggle").click();
    await page.getByTestId("panel-field-status").getByText("Stuck").click();
    await page.getByTestId("status-option").filter({ hasText: "Done" }).first().click();
    await expect(page.getByTestId("panel-field-status")).toContainText("Done");
    // convert to subitem of Delta
    await page.getByTestId("panel-menu").click();
    await page.getByTestId("panel-convert-subitem").click();
    await page.getByTestId("picker-option").filter({ hasText: "Delta" }).first().click();
    await expect(page.getByTestId("panel-parent")).toContainText("Delta");
    await expect(row(page, "Bravo")).toHaveCount(0);
    // back to a normal item
    await page.getByTestId("panel-menu").click();
    await page.getByTestId("panel-convert-item").click();
    await expect(page.getByTestId("panel-parent")).toHaveCount(0);
    await expect(row(page, "Bravo")).toBeVisible();
    // prev / next walk through the items
    await openPulse(page, boardId, delta);
    await page.getByTestId("panel-next").click();
    await expect(page.getByTestId("item-panel")).not.toHaveAttribute("data-item-id", delta);
    await page.getByTestId("panel-prev").click();
    await expect(page.getByTestId("item-panel")).toHaveAttribute("data-item-id", delta);
    await page.screenshot({ path: "docs/design/tableux/tableux-panel-details.png" });
    expect(errors).toEqual([]);
  });

  test("move to board and archive from the actions menu", async ({ page }) => {
    page.on("dialog", (d) => void d.accept());
    await login(page, "admin");
    const boardId = await boardIdByName(page.context().request, "Klanten");
    const target = await boardIdByName(page.context().request, "Projecten & Fases");
    const id = await itemId(page, boardId, "Charlie");
    await openPulse(page, boardId, id);
    await page.getByTestId("panel-menu").click();
    await page.getByTestId("panel-move-board").click();
    await page.getByTestId("picker-option").filter({ hasText: "Projecten & Fases" }).click();
    await expect(page.getByTestId("item-panel")).toHaveCount(0);
    const targetFull = await (await page.context().request.get(`/api/v1/boards/${target}/full`)).json();
    expect(targetFull.items.some((i: { id: string }) => i.id === id)).toBe(true);
    // archive another item
    const id2 = await itemId(page, boardId, "Bravo");
    await openPulse(page, boardId, id2);
    await page.getByTestId("panel-menu").click();
    await page.getByTestId("panel-archive").click();
    await expect(page.getByTestId("item-panel")).toHaveCount(0);
    await expect(row(page, "Bravo")).toHaveCount(0);
  });
});
