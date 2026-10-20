import { expect, resetDb, test, login, collectConsoleErrors } from "../fixtures";

/** Create a token in the UI, use it against /api/graphql and /api/mcp with plain fetch, then revoke it. */
// first hits compile routes on demand in dev: give web assertions room
const expectSlow = expect.configure({ timeout: 90_000 });

test.describe("platform: API tokens, GraphQL and MCP", () => {
  test.setTimeout(600_000);
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("token lifecycle through the UI + use over HTTP", async ({ page, request, baseURL }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    await page.goto("/admin/api");
    await expectSlow(page.getByTestId("admin-title")).toHaveText("API en MCP");
    await expectSlow(page.getByTestId("endpoint-graphql")).toContainText("/api/graphql");

    // create
    await page.getByTestId("token-new").click();
    await page.locator('[data-testid="token-name"] input, input[data-testid="token-name"]').first().fill("e2e token");
    await page.getByTestId("token-submit").click();
    const value = page.getByTestId("token-value");
    await expectSlow(value).toBeVisible();
    const token = (await value.textContent())!.trim();
    expect(token).toMatch(/^wkd_/);
    await page.getByTestId("token-done").click();
    await expectSlow(page.getByTestId("token-value")).toHaveCount(0);
    const row = page.locator('[data-testid="token-row"][data-token-name="e2e token"]');
    await expectSlow(row).toBeVisible();
    await expectSlow(row).toContainText(token.slice(0, 8));
    await expectSlow(row.getByTestId("token-last-used")).toContainText("Nog nooit");

    // GraphQL, : raw token in Authorization, no cookie
    const gql = await request.post("/api/graphql", {
      headers: { authorization: token, "content-type": "application/json", "api-version": "2025-10" },
      data: { query: "{ me { id name email } boards(limit: 3) { id name items_page(limit: 2) { cursor items { id name } } } complexity { query } }" },
    });
    expect(gql.status()).toBe(200);
    const body = await gql.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.me.email).toBe("admin@example.com");
    expect(body.data.boards.length).toBeGreaterThan(0);
    expect(Number(gql.headers()["x-complexity-query"])).toBeGreaterThan(0);

    // GraphQL mutation + MCP create_item on the same board
    const boardId = body.data.boards[0].id as string;
    const created = await request.post("/api/graphql", {
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      data: { query: "mutation($b: ID!) { create_item(board_id: $b, item_name: \"Via GraphQL\") { id name } }", variables: { b: boardId } },
    });
    expect((await created.json()).data.create_item.name).toBe("Via GraphQL");

    const rpc = async (id: number, method: string, params: unknown) => {
      const res = await request.post("/api/mcp", {
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
        data: { jsonrpc: "2.0", id, method, params },
      });
      expect(res.status()).toBe(200);
      return res.json();
    };
    const list = await rpc(1, "tools/list", {});
    expect(list.result.tools.length).toBeGreaterThanOrEqual(60);
    const mcpItem = await rpc(2, "tools/call", { name: "create_item", arguments: { board_id: boardId, name: "Via MCP" } });
    expect(mcpItem.result.isError).toBeFalsy();
    expect(JSON.parse(mcpItem.result.content[0].text).name).toBe("Via MCP");
    const page2 = await rpc(3, "tools/call", { name: "get_board_items_page", arguments: { board_id: boardId, search_term: "Via", limit: 10 } });
    expect(JSON.parse(page2.result.content[0].text).items.map((i: { name: string }) => i.name).sort()).toEqual(["Via GraphQL", "Via MCP"]);

    // anonymous and wrong tokens are refused
    expect((await request.post("/api/graphql", { data: { query: "{ me { id } }" } })).status()).toBe(401);
    expect((await request.post("/api/mcp", { headers: { authorization: "Bearer wkd_wrong", "content-type": "application/json", accept: "application/json, text/event-stream" }, data: { jsonrpc: "2.0", id: 1, method: "tools/list" } })).status()).toBe(401);

    // last used + usage show up after a reload, then revoke
    await page.reload();
    await expectSlow(row.getByTestId("token-last-used")).not.toContainText("Nog nooit");
    page.once("dialog", (d) => void d.accept());
    await row.getByTestId("token-revoke").click();
    await expectSlow(row).toHaveAttribute("data-status", "revoked");
    expect((await request.post("/api/graphql", { headers: { authorization: token, "content-type": "application/json" }, data: { query: "{ me { id } }" } })).status()).toBe(401);
    expect((await request.post("/api/mcp", { headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, data: { jsonrpc: "2.0", id: 9, method: "tools/list" } })).status()).toBe(401);
    expect(errors, errors.join("\n")).toEqual([]);
    void baseURL;
  });

  test("read-only token cannot write; explorer, MCP tab and calls tab work", async ({ page, request }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    await page.goto("/admin/api");
    await page.getByTestId("token-new").click();
    await page.locator('[data-testid="token-name"] input, input[data-testid="token-name"]').first().fill("read only");
    await page.getByTestId("token-scope-write").uncheck();
    await page.getByTestId("token-submit").click();
    const token = (await page.getByTestId("token-value").textContent())!.trim();
    const headers = { authorization: token, "content-type": "application/json" };
    const ok = await request.post("/api/graphql", { headers, data: { query: "{ boards(limit: 1) { id } }" } });
    const boardId = (await ok.json()).data.boards[0].id;
    const denied = await request.post("/api/graphql", { headers, data: { query: `mutation { create_item(board_id: ${boardId}, item_name: "nope") { id } }` } });
    const deniedBody = await denied.json();
    expect(deniedBody.errors[0].extensions.code).toBe("UserUnauthorizedException");

    // explorer (session auth)
    await page.getByTestId("platform-tab-explorer").click();
    await page.getByTestId("explorer-run").click();
    await expectSlow(page.getByTestId("explorer-result")).toContainText("admin@example.com");
    await expectSlow(page.getByTestId("explorer-meta")).toContainText("200");
    await expectSlow(page.getByTestId("explorer-schema")).toContainText("create_item");
    await page.getByTestId("explorer-query").fill("{ nonsense }");
    await page.getByTestId("explorer-run").click();
    await expectSlow(page.getByTestId("explorer-result")).toContainText("Cannot query field");

    // MCP instructions + tools
    await page.getByTestId("platform-tab-mcp").click();
    await expectSlow(page.getByTestId("mcp-url")).toContainText("/api/mcp");
    await expectSlow(page.getByTestId("mcp-cli")).toContainText("claude mcp add");
    await expectSlow(page.getByTestId("mcp-json")).toContainText("mcpServers");
    expect(await page.getByTestId("mcp-tool-row").count()).toBeGreaterThanOrEqual(60);

    // calls log
    await page.getByTestId("platform-tab-calls").click();
    await expectSlow(page.getByTestId("call-row").first()).toBeVisible();
    await expectSlow(page.getByTestId("calls-table")).toContainText("mutation:create_item");

    // webhooks tab (admin)
    await page.getByTestId("platform-tab-webhooks").click();
    await expectSlow(page.getByTestId("platform-webhooks")).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("members get their own tokens page without admin tabs", async ({ page }) => {
    await login(page, "dev1");
    await page.goto("/admin/api");
    await expectSlow(page.getByTestId("admin-title")).toHaveText("API en MCP");
    await expectSlow(page.getByTestId("platform-tab-webhooks")).toHaveCount(0);
    await expectSlow(page.getByTestId("tokens-empty")).toBeVisible();
  });
});
