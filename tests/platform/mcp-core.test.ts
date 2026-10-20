import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { platformCtx, type PCtx } from "./helpers";
import { mcpClient } from "./mcp-helpers";

let c: PCtx;
let close: (() => Promise<void>) | undefined;
beforeEach(async () => { c = await platformCtx(); });
afterEach(async () => { await close?.(); close = undefined; });

const PLATFORM_TOOLS = [
  "create_board", "get_board_info", "get_board_items_page", "get_board_activity", "board_insights", "create_group", "create_column", "get_column_type_info", "create_item", "change_item_column_values",
  "create_workspace", "update_workspace", "list_workspaces", "workspace_info", "create_folder", "update_folder", "move_object",
  "create_doc", "update_doc", "read_docs", "create_dashboard", "create_widget", "all_widgets_schema",
  "create_view", "update_view", "create_view_table", "update_view_table",
  "create_form", "get_form", "update_form", "form_questions_editor", "create_form_submission",
  "get_user_context", "list_users_and_teams", "create_update", "get_updates", "create_notification",
  "search", "get_assets", "get_asset_upload_url", "finalize_asset_upload",
  "list_automations", "manage_automations", "create_automation", "plan_workflow", "create_workflow", "update_workflow", "publish_workflow",
  "manage_agent", "manage_agent_triggers", "manage_agent_skills", "manage_agent_knowledge", "agent_catalog",
  "get_notetaker_meetings", "get_weekend_dev_sprints_boards", "get_sprints_metadata", "get_sprint_summary",
  "all_weekend_api", "get_graphql_schema", "get_type_details", "show_table", "show_chart", "show_battery", "show_assign",
];

describe("mcp server", () => {
  it("lists every Weekend platform tool with an input schema", async () => {
    const m = await mcpClient(c.admin); close = m.close;
    const { tools } = await m.client.listTools();
    const names = tools.map((t) => t.name);
    for (const n of PLATFORM_TOOLS) expect(names, `tool ${n}`).toContain(n);
    const create = tools.find((t) => t.name === "create_item")!;
    expect(create.inputSchema.type).toBe("object");
    expect(Object.keys(create.inputSchema.properties ?? {})).toContain("board_id");
    expect(tools.find((t) => t.name === "get_board_info")!.annotations?.readOnlyHint).toBe(true);
    expect(create.annotations?.readOnlyHint).toBe(false);
  });

  it("accepts camelCase arguments", async () => {
    const m = await mcpClient(c.admin); close = m.close;
    const r = await m.call("create_item", { boardId: c.boardId, name: "Camel item", columnValues: { status: { label: "Done" } } });
    expect(r.isError, r.text).toBe(false);
    expect(r.json.name).toBe("Camel item");
    expect(r.json.column_values.status.text).toBe("Done");
  });

  it("returns isError for unknown ids and invalid input instead of throwing", async () => {
    const m = await mcpClient(c.admin); close = m.close;
    const bad = await m.call("get_board_info", { board_id: "999" });
    expect(bad.isError).toBe(true);
    expect(bad.text).toMatch(/not_found/);
    const invalid = await m.call("create_item", { board_id: c.boardId });
    expect(invalid.isError).toBe(true);
    const unknown = await m.client.callTool({ name: "nope", arguments: {} }).catch((e) => e);
    expect(String(unknown.message ?? unknown)).toMatch(/Unknown tool/);
  });

  it("read-only tokens cannot call write tools; workspace scoping hides other workspaces", async () => {
    const ro = await mcpClient(c.admin, { scopes: ["read"] });
    const w = await ro.call("create_item", { board_id: c.boardId, name: "x" });
    expect(w.isError).toBe(true);
    expect(w.text).toMatch(/write scope/);
    expect((await ro.call("get_board_info", { board_id: c.boardId })).isError).toBe(false);
    await ro.close();

    const other = Object.values(c.workspaceIds).find((id) => id !== c.workspaceId)!;
    const scoped = await mcpClient(c.admin, { workspaceIds: [other] }); close = scoped.close;
    const denied = await scoped.call("get_board_info", { board_id: c.boardId });
    expect(denied.isError).toBe(true);
    expect(denied.text).toMatch(/restricted/);
    const ws = await scoped.call("list_workspaces");
    expect(ws.json.workspaces.map((x: { id: string }) => x.id)).toEqual([other]);
  });

  it("audits calls and enforces the daily budget", async () => {
    const m = await mcpClient(c.admin, { dailyBudget: 1000 }); close = m.close;
    await m.call("get_user_context");
    const { listCalls } = await import("../../src/server/services/api-tokens");
    const rows = listCalls(c.admin, { channel: "mcp" });
    expect(rows[0].name).toBe("get_user_context");
    let limited = false;
    for (let i = 0; i < 40 && !limited; i++) limited = (await m.call("get_user_context")).text.includes("DAILY_LIMIT_EXCEEDED");
    expect(limited).toBe(true);
  });

  it("exposes boards as resources and prompts", async () => {
    const m = await mcpClient(c.admin); close = m.close;
    const { resources } = await m.client.listResources();
    expect(resources.some((r) => r.uri === `weekend://boards/${c.boardId}`)).toBe(true);
    const read = await m.client.readResource({ uri: `weekend://boards/${c.boardId}` });
    expect(JSON.parse((read.contents[0] as { text: string }).text).name).toBe("Test board");
    const { prompts } = await m.client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(expect.arrayContaining(["weekly_status", "sprint_report"]));
    const p = await m.client.getPrompt({ name: "weekly_status", arguments: { board_id: c.boardId } });
    expect((p.messages[0].content as { text: string }).text).toContain("Test board");
  });
});
