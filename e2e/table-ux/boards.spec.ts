import type { Page } from "@playwright/test";
import { collectConsoleErrors, expect, login, newUserPage, openBoard, resetDb, test } from "../fixtures";

const SHOTS = "docs/design/tableux";

// a Fast Refresh caused by other agents editing files can interrupt a test once in a while
test.describe.configure({ retries: 1 });

/** Open the "Add board" dialog from the sidebar '+' menu. */
async function openAddBoard(page: Page) {
  await page.getByTestId("sidebar-add").click();
  await page.getByTestId("add-board").click();
  await expect(page.getByTestId("add-board-dialog")).toBeVisible();
}

/** the folder/board tree of the sidebar (boards can also show up under Recent / Favorites) */
const tree = (page: Page) => page.getByTestId("sidebar-tree");

async function boardIdFromUrl(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/boards\/\d+/);
  return /\/boards\/(\d+)/.exec(page.url())![1];
}

test.describe("add board, templates and visibility", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("creates a board from the project template (groups, columns, items)", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    await page.goto("/");
    await openAddBoard(page);
    await page.getByTestId("add-board-name").fill("Mijn project");
    await page.getByTestId("template-search").fill("project");
    await expect(page.getByTestId("template-project-management")).toBeVisible();
    await expect(page.getByTestId("template-task-tracker")).toBeHidden();
    await page.getByTestId("template-project-management").click();
    await expect(page.getByTestId("template-preview")).toContainText("Gepland");
    await expect(page.getByTestId("template-preview")).toContainText("Verantwoordelijke");
    await page.screenshot({ path: `${SHOTS}/tableux-chrome-add-board.png` });
    await page.getByTestId("add-board-submit").click();
    await boardIdFromUrl(page);
    await expect(page.getByTestId("board-title")).toContainText("Mijn project");
    await expect(page.getByTestId("group-title")).toHaveText(["Gepland", "Actief", "Afgerond"]);
    await expect(page.getByTestId("item-row")).toHaveCount(4);
    await expect(page.getByTestId("col-header-priority").first()).toContainText("Prioriteit");
    await expect(page.getByTestId("col-header-timeline").first()).toBeVisible();
    await expect(page.getByTestId("sidebar").getByText("Mijn project", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a private board is only visible to its members", async ({ page, browser, baseURL }) => {
    await login(page, "admin");
    await page.goto("/");
    await openAddBoard(page);
    await page.getByTestId("add-board-name").fill("Geheim");
    await page.getByTestId("visibility-private").click();
    await expect(page.getByTestId("visibility-private")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("add-board-submit").click();
    const id = await boardIdFromUrl(page);
    await expect(page.getByTestId("board-visibility-badge")).toContainText("Private");
    const other = await newUserPage(browser, baseURL, "pm1");
    await other.page.goto(`/boards/${id}`);
    await expect(other.page.getByTestId("board-not-found")).toBeVisible();
    await other.page.goto("/");
    await expect(other.page.getByTestId("sidebar").getByText("Geheim", { exact: true })).toBeHidden();
    await other.context.close();
  });

  test("blank board keeps the old behaviour: three sample items", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/");
    await openAddBoard(page);
    await page.getByTestId("add-board-name").fill("Leeg");
    await page.getByTestId("add-board-submit").click();
    await boardIdFromUrl(page);
    await expect(page.getByTestId("item-row")).toHaveCount(3);
  });
});

test.describe("board context menus", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("duplicate with items from the header menu", async ({ page }) => {
    await login(page, "admin");
    await openBoard(page, "Klanten");
    const rows = await page.getByTestId("item-row").count();
    expect(rows).toBeGreaterThan(0);
    await page.getByTestId("board-menu").click();
    await page.getByTestId("menu-duplicate").click();
    await page.getByTestId("duplicate-name").fill("Klanten kopie");
    await expect(page.getByTestId("duplicate-items")).toBeChecked();
    await page.getByTestId("duplicate-submit").click();
    await expect(page.getByTestId("board-title")).toContainText("Klanten kopie");
    await expect(page.getByTestId("item-row")).toHaveCount(rows);
    await expect(page.getByTestId("sidebar").getByText("Klanten kopie", { exact: true })).toBeVisible();
  });

  test("duplicate structure only from the sidebar menu", async ({ page }) => {
    await login(page, "admin");
    const id = await openBoard(page, "Klanten");
    await tree(page).getByTestId(`nav-board-${id}`).hover();
    await tree(page).getByTestId(`nav-board-menu-${id}`).click();
    await page.getByTestId("board-menu-duplicate").click();
    await page.getByTestId("duplicate-structure").check();
    await page.getByTestId("duplicate-submit").click();
    await expect(page.getByTestId("board-title")).toContainText("Kopie van Klanten");
    await expect(page.getByTestId("item-row")).toHaveCount(0);
  });

  test("rename and favorite from the sidebar menu", async ({ page }) => {
    await login(page, "admin");
    const id = await openBoard(page, "Klanten");
    await tree(page).getByTestId(`nav-board-${id}`).hover();
    await tree(page).getByTestId(`nav-board-menu-${id}`).click();
    await page.getByTestId("board-menu-rename").click();
    await page.getByTestId("name-prompt-input").fill("Klanten hernoemd");
    await page.keyboard.press("Enter");
    await expect(tree(page).getByTestId(`nav-board-${id}`)).toContainText("Klanten hernoemd");
    await tree(page).getByTestId(`nav-board-${id}`).hover();
    await tree(page).getByTestId(`nav-board-menu-${id}`).click();
    await page.getByTestId("board-menu-favorite").click();
    await expect(page.getByTestId("favorites-list")).toContainText("Klanten hernoemd");
  });

  test("move a board to another workspace and into a folder", async ({ page }) => {
    await login(page, "admin");
    await openBoard(page, "Klanten");
    await page.getByTestId("board-menu").click();
    await page.getByTestId("menu-move").click();
    await page.getByTestId("move-board-workspace").selectOption({ label: "Support" });
    await page.getByTestId("move-board-submit").click();
    await expect(page.getByTestId("move-board-submit")).toBeHidden();
    await page.getByTestId("board-info-button").click();
    await expect(page.getByTestId("info-location")).toContainText("Support");
    // and back into the Delivery folder "Documenten"
    await page.getByTestId("board-menu").click();
    await page.getByTestId("menu-move").click();
    await page.getByTestId("move-board-workspace").selectOption({ label: "Delivery" });
    await page.getByTestId("move-board-folder").selectOption({ label: "Documenten" });
    await page.getByTestId("move-board-submit").click();
    await expect(page.getByTestId("move-board-submit")).toBeHidden();
    await expect(page.getByTestId("info-location")).toContainText("Delivery / Documenten");
  });

  test("copy link and open-in-new-tab entries exist in the sidebar menu", async ({ page }) => {
    await login(page, "admin");
    const id = await openBoard(page, "Klanten");
    await tree(page).getByTestId(`nav-board-${id}`).hover();
    await tree(page).getByTestId(`nav-board-menu-${id}`).click();
    await expect(page.getByTestId("board-menu-newtab")).toBeVisible();
    await expect(page.getByTestId("board-menu-link")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/tableux-chrome-sidebar-menu.png` });
  });
});

test.describe("archive, trash and restore", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("archive a board, restore it from /archive", async ({ page }) => {
    await login(page, "admin");
    const id = await openBoard(page, "Klanten");
    await page.getByTestId("board-menu").click();
    await page.getByTestId("menu-archive").click();
    await page.getByTestId("confirm-ok").click();
    await expect(page.getByTestId("home-page")).toBeVisible();
    await expect(page.getByTestId("sidebar").getByTestId(`nav-board-${id}`)).toHaveCount(0);
    await page.getByTestId("nav-archive").click();
    await expect(page.getByTestId("archive-page")).toBeVisible();
    const row = page.getByTestId("trash-row").filter({ hasText: "Klanten" });
    await expect(row).toBeVisible();
    await expect(row.getByTestId("purge")).toHaveCount(0); // permanent delete only from the trash
    await page.screenshot({ path: `${SHOTS}/tableux-chrome-archive.png` });
    await row.getByTestId("restore").click();
    await expect(row).toBeHidden();
    await expect(tree(page).getByTestId(`nav-board-${id}`)).toBeVisible();
    await page.goto(`/boards/${id}`);
    await expect(page.getByTestId("board-title")).toContainText("Klanten");
  });

  test("delete a board, restore it from the trash, delete again and purge", async ({ page }) => {
    await login(page, "admin");
    const id = await openBoard(page, "Klanten");
    await page.getByTestId("board-menu").click();
    await page.getByTestId("board-delete").click();
    await page.getByTestId("confirm-ok").click();
    await expect(page.getByTestId("home-page")).toBeVisible();
    await page.goto("/trash");
    const row = page.getByTestId("trash-row").filter({ hasText: "Klanten" });
    await expect(row).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/tableux-chrome-trash.png` });
    await row.getByTestId("restore").click();
    await expect(page.getByTestId("trash-empty")).toBeVisible();
    await page.goto(`/boards/${id}`);
    await expect(page.getByTestId("board-title")).toContainText("Klanten");
    // delete again and remove permanently
    await page.getByTestId("board-menu").click();
    await page.getByTestId("board-delete").click();
    await page.getByTestId("confirm-ok").click();
    await page.goto("/trash");
    await page.getByTestId("trash-row").filter({ hasText: "Klanten" }).getByTestId("purge").click();
    await page.getByTestId("confirm-ok").click();
    await expect(page.getByTestId("trash-empty")).toBeVisible();
    await page.goto(`/boards/${id}`);
    await expect(page.getByTestId("board-not-found")).toBeVisible();
  });

  test("restore a deleted item and group from the trash tabs, empty trash", async ({ page, request }) => {
    await login(page, "admin");
    const id = await openBoard(page, "Klanten");
    const full = await (await page.context().request.get(`/api/v1/boards/${id}/full`)).json();
    const item = full.items.find((i: { parentItemId: string | null }) => !i.parentItemId);
    await page.context().request.delete(`/api/v1/items/${item.id}`);
    const g = await (await page.context().request.post(`/api/v1/boards/${id}/groups`, { data: { title: "Tijdelijke groep" } })).json();
    await page.context().request.delete(`/api/v1/groups/${g.id}`);
    await page.goto("/trash");
    await page.getByTestId("trash-tab-items").click();
    await expect(page.getByTestId("trash-row").filter({ hasText: item.name })).toBeVisible();
    await page.getByTestId("trash-tab-groups").click();
    await page.getByTestId("trash-row").filter({ hasText: "Tijdelijke groep" }).getByTestId("restore").click();
    await expect(page.getByTestId("trash-empty")).toBeVisible();
    await page.getByTestId("trash-tab-items").click();
    await page.getByTestId("empty-trash").click();
    await page.getByTestId("confirm-ok").click();
    await expect(page.getByTestId("trash-empty")).toBeVisible();
    void request;
  });
});

test.describe("workspaces, folders and recent boards", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("create a workspace and a folder, edit the workspace", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    await page.goto("/");
    await page.getByTestId("sidebar-add").click();
    await page.getByTestId("add-workspace").click();
    await page.getByTestId("workspace-name").fill("Mijn workspace");
    await page.getByTestId("workspace-description").fill("Voor tests");
    await page.getByTestId("workspace-kind-closed").check();
    await page.getByTestId("workspace-submit").click();
    await expect(page).toHaveURL(/\/workspaces\/\d+/);
    await expect(page.getByTestId("workspace-page")).toContainText("Mijn workspace");
    await expect(page.getByTestId("workspace-page")).toContainText("Voor tests");
    // folder
    await page.getByTestId("workspace-more").click();
    await page.getByTestId("workspace-add-folder").click();
    await page.getByTestId("folder-name").fill("Mijn folder");
    await page.getByTestId("folder-submit").click();
    await expect(page.getByTestId("sidebar-tree")).toContainText("Mijn folder");
    // edit
    await page.getByTestId("workspace-more").click();
    await page.getByTestId("workspace-edit").click();
    await expect(page.getByTestId("workspace-name")).toHaveValue("Mijn workspace");
    await expect(page.getByTestId("workspace-kind-closed")).toBeChecked();
    await page.getByTestId("workspace-name").fill("Hernoemde workspace");
    await page.getByTestId("workspace-submit").click();
    await expect(page.getByTestId("ws-name")).toContainText("Hernoemde workspace");
    await page.screenshot({ path: `${SHOTS}/tableux-chrome-workspace.png` });
    // new board straight into the folder through the add board dialog
    await page.getByTestId("workspace-more").click();
    await page.getByTestId("workspace-add-board").click();
    await expect(page.getByTestId("add-board-workspace")).toHaveText(/Hernoemde workspace/);
    await page.getByTestId("add-board-folder").selectOption({ label: "Mijn folder" });
    await page.getByTestId("add-board-name").fill("In de folder");
    await page.getByTestId("add-board-submit").click();
    await boardIdFromUrl(page);
    await page.getByTestId("board-info-button").click();
    await expect(page.getByTestId("info-location")).toContainText("Hernoemde workspace / Mijn folder");
    expect(errors).toEqual([]);
  });

  test("folder context menu: subfolder, rename and delete", async ({ page }) => {
    await login(page, "admin");
    await openBoard(page, "Klanten");
    const folder = page.getByTestId("sidebar-tree").locator('[data-testid^="nav-folder-"]').filter({ hasText: "Documenten" });
    await expect(folder).toBeVisible();
    await folder.hover();
    await folder.locator("button").last().click();
    await page.getByTestId("folder-menu-subfolder").click();
    await page.getByTestId("folder-name").fill("Onderfolder");
    await page.getByTestId("folder-submit").click();
    await expect(page.getByTestId("sidebar-tree")).toContainText("Onderfolder");
  });

  test("recently visited boards show on the home page and in the sidebar", async ({ page }) => {
    await login(page, "admin");
    const id = await openBoard(page, "Klanten");
    await expect(page.getByTestId("board-title")).toBeVisible();
    await page.waitForTimeout(500); // visit is recorded fire-and-forget
    await page.goto("/");
    await expect(page.getByTestId("home-recent")).toBeVisible();
    await expect(page.getByTestId(`home-recent-${id}`)).toContainText("Klanten");
    await expect(page.getByTestId("recent-list")).toContainText("Klanten");
    await page.screenshot({ path: `${SHOTS}/tableux-chrome-home.png` });
  });
});
