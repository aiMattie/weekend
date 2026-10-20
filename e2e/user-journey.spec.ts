/**
 * "Gebruikersreis": the whole product as Admin would use it, in one story.
 * login -> workspace Delivery -> board Klanten -> item -> status -> subitem -> update with @mention -> view switch ->
 * saved filter -> dashboard -> automation -> form submit -> sprint start/complete -> hours via mirror/formula ->
 * MCP create_item -> import dry-run.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { APIRequestContext, Page } from "@playwright/test";
import { startMockMonday } from "../scripts/fixtures/monday/mock-server";
import { boardIdByName, collectConsoleErrors, expect, loginViaUi, newUserPage, resetDb, test } from "./fixtures";

const row = (page: Page, name: string) => page.locator(`[data-testid="item-row"][data-item-name="${name}"]`);
const post = async (r: APIRequestContext, url: string, data: unknown) => {
  const res = await r.post(url, { data });
  expect(res.ok(), `${url} -> ${res.status()}`).toBeTruthy();
  return res.json();
};

test.describe("Gebruikersreis", () => {
  test.describe.configure({ timeout: 480_000 });
  let mock: Awaited<ReturnType<typeof startMockMonday>>;
  test.beforeAll(async () => { mock = await startMockMonday(); });
  test.afterAll(async () => { await mock.close(); });
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("from login to import dry-run", async ({ page, browser, baseURL }) => {
    const errors = collectConsoleErrors(page);
    const api = page.context().request;
    let klanten = "";

    await test.step("login through the form and land in the workspace", async () => {
      await loginViaUi(page, "admin");
      await expect(page.getByTestId("rail")).toBeVisible();
      await page.goto("/");
      await expect(page.getByTestId("topbar")).toBeVisible();
    });

    await test.step("workspace Delivery lists the boards; open Klanten from the sidebar", async () => {
      const ws = ((await (await api.get("/api/v1/workspaces")).json()) as { id: string; name: string }[]).find((w) => w.name === "Delivery")!;
      await page.goto(`/workspaces/${ws.id}`);
      await expect(page.getByText("Klanten").first()).toBeVisible();
      await page.getByTestId("sidebar").getByText("Klanten", { exact: true }).first().click();
      await expect(page.getByTestId("board-page")).toBeVisible();
      await expect(page.getByTestId("board-title")).toContainText("Klanten");
      klanten = await boardIdByName(api, "Klanten");
    });

    await test.step("create an item and change its status", async () => {
      await page.getByTestId("new-item-button").click();
      const input = page.locator('[data-testid="item-row"] [data-testid="cell-name"] input').first();
      await expect(input).toBeVisible();
      await input.fill("Admin Testklant");
      await input.press("Enter");
      await expect(row(page, "Admin Testklant")).toBeVisible();
      await row(page, "Admin Testklant").getByTestId("cell-status").click();
      await page.getByTestId("status-option").filter({ hasText: "Done" }).first().click();
      await expect(row(page, "Admin Testklant").getByTestId("cell-status")).toContainText("Done");
    });

    await test.step("add a subitem", async () => {
      await row(page, "Delta").getByTestId("expand-subitems").click();
      const table = page.getByTestId("subitem-table");
      await expect(table).toBeVisible();
      await table.getByTestId("add-subitem").click();
      await page.getByTestId("add-subitem-input").fill("Contract controleren");
      await page.getByTestId("add-subitem-input").press("Enter");
      await page.getByTestId("add-subitem-input").press("Escape");
      await expect(page.locator('[data-testid="subitem-row"][data-item-name="Contract controleren"]')).toBeVisible();
    });

    await test.step("post an update with an @mention; the colleague is notified", async () => {
      await row(page, "Delta").hover();
      await row(page, "Delta").getByTestId("update-bubble").click();
      await expect(page.getByTestId("item-panel")).toBeVisible();
      await page.getByTestId("update-editor").click();
      await page.keyboard.type("Graag even kijken ");
      await page.keyboard.type("@Bu");
      const opt = page.getByTestId("mention-option").filter({ hasText: "Builder" }).first();
      await expect(opt).toBeVisible();
      await opt.click();
      await page.getByTestId("update-submit").click();
      await expect(page.getByTestId("update-card").first().getByTestId("update-body")).toContainText("@Builder");
      const dev1 = await newUserPage(browser, baseURL, "dev1");
      const inbox = await (await dev1.context.request.get("/api/v1/inbox?filter=mentioned")).json();
      expect(inbox.notifications.some((n: { type: string }) => n.type === "mention")).toBe(true);
      await dev1.context.close();
      await page.getByTestId("panel-close").click();
    });

    await test.step("switch view to a new Kanban view and back", async () => {
      await page.getByTestId("add-view").click();
      await page.getByTestId("add-view-kanban").click();
      await expect(page.locator('[data-testid="view-tab"][data-view-type="kanban"]')).toBeVisible();
      await expect(page.getByTestId("kanban-view")).toBeVisible();
      await page.locator('[data-testid="view-tab"][data-view-type="table"]').first().click();
      await expect(page.getByTestId("board-table")).toBeVisible();
    });

    await test.step("filter on name and save it as a view", async () => {
      await page.getByTestId("toolbar-filter").click();
      await page.getByTestId("filter-add").click();
      const rule = page.getByTestId("filter-rule").nth(0);
      await rule.getByTestId("filter-column").selectOption({ label: "Name" });
      await rule.getByTestId("filter-op").selectOption({ label: "bevat" });
      await rule.getByTestId("filter-operand").fill("bra");
      await page.keyboard.press("Escape");
      await expect(row(page, "Bravo")).toBeVisible();
      await expect(row(page, "Delta")).toHaveCount(0);
      await page.getByTestId("save-as-new-view").click();
      const nameInput = page.locator('input[data-testid="view-name-input"]').or(page.getByTestId("view-name-input").locator("input")).first();
      await nameInput.fill("Bravo-klanten");
      await nameInput.press("Enter");
      await expect(page.locator('[data-testid="view-tab"][data-view-name="Bravo-klanten"]')).toBeVisible();
      await page.reload();
      await expect(page.locator('[data-testid="view-tab"][data-view-name="Bravo-klanten"]')).toBeVisible();
    });

    await test.step("dashboard with a chart over Klanten", async () => {
      await page.goto("/dashboards");
      await expect(async () => {
        await page.getByTestId("new-dashboard").click();
        await expect(page.getByTestId("dashboard-name-input")).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 60_000 });
      await page.locator('input[data-testid="dashboard-name-input"], [data-testid="dashboard-name-input"] input').first().fill("Klantoverzicht");
      await page.getByTestId("pick-board-Klanten").check();
      await page.getByRole("button", { name: "Dashboard maken" }).click();
      await expect(page.getByTestId("dashboard-page")).toBeVisible();
      await page.getByTestId("add-widget").click();
      await page.getByTestId("gallery-chart").click();
      await page.getByTestId("widget-save").click();
      await expect(page.locator('[data-widget-type="chart"]').getByTestId("chart-widget")).toBeVisible();
      // the "..." menu duplicates the dashboard
      const here = page.url();
      await page.getByTestId("dashboard-menu").click();
      await page.getByTestId("dashboard-duplicate").click();
      await expect(page).not.toHaveURL(here);
      await expect(page.getByTestId("dashboard-page")).toBeVisible();
    });

    await test.step("automation: status = Done moves the item to another group", async () => {
      await page.goto(`/boards/${klanten}`);
      await expect(page.getByTestId("board-page")).toBeVisible();
      await page.getByTestId("automate-button").click();
      await expect(page.getByTestId("automation-center")).toBeVisible();
      await page.getByTestId("auto-tab-builder").click();
      await page.getByTestId("builder-sentence").fill("When status changes to Done, move item to group Taken completed");
      await page.getByTestId("builder-parse").click();
      await expect(page.getByTestId("builder-trigger-block")).toHaveValue("status_changes_to");
      await page.getByTestId("builder-save").click();
      await expect(page.getByTestId("auto-manage")).toBeVisible();
      const full = await (await api.get(`/api/v1/boards/${klanten}/full`)).json() as { items: { id: string; name: string; groupId: string }[]; groups: { id: string; title: string }[]; columns: { id: string; key: string; scope: string }[] };
      const target = full.groups.find((g) => g.title === "Taken completed")!;
      const status = full.columns.find((c) => c.key === "status" && c.scope === "item")!;
      const bravo = await post(api, "/api/v1/items", { boardId: klanten, groupId: full.groups[0].id, name: "Automation klant" }) as { id: string };
      const res = await api.put(`/api/v1/items/${bravo.id}/values/${status.id}`, { data: { value: "Done" } });
      expect(res.ok()).toBeTruthy();
      await expect.poll(async () => ((await (await api.get(`/api/v1/items/${bravo.id}`)).json()) as { groupId: string }).groupId, { timeout: 20_000 }).toBe(target.id);
    });

    await test.step("form: build, publish and submit anonymously", async () => {
      await page.goto("/forms");
      await expect(async () => {
        await page.getByTestId("new-form").click();
        await expect(page.getByTestId("form-name-input")).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 60_000 });
      await page.getByTestId("form-name-input").fill("Klantvraag");
      await page.getByRole("button", { name: "Formulier maken" }).click();
      await expect(page.getByTestId("form-builder")).toBeVisible({ timeout: 60_000 });
      await page.getByTestId("publish-toggle").click();
      await expect(page.getByTestId("publish-state")).toHaveText("Gepubliceerd");
      await page.getByTestId("share-form-button").click();
      const link = await page.getByTestId("share-link").inputValue();
      const anon = await browser.newContext({ baseURL, locale: "nl-NL" });
      const ap = await anon.newPage();
      await ap.goto(link);
      await expect(ap.getByTestId("form-title")).toHaveText("Klantvraag");
      await ap.locator('[data-testid^="form-input-"]').first().fill("Vraag van een klant");
      await ap.getByTestId("form-submit").click();
      await expect(ap.getByTestId("form-thanks")).toBeVisible();
      await anon.close();
    });

    await test.step("sprint: plan a task, start and complete the sprint", async () => {
      const dev = await post(api, "/api/v1/dev/template", { demo: false }) as { boards: { sprints: string; taken: string } };
      const board = await (await api.get(`/api/v1/boards/${dev.boards.taken}/full`)).json() as { groups: { id: string }[] };
      const task = await post(api, "/api/v1/items", { boardId: dev.boards.taken, groupId: board.groups[0].id, name: "Sprinttaak", values: { status: "Ready", schatting: 3 } }) as { id: string };
      const sp = await post(api, `/api/v1/dev/boards/${dev.boards.sprints}/sprints`, {}) as { id: string };
      expect((await api.put(`/api/v1/dev/items/${task.id}/sprint`, { data: { sprintId: sp.id } })).ok()).toBeTruthy();
      await page.goto(`/boards/${dev.boards.sprints}`);
      await expect(page.getByTestId("planning-view")).toBeVisible();
      const section = page.locator(`[data-sprint-id='${sp.id}']`);
      await section.getByTestId("start-sprint").click();
      await expect(section.getByTestId("sprint-state")).toHaveText("Actief");
      await section.getByTestId("complete-sprint").click();
      await expect(page.getByTestId("complete-sprint-dialog")).toBeVisible();
      await page.getByTestId("carry-backlog").check();
      await page.getByTestId("complete-sprint-confirm").click();
      await expect(page.getByTestId("complete-sprint-dialog")).toBeHidden();
    });

    await test.step("hours: Urenregistratie rolls up per fase through mirror and formula", async () => {
      await post(api, "/api/v1/admin/templates", { action: "all" });
      const boards = (await (await api.get("/api/v1/boards")).json()) as { id: string; name: string }[];
      const id = (n: string) => boards.find((b) => b.name === n)!.id;
      const klant = await post(api, "/api/v1/items", { boardId: id("Klanten"), name: "Uren Klant" }) as { id: string };
      const fase = await post(api, "/api/v1/items", { boardId: id("Projecten & Fases"), name: "Uren Fase", values: { klant: [klant.id], uren_dev: 100, uren_pm: 0 } }) as { id: string };
      await post(api, "/api/v1/items", { boardId: id("Urenregistratie"), name: "Dag 1", values: { klant: [klant.id], fase: [fase.id], uren_dev: 30 } });
      await post(api, "/api/v1/items", { boardId: id("Urenregistratie"), name: "Dag 2", values: { klant: [klant.id], fase: [fase.id], uren_dev: 52 } });
      await page.goto(`/boards/${id("Projecten & Fases")}`);
      const r = row(page, "Uren Fase");
      await expect(r.getByTestId("cell-uren_dev_besteed")).toContainText("82");
      await expect(r.getByTestId("cell-restant_dev")).toContainText("18");
    });

    await test.step("MCP: create_item through the Streamable HTTP endpoint", async () => {
      const tok = await post(api, "/api/v1/api-tokens", { name: "user-journey" }) as { token: string };
      const client = new Client({ name: "user-journey", version: "1.0.0" });
      await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${tok.token}` } } }));
      const tools = (await client.listTools()).tools.map((t) => t.name);
      expect(tools).toContain("create_item");
      const res = await client.callTool({ name: "create_item", arguments: { board_id: klanten, name: "Item via MCP" } });
      expect(res.isError ?? false).toBe(false);
      await client.close();
      const full = await (await api.get(`/api/v1/boards/${klanten}/full`)).json() as { items: { name: string }[] };
      expect(full.items.map((i) => i.name)).toContain("Item via MCP");
    });

    await test.step("import dry-run against the mock monday writes nothing", async () => {
      const before = ((await (await api.get("/api/v1/boards")).json()) as unknown[]).length;
      await page.addInitScript((url) => { (window as unknown as { __mondayApiUrl: string }).__mondayApiUrl = url; }, mock.url);
      await page.goto("/admin/import");
      await expect(page.getByTestId("import-page")).toBeVisible();
      await page.getByTestId("import-dry-run").click();
      await expect(page.getByTestId("import-report")).toHaveAttribute("data-status", "done", { timeout: 90_000 });
      expect(((await (await api.get("/api/v1/boards")).json()) as unknown[]).length).toBe(before);
    });

    await test.step("log out through the avatar menu", async () => {
      await page.goto("/");
      await expect(async () => {
        await page.getByTestId("avatar-menu").click();
        await page.getByTestId("logout").click({ timeout: 2000 });
      }).toPass({ timeout: 30_000 });
      await expect(page.getByTestId("login-form")).toBeVisible();
    });

    expect(errors).toEqual([]);
  });
});
