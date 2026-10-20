/**
 * MCP + GraphQL smoke test against a running server, over real HTTP with the SDK client.
 *
 *   MCP_TOKEN=wkd_xxx BASE_URL=http://localhost:3058 npx tsx scripts/mcp-smoke.ts
 *
 * Without MCP_TOKEN the script creates a temporary token for ADMIN_EMAIL (default admin@example.com) straight in the
 * database that DATABASE_URL points to (use the same database as the server). Creates one board and removes it again.
 */
import "./_env";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = (process.env.BASE_URL ?? "http://localhost:3058").replace(/\/$/, "");
let failures = 0;
const check = (ok: boolean, label: string, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  ${extra}` : ""}`);
  if (!ok) failures++;
};

async function token(): Promise<string> {
  if (process.env.MCP_TOKEN) return process.env.MCP_TOKEN;
  const { eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db/client");
  const { users } = await import("../src/db/schema/core");
  const { create } = await import("../src/server/services/api-tokens");
  void eq;
  const email = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const u = db.select().from(users).where(sql`lower(${users.email}) = ${email}`).get();
  if (!u) throw new Error(`No user ${email}; pass MCP_TOKEN instead`);
  return create({ id: u.id, accountId: u.accountId, role: u.role, name: u.name, email: u.email }, { name: "mcp-smoke" }).token;
}

async function main() {
  const tk = await token();
  const headers = { Authorization: `Bearer ${tk}` };

  // 1. auth is enforced
  const anon = await fetch(`${BASE}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
  check(anon.status === 401, "MCP rejects anonymous requests", `status ${anon.status}`);

  // 2. protocol handshake + tools
  const client = new Client({ name: "mcp-smoke", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), { requestInit: { headers } }));
  const { tools } = await client.listTools();
  const names = new Set(tools.map((t) => t.name));
  for (const n of ["create_board", "get_board_info", "get_board_items_page", "create_item", "change_item_column_values", "all_weekend_api", "get_user_context", "search", "create_update"]) {
    check(names.has(n), `tool ${n} is listed`);
  }
  check(tools.length >= 60, "60+ tools exposed", `${tools.length} tools`);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as { text: string }[])[0]?.text ?? "";
    return { isError: !!r.isError, json: (() => { try { return JSON.parse(text); } catch { return text; } })() };
  };

  // 3. a realistic round trip
  const me = await call("get_user_context");
  check(!me.isError && !!me.json.user?.email, "get_user_context", me.json.user?.email);
  const wsId = me.json.workspaces?.[0]?.id;
  const board = await call("create_board", { board_name: `MCP smoke ${new Date().toISOString().slice(11, 19)}`, workspace_id: wsId });
  check(!board.isError && !!board.json.id, "create_board", board.json.id);
  const boardId = board.json.id as string;
  const statusCol = board.json.columns.find((c: { type: string }) => c.type === "status")?.id ?? "status";
  const item = await call("create_item", { board_id: boardId, name: "Smoke item", column_values: { [statusCol]: { label: "Working on it" } } });
  check(!item.isError && item.json.column_values?.[statusCol]?.text === "Working on it", "create_item with status", item.json.id);
  const changed = await call("change_item_column_values", { board_id: boardId, item_id: item.json.id, column_values: { [statusCol]: { label: "Done" } } });
  check(changed.json.column_values?.[statusCol]?.text === "Done", "change_item_column_values");
  const page = await call("get_board_items_page", { board_id: boardId, limit: 10 });
  check(page.json.items?.length === 1, "get_board_items_page", `${page.json.items?.length} item(s)`);
  const gql = await call("all_weekend_api", { query: `{ boards(ids: [${boardId}]) { name items_page(limit: 5) { items { name } } } }` });
  check(gql.json.data?.boards?.[0]?.items_page?.items?.[0]?.name === "Smoke item", "all_weekend_api GraphQL");

  // 4. the GraphQL endpoint itself, (raw token in Authorization)
  const res = await fetch(`${BASE}/api/graphql`, { method: "POST", headers: { Authorization: tk, "content-type": "application/json", "API-Version": "2025-10" }, body: JSON.stringify({ query: "{ me { id name } complexity { query before after } }" }) });
  const body = await res.json();
  check(res.ok && !!body.data?.me?.id && body.data.complexity.query > 0, "GraphQL with raw token + complexity", `cost ${body.data?.complexity?.query}`);
  check(!!res.headers.get("x-complexity-query"), "complexity header present");

  await call("delete_board", { board_id: boardId });
  await client.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
