import { createHmac } from "node:crypto";
import { expect, login, resetDb, test, collectConsoleErrors } from "./fixtures";
import { createTestBoard, startReceiver, type TestBoard } from "./helpers";

let tb: TestBoard;
test.beforeEach(async ({ request, page }) => {
  const seed = await resetDb(request);
  await login(page, "admin");
  tb = await createTestBoard(page.request, seed.workspaceIds["Delivery"]);
});

test("integrations center: not connected states, Slack setup and an inbound webhook that creates items", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/integrations");
  await expect(page.getByTestId("integrations-page")).toBeVisible();
  for (const kind of ["slack", "teams", "github", "gmail", "outlook", "jira", "webhook_in"]) {
    await expect(page.getByTestId(`int-card-${kind}`)).toBeVisible();
    await expect(page.getByTestId(`int-card-status-${kind}`)).toHaveText("Niet verbonden");
  }
  // Slack: connect, paste a webhook url -> connected
  await page.getByTestId("int-connect-slack").click();
  const inst = page.locator('[data-testid^="int-instance-"]').first();
  await expect(inst).toBeVisible();
  await inst.locator('input[type="password"]').fill("http://127.0.0.1:9/slack");
  await inst.getByRole("button", { name: "Opslaan" }).click();
  await expect(page.getByTestId("int-card-status-slack")).toHaveText("Verbonden");
  await expect(page.getByTestId("int-card-status-teams")).toHaveText("Niet verbonden");

  // inbound webhook -> item on the chosen board
  await page.getByTestId("int-connect-webhook_in").click();
  const card = page.getByTestId("int-card-webhook_in");
  await card.locator('select[data-testid^="int-board-"]').selectOption(tb.boardId);
  await card.locator('textarea[data-testid^="int-mapping-"]').fill("date=$.deadline");
  await card.getByRole("button", { name: "Opslaan" }).click();
  await expect(page.getByTestId("int-card-status-webhook_in")).toHaveText("Verbonden");
  const urlText = (await card.locator('[data-testid^="int-url-"]').textContent())!;
  const path = new URL(urlText).pathname;
  const res = await page.request.post(path, { data: { title: "Aanvraag via webhook", deadline: "2026-12-24" }, headers: { Authorization: "" } });
  expect(res.status()).toBe(201);
  const { itemId } = await res.json();
  const item = await (await page.request.get(`/api/v1/items/${itemId}`)).json();
  expect(item.name).toBe("Aanvraag via webhook");
  expect(item.values[tb.columns.date.id]).toEqual({ date: "2026-12-24" });
  expect((await page.request.post("/api/public/hooks/doesnotexist", { data: {} })).status()).toBe(404);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("outgoing webhook: configure in the UI, a board event is delivered signed to a local receiver, delivery log shows it", async ({ page }) => {
  const receiver = await startReceiver();
  try {
    await page.goto("/integrations");
    await page.getByTestId("wh-add").click();
    await page.getByTestId("wh-url").fill(receiver.url);
    await page.getByTestId("wh-board").selectOption(tb.boardId);
    await page.getByTestId("wh-event-all").uncheck();
    await page.getByLabel("create_item", { exact: false }).first().check();
    await page.getByTestId("wh-save").click();
    const row = page.locator('[data-testid^="wh-row-"]').first();
    await expect(row).toBeVisible();
    const id = (await row.getAttribute("data-testid"))!.replace("wh-row-", "");

    await page.request.post("/api/v1/items", { data: { boardId: tb.boardId, groupId: tb.groups.Todo, name: "Naar de receiver" } });
    await expect.poll(() => receiver.requests.length, { timeout: 15_000 }).toBe(1);
    const req = receiver.requests[0];
    expect(JSON.parse(req.body).event).toMatchObject({ type: "create_item", pulseName: "Naar de receiver", boardId: tb.boardId });
    expect(req.headers["x-webhook-event"]).toBe("create_item");

    // signature check with the endpoint secret
    await page.getByTestId(`wh-log-${id}`).click();
    const secret = (await page.getByTestId(`wh-secret-${id}`).textContent())!.trim();
    const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(String(req.headers["x-webhook-signature"]))!;
    expect(createHmac("sha256", secret).update(`${m[1]}.${req.body}`).digest("hex")).toBe(m[2]);
    await expect(page.getByTestId("wh-delivery").first()).toHaveAttribute("data-status", "success");

    // test button sends a ping
    await page.getByTestId(`wh-test-${id}`).click();
    await expect.poll(() => receiver.requests.length).toBe(2);
    expect(JSON.parse(receiver.requests[1].body).event.type).toBe("ping");
  } finally { await receiver.close(); }
});

test("webhook_post action posts to a local receiver with an HMAC signature", async ({ page }) => {
  const receiver = await startReceiver();
  try {
    const r = await page.request.post("/api/v1/automations", { data: {
      boardId: tb.boardId, name: "Webhook bij nieuw item", trigger: { type: "item_created", config: {} },
      actions: [{ type: "webhook_post", config: { url: receiver.url, secret: "geheim", body: '{"naam":"{item}","bord":"{board}"}' } }],
    } });
    expect(r.ok()).toBeTruthy();
    await page.request.post("/api/v1/items", { data: { boardId: tb.boardId, groupId: tb.groups.Todo, name: "Hallo" } });
    await expect.poll(() => receiver.requests.length, { timeout: 15_000 }).toBe(1);
    expect(JSON.parse(receiver.requests[0].body)).toEqual({ naam: "Hallo", bord: "Auto test" });
    const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(String(receiver.requests[0].headers["x-webhook-signature"]))!;
    expect(createHmac("sha256", "geheim").update(`${m[1]}.${receiver.requests[0].body}`).digest("hex")).toBe(m[2]);
  } finally { await receiver.close(); }
});
