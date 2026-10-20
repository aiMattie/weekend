import { boardIdByName, collectConsoleErrors, login, newUserPage, resetDb, test } from "../fixtures";
import { expect } from "./helpers";

test.beforeEach(async ({ request }, info) => { info.setTimeout(300_000); await resetDb(request); });

test("global search: keyboard shortcut, grouped results, keyboard navigation and recent searches", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await login(page, "admin");
  const klanten = await boardIdByName(page.context().request, "Klanten");
  const fases = await boardIdByName(page.context().request, "Projecten & Fases");
  void fases;
  const item = await (await page.request.post("/api/v1/items", { data: { boardId: klanten, name: "Zoekmachine optimalisatie" } })).json();
  await page.goto("/");
  await expect(page.getByTestId("topbar")).toBeVisible();

  // "/" focuses the search box
  await page.keyboard.press("/");
  await expect(page.getByTestId("global-search")).toBeFocused();
  await page.keyboard.type("klan");
  await expect(page.getByTestId("search-group-board")).toBeVisible();
  await expect(page.getByTestId("search-group-board").getByTestId("search-hit").first()).toContainText("Klanten");

  // items are found in their own group, with the board as context
  await page.getByTestId("global-search").fill("zoekmachine");
  const group = page.getByTestId("search-group-item");
  await expect(group).toBeVisible();
  await expect(group.getByTestId("search-hit")).toContainText("Zoekmachine optimalisatie");
  await expect(group.getByTestId("search-hit")).toContainText("Klanten");
  await expect(page.getByTestId("search-popover").locator("mark").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/boards/${klanten}\\?item=${item.id}`));
  await expect(page.getByTestId("board-page")).toBeVisible();

  // Ctrl+K also opens it, recent searches are remembered
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("global-search")).toBeFocused();
  await expect(page.getByTestId("search-recent").first()).toHaveText("zoekmachine");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("search-popover")).toHaveCount(0);

  // people and workspaces
  await page.getByTestId("global-search").fill("Builder");
  await expect(page.getByTestId("search-group-user")).toBeVisible();
  await page.getByTestId("global-search").fill("Delivery");
  await expect(page.getByTestId("search-group-workspace")).toBeVisible();
  await page.getByTestId("global-search").fill("xqzjwk");
  await expect(page.getByTestId("search-empty")).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("search only returns what the user may see", async ({ page, browser, baseURL }) => {
  await login(page, "admin");
  const klanten = await boardIdByName(page.context().request, "Klanten");
  await page.request.post("/api/v1/items", { data: { boardId: klanten, name: "Vertrouwelijk dossier" } });
  const priv = await (await page.request.post("/api/v1/boards", { data: { workspaceId: (await (await page.request.get("/api/v1/workspaces")).json())[0].id, name: "Geheim directiebord", visibility: "private" } })).json();
  await page.request.post("/api/v1/items", { data: { boardId: priv.id, name: "Geheim directie-item" } });

  const dev1 = await newUserPage(browser, baseURL, "dev1");
  const res = async (q: string) => (await (await dev1.page.request.get(`/api/v1/search?q=${encodeURIComponent(q)}`)).json()) as { total: number; groups: { kind: string; hits: { title: string }[] }[] };
  expect((await res("vertrouwelijk")).total).toBe(1);
  expect((await res("geheim")).total).toBe(0);
  const admin = async (q: string) => (await (await page.request.get(`/api/v1/search?q=${encodeURIComponent(q)}`)).json()) as { total: number };
  expect((await admin("geheim")).total).toBe(2);
  await dev1.page.goto("/");
  await dev1.page.getByTestId("global-search").fill("geheim");
  await expect(dev1.page.getByTestId("search-empty")).toBeVisible();
  await dev1.context.close();
});
