import { expect, login, resetDb, test, collectConsoleErrors } from "./fixtures";
import { createTestBoard, type TestBoard } from "./helpers";

let tb: TestBoard;
let seed: Awaited<ReturnType<typeof resetDb>>;
test.beforeEach(async ({ request, page }) => {
  seed = await resetDb(request);
  await login(page, "admin");
  tb = await createTestBoard(page.request, seed.workspaceIds["Delivery"]);
});

test("workflow builder: trigger, approval step and a branch, draft then publish, approve a run", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/workflows");
  await page.getByTestId("wf-new-board").selectOption(tb.boardId);
  await page.getByTestId("wf-new-name").fill("Goedkeuring nieuwe items");
  await page.getByTestId("wf-new").click();
  await expect(page.getByTestId("workflow-editor")).toBeVisible();
  await expect(page.getByTestId("wf-state")).toHaveText("Concept");

  // replace the default step by: approval -> branch(owner empty ? update A : update B)
  await page.getByTestId("wf-remove-step").first().click();
  await page.getByTestId("wf-add-approval-0-0").click();
  await page.locator('input[data-testid^="wf-approval-msg-"]').fill("Mag dit item door?");
  await page.locator('select[data-testid^="wf-approvers-"][data-testid$="-add"]').selectOption(seed.userIds.admin);
  await page.getByTestId("wf-add-branch-0-1").click();
  await page.getByTestId("wf-cond-0-1-0-block").selectOption("column_is_empty");
  await page.getByTestId("wf-cond-0-1-0-columnId").selectOption({ label: "Owner" });
  await page.getByTestId("wf-add-step-1-0").click();
  await page.getByTestId("wf-action-1-0-block").selectOption("create_update");
  await page.getByTestId("wf-action-1-0-text").fill("Geen eigenaar: {item}");
  await page.getByTestId("wf-add-step-2-0").click();
  await page.getByTestId("wf-action-2-0-block").selectOption("create_update");
  await page.getByTestId("wf-action-2-0-text").fill("Heeft eigenaar: {item}");
  await page.getByTestId("wf-save").click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.getByTestId("wf-publish").click();
  await expect(page.getByTestId("wf-state")).toHaveText("Gepubliceerd");

  // a new item starts the run and waits for approval
  const item = await (await page.request.post("/api/v1/items", { data: { boardId: tb.boardId, groupId: tb.groups.Todo, name: "Wacht op akkoord" } })).json();
  await expect.poll(async () => ((await (await page.request.get("/api/v1/automations/approvals")).json()) as unknown[]).length, { timeout: 15_000 }).toBe(1);
  expect(((await (await page.request.get(`/api/v1/items/${item.id}/updates`)).json()) as unknown[]).length).toBe(0);
  await page.goto("/workflows");
  await expect(page.getByTestId("wf-approval")).toBeVisible();
  await page.getByTestId("wf-approve").click();
  await expect.poll(async () => ((await (await page.request.get(`/api/v1/items/${item.id}/updates`)).json()) as { bodyText: string }[]).map((u) => u.bodyText), { timeout: 15_000 }).toEqual(["Geen eigenaar: Wacht op akkoord"]);
  expect(errors, errors.join("\n")).toEqual([]);
});
