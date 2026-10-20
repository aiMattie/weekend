import { boardIdByName, login, newUserPage, resetDb, test } from "../fixtures";
import { expect, go } from "./helpers";

test.beforeEach(async ({ request }, info) => { info.setTimeout(300_000); await resetDb(request); });

type Col = { id: string; key: string; title: string; type: string };

test("column permissions: edit only for owners, hidden for others", async ({ page, browser, baseURL }) => {
  await login(page, "admin");
  const boardId = await boardIdByName(page.context().request, "Klanten");
  const full = await (await page.request.get(`/api/v1/boards/${boardId}/full`)).json();
  const col = (full.columns as Col[]).find((c) => c.title === "Uurtarief dev")!;
  const status = (full.columns as Col[]).find((c) => c.type === "status")!;
  const item = full.items[0] as { id: string };
  const dev1 = await newUserPage(browser, baseURL, "dev1");
  const setValue = (p: typeof page, c: Col, v: unknown) => p.request.put(`/api/v1/items/${item.id}/values/${c.id}`, { data: { value: v } });

  expect((await setValue(dev1.page, col, 95)).ok()).toBeTruthy();

  // admin restricts editing of the column in the permissions screen
  await go(page, `/permissions?board=${boardId}`);
  const row = page.getByTestId("column-perm-row").filter({ hasText: "Uurtarief dev" });
  await row.getByTestId("column-edit-mode").selectOption("owners");
  await expect(row.getByTestId("column-edit-mode")).toHaveValue("owners");
  expect((await setValue(dev1.page, col, 100)).status()).toBe(403);
  expect((await setValue(page, col, 105)).ok()).toBeTruthy();           // admin may
  expect((await setValue(dev1.page, status, { label: "Done" })).status()).not.toBe(403); // other columns stay editable

  // specific people
  await row.getByTestId("column-edit-mode").selectOption("specific");
  await row.getByRole("button", { name: "Builder" }).click();
  await expect(row.getByRole("button", { name: "Builder" })).toHaveAttribute("aria-pressed", "true");
  expect((await setValue(dev1.page, col, 110)).ok()).toBeTruthy();

  // hide the column
  await row.getByTestId("column-view-mode").selectOption("owners");
  await expect(row.getByTestId("column-view-mode")).toHaveValue("owners");
  const memberFull = await (await dev1.page.request.get(`/api/v1/boards/${boardId}/full`)).json();
  expect((memberFull.columns as Col[]).some((c) => c.id === col.id)).toBe(false);
  expect(JSON.stringify(memberFull.items)).not.toContain(String(col.id));
  const adminFull = await (await page.request.get(`/api/v1/boards/${boardId}/full`)).json();
  expect((adminFull.columns as Col[]).some((c) => c.id === col.id)).toBe(true);
  await dev1.context.close();
});
