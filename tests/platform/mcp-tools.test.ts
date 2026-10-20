/** Calls every MCP tool through the SDK client (in-process transport) and asserts the result. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { platformCtx, type PCtx } from "./helpers";
import { mcpClient } from "./mcp-helpers";
import { devSetup } from "../dev/helpers";
import * as services from "../../src/server/services";
import { listMcpTools } from "../../src/server/mcp/tools/registry";
import { dataTools } from "../../src/server/mcp/tools/platform-data";
import { moreTools } from "../../src/server/mcp/tools/platform-more";
import { devRequestTools } from "../../src/server/mcp/tools/dev-requests";

/* eslint-disable @typescript-eslint/no-explicit-any */
let c: PCtx;
let m: Awaited<ReturnType<typeof mcpClient>>;
const called = new Set<string>();
const ok = async (name: string, args: Record<string, unknown> = {}): Promise<any> => {
  called.add(name);
  const r = await m.call(name, args);
  expect(r.isError, `${name}: ${r.text}`).toBe(false);
  return r.json ?? r.text;
};
const fail = async (name: string, args: Record<string, unknown> = {}) => {
  called.add(name);
  const r = await m.call(name, args);
  expect(r.isError, `${name} should fail`).toBe(true);
  return r.text;
};

beforeAll(async () => {
  c = await platformCtx();
  m = await mcpClient(c.admin);
});
afterAll(async () => {
  await m.close();
  const elsewhere = new Set([...dataTools, ...moreTools, ...devRequestTools].map((t) => t.name)); // covered in tests/mcp
  const missing = listMcpTools().map((t) => t.name).filter((n) => !called.has(n) && !elsewhere.has(n));
  expect(missing, "tools never called by this test").toEqual([]);
});

describe("every MCP tool", () => {
  let wsId = ""; let boardId = ""; let itemId = ""; let folderId = ""; let docId = "";
  let K = { phase: "", hours: "", due: "", text: "" };

  it("user context, users and teams", async () => {
    const ctx = await ok("get_user_context");
    expect(ctx.user.email).toBe(c.admin.email);
    expect(ctx.teams.length).toBeGreaterThan(0);
    const u = await ok("list_users_and_teams", { query: "builder" });
    expect(u.users.map((x: any) => x.name.toLowerCase()).join()).toContain("builder");
    const t = await ok("list_users_and_teams", { type: "teams" });
    expect(t.users).toEqual([]);
    expect(t.teams.length).toBeGreaterThan(0);
  });

  it("workspaces and folders", async () => {
    const ws = await ok("create_workspace", { name: "MCP Space", kind: "open", description: "via mcp" });
    wsId = ws.id;
    expect(ws.name).toBe("MCP Space");
    expect((await ok("update_workspace", { workspace_id: wsId, name: "MCP Space 2", description: "x" })).name).toBe("MCP Space 2");
    const f = await ok("create_folder", { workspace_id: wsId, name: "Folder A", color: "#00c875" });
    folderId = f.id;
    expect((await ok("update_folder", { folder_id: folderId, name: "Folder B" })).name).toBe("Folder B");
    expect((await ok("list_workspaces", { search_term: "mcp space" })).workspaces[0].id).toBe(wsId);
    const info = await ok("workspace_info", { workspace_id: wsId });
    expect(info.folders.map((x: any) => x.name)).toEqual(["Folder B"]);
    expect(info.members.length).toBeGreaterThan(0);
  });

  it("boards, groups, columns, column type info", async () => {
    const b = await ok("create_board", { board_name: "MCP Board", board_kind: "public", workspace_id: wsId, groups: ["Todo", "Doing"], columns: [{ title: "Phase", type: "status" }, { title: "Hours", type: "numbers" }, { title: "Due", type: "date" }], empty: true });
    boardId = b.id;
    expect(b.groups.map((g: any) => g.title)).toEqual(["Todo", "Doing"]);
    const key = (title: string) => b.columns.find((x: any) => x.title === title).id as string;
    K = { phase: key("Phase"), hours: key("Hours"), due: key("Due"), text: "text" };
    expect(b.columns.map((x: any) => x.title)).toEqual(expect.arrayContaining(["Name", "Phase", "Hours", "Due"]));
    const info = await ok("get_board_info", { board_id: boardId });
    expect(info.workspace.id).toBe(wsId);
    expect(info.columns.find((x: any) => x.title === "Phase").type).toBe("status");
    const g = await ok("create_group", { board_id: boardId, group_name: "Later", group_color: "#ff158a", relative_to: "Todo", position_relative_method: "before_at" });
    expect(g.title).toBe("Later");
    const col = await ok("create_column", { board_id: boardId, column_type: "text", column_title: "Notes", column_description: "free text" });
    expect(col).toMatchObject({ id: "text", type: "text", title: "Notes" });
    const dd = await ok("create_column", { board_id: boardId, column_type: "dropdown", column_title: "Area", column_settings: { labels: ["A", "B"] } });
    expect(dd.settings.labels).toHaveLength(2);
    const ti = await ok("get_column_type_info", { column_type: "status" });
    expect(ti).toMatchObject({ type: "status", read_only: false });
    expect(ti.example_value).toEqual({ label: "Done" });
    expect((await ok("get_column_type_info")).column_types.length).toBeGreaterThan(8);
    expect((await ok("move_object", { object_id: boardId, object_type: "board", parent_folder_id: folderId })).folder_id).toBe(folderId);
    expect((await ok("list_boards", { workspace_id: wsId })).boards.map((x: any) => x.name)).toContain("MCP Board");
  });

  it("items: create, change values, page with filters/cursor, activity, insights", async () => {
    const mk = async (name: string, v: Record<string, unknown>) => ok("create_item", { board_id: boardId, name, group_id: "Todo", column_values: v });
    const first = await mk("Alpha", { [K.phase]: { label: "Done" }, [K.hours]: 5, [K.due]: "2026-01-01" });
    itemId = first.id;
    expect(first.column_values[K.phase].text).toBe("Done");
    await mk("Beta", { [K.phase]: { label: "Working on it" }, [K.hours]: "7.5", [K.due]: "2026-12-31" });
    await mk("Gamma", { [K.phase]: { label: "Stuck" } });
    const withNew = await ok("create_item", { board_id: boardId, name: "Delta", column_values: JSON.stringify({ [K.phase]: { label: "Fresh" } }), create_labels_if_missing: true });
    expect(withNew.column_values[K.phase].text).toBe("Fresh");
    const sub = await ok("create_item", { board_id: boardId, name: "Alpha sub", parent_item_id: itemId });
    expect(sub.parent_item_id).toBe(itemId);

    const changed = await ok("change_item_column_values", { board_id: boardId, item_id: itemId, column_values: { [K.phase]: { label: "Stuck" }, [K.hours]: 6, text: "note" } });
    expect(changed.column_values[K.phase].text).toBe("Stuck");
    expect(changed.column_values.text.text).toBe("note");
    await fail("change_item_column_values", { item_id: itemId, column_values: { [K.phase]: { label: "Does not exist" } } });

    const page1 = await ok("get_board_items_page", { board_id: boardId, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.cursor).toBeTruthy();
    const page2 = await ok("get_board_items_page", { board_id: boardId, limit: 2, cursor: page1.cursor });
    expect(page2.items.map((i: any) => i.name)).toEqual(["Beta", "Gamma"]); // group order first: Delta sits in the first group "Later"
    const filtered = await ok("get_board_items_page", { board_id: boardId, filters: [{ column_id: K.hours, compare_value: [6], operator: "greater_than_or_equals" }], order_by: [{ column_id: K.hours, direction: "desc" }], column_ids: [K.hours] });
    expect(filtered.items.map((i: any) => i.name)).toEqual(["Beta", "Alpha"]);
    expect(Object.keys(filtered.items[0].column_values)).toEqual([K.hours]);
    const search = await ok("get_board_items_page", { board_id: boardId, search_term: "gam", include_columns: false });
    expect(search.items.map((i: any) => i.name)).toEqual(["Gamma"]);
    expect(search.items[0].column_values).toBeUndefined();
    expect((await ok("get_board_items_page", { board_id: boardId, item_ids: [itemId] })).items).toHaveLength(1);

    const act = await ok("get_board_activity", { board_id: boardId, limit: 100 });
    expect(act.activity.map((a: any) => a.event)).toEqual(expect.arrayContaining(["create_item", "change_column_value"]));
    const ins = await ok("board_insights", { board_id: boardId });
    expect(ins.total_items).toBe(4);
    expect(ins.by_group.find((x: any) => x.group === "Todo").count).toBeGreaterThanOrEqual(3);
    expect(ins.breakdown[K.phase].counts.Stuck).toBe(2);
    expect(ins.sums[K.hours].sum).toBeGreaterThan(10);
    expect(ins.overdue.map((o: any) => o.name)).not.toContain("Beta");
    const insF = await ok("board_insights", { board_id: boardId, filters: [{ column_id: K.phase, compare_value: ["Stuck"] }] });
    expect(insF.total_items).toBe(2);
  });

  it("item extras: get, move, duplicate, archive, delete, column delete, board archive/delete", async () => {
    const item = await ok("get_item", { item_id: itemId });
    expect(item.subitems.map((s: any) => s.name)).toEqual(["Alpha sub"]);
    const moved = await ok("move_item", { item_id: itemId, group_id: "Doing" });
    expect(moved.group).toBe("Doing");
    const dup = await ok("duplicate_item", { item_id: itemId });
    expect(dup.name).toContain("Alpha");
    expect((await ok("archive_item", { item_id: dup.id })).archived).toBe(true);
    const tmp = await ok("create_item", { board_id: boardId, name: "Temp" });
    expect((await ok("delete_item", { item_id: tmp.id })).deleted).toBe(true);
    expect((await ok("delete_column", { board_id: boardId, column_id: "text" })).deleted).toBe(true);
    const b2 = await ok("create_board", { board_name: "Throwaway", workspace_id: wsId });
    expect((await ok("archive_board", { board_id: b2.id })).archived).toBe(true);
    const b3 = await ok("create_board", { board_name: "Throwaway 2", workspace_id: wsId });
    expect((await ok("delete_board", { board_id: b3.id })).deleted).toBe(true);
  });

  it("updates and notifications", async () => {
    const u = await ok("create_update", { item_id: itemId, body: "<p>Status check</p>" });
    await ok("create_update", { item_id: itemId, body: "<p>Reply</p>", parent_update_id: u.id });
    const list = await ok("get_updates", { item_id: itemId });
    expect(list.updates[0].text).toBe("Status check");
    expect(list.updates[0].replies).toHaveLength(1);
    expect((await ok("get_updates", { board_id: boardId })).updates.length).toBeGreaterThanOrEqual(1);
    const n = await ok("create_notification", { user_id: c.userIds.pm1, message: "Hallo!", item_id: itemId });
    expect(n.sent).toBe(true);
    const inbox = services.inbox.list({ ...c.admin, id: c.userIds.pm1, role: "member" } as any, {});
    expect(JSON.stringify(inbox)).toContain("Hallo!");
  });

  it("docs", async () => {
    const d = await ok("create_doc", { workspace_id: wsId, title: "Spec", markdown: "# Heading\n\nHello **world**" });
    docId = d.id;
    await ok("update_doc", { doc_id: docId, title: "Spec v2", append_markdown: "More text" });
    const read = await ok("read_docs", { doc_id: docId });
    expect(read.docs[0].title).toBe("Spec v2");
    expect(read.docs[0].markdown).toContain("More text");
    expect((await ok("read_docs", { workspace_id: wsId })).docs).toHaveLength(1);
  });

  it("dashboards and widgets", async () => {
    const schema = await ok("all_widgets_schema");
    expect(schema.widgets.length).toBeGreaterThan(3);
    const d = await ok("create_dashboard", { workspace_id: wsId, name: "KPI", board_ids: [boardId] });
    const type = schema.widgets.find((w: any) => w.type === "number")?.type ?? schema.widgets[0].type;
    const w = await ok("create_widget", { dashboard_id: d.id, type, title: "Count", settings: undefined });
    expect(w.dashboard_id).toBe(d.id);
  });

  it("views", async () => {
    const v = await ok("create_view", { board_id: boardId, name: "Kanban", type: "kanban" });
    expect(v.type).toBe("kanban");
    expect((await ok("update_view", { view_id: v.id, name: "Kanban 2" })).name).toBe("Kanban 2");
    const t = await ok("create_view_table", { board_id: boardId, name: "Lean", hidden_column_ids: [K.hours], group_by_column_id: K.phase });
    const cols = (await ok("get_board_info", { board_id: boardId })).columns;
    expect(t.settings.hiddenColumnIds).toEqual([cols.find((x: any) => x.id === K.hours).column_id]);
    const t2 = await ok("update_view_table", { view_id: t.id, board_id: boardId, hidden_column_ids: [], group_by_column_id: null });
    expect(t2.settings.hiddenColumnIds).toEqual([]);
    expect(t2.settings.groupByColumnId).toBeNull();
  });

  it("forms", async () => {
    const f = await ok("create_form", { board_id: boardId, name: "Intake" });
    const formId = f.form.id;
    expect(f.questions.length).toBeGreaterThan(1);
    const upd = await ok("update_form", { form_id: formId, name: "Intake 2", published: true, settings: { description: "Vul in" } });
    expect(upd.form.isPublished ?? upd.form.published).toBe(true);
    const got = await ok("get_form", { form_id: formId });
    expect(got.form.name).toBe("Intake 2");
    const pub = await ok("get_form", { form_token: got.form.token });
    expect(JSON.stringify(pub)).toContain("Intake 2");
    const q0 = got.questions[0];
    const edited = await ok("form_questions_editor", { form_id: formId, operations: [{ op: "update", questionId: q0.id, patch: { title: "Titel" } }] });
    expect(edited.questions.find((x: any) => x.id === q0.id).title).toBe("Titel");
    const sub = await ok("create_form_submission", { form_id: formId, answers: { name: "From the form" } });
    expect(sub.ok).toBe(true);
    const items = await ok("get_board_items_page", { board_id: boardId, search_term: "From the form" });
    expect(items.items).toHaveLength(1);
  });

  it("search", async () => {
    const r = await ok("search", { query: "Alpha", types: ["items", "boards"] });
    expect(r.results.some((x: any) => x.type === "item" && x.title.includes("Alpha"))).toBe(true);
    const b = await ok("search", { query: "MCP Board", types: ["board"] });
    expect(b.results[0].id).toBe(boardId);
  });

  it("assets: upload url, upload, finalize, get", async () => {
    const up = await ok("get_asset_upload_url", { file_name: "note.txt", file_size: 5, mime_type: "text/plain", item_id: itemId });
    expect(up.upload_url).toContain("/api/mcp/upload/");
    await fail("finalize_asset_upload", { upload_token: up.upload_token }); // nothing uploaded yet
    const asset = services.assets.upload(c.admin, { itemId, name: "note.txt", mimeType: "text/plain" }, new TextEncoder().encode("hello"));
    const fin = await ok("finalize_asset_upload", { upload_token: up.upload_token });
    expect(fin.asset.id).toBe(asset.id);
    expect((await ok("get_assets", { asset_id: asset.id })).assets[0].name).toBe("note.txt");
    expect((await ok("get_assets", { item_id: itemId })).assets).toHaveLength(1);
    await fail("finalize_asset_upload", { upload_token: "garbage" });
  });

  it("automations and workflows", async () => {
    const a = await ok("create_automation", { board_id: c.boardId, description: `When an item is created, assign ${c.member.name}` });
    expect(a.board_id).toBe(c.boardId);
    expect((await ok("list_automations", { board_id: c.boardId })).automations.map((x: any) => x.id)).toContain(a.id);
    expect((await ok("manage_automations", { automation_id: a.id, action: "deactivate" })).active).toBe(false);
    expect((await ok("manage_automations", { automation_id: a.id, action: "activate" })).active).toBe(true);
    expect((await ok("manage_automations", { automation_id: a.id, action: "runs" })).runs).toEqual([]);
    const dup = await ok("manage_automations", { automation_id: a.id, action: "duplicate" });
    expect((await ok("manage_automations", { automation_id: dup.id, action: "delete" })).deleted).toBe(true);
    await fail("create_automation", { board_id: c.boardId, description: "do something nice" });
    const plan = await ok("plan_workflow", { board_id: c.boardId, process_description: `When an item is created, assign ${c.admin.name} then notify ${c.member.name}` });
    expect(plan.definition).toBeTruthy();
    const wf = await ok("create_workflow", { board_id: c.boardId, name: "Flow", process_description: `When an item is created, assign ${c.member.name}` });
    expect(wf.kind).toBe("workflow");
    await ok("update_workflow", { workflow_id: wf.id, name: "Flow 2", prompt: `When an item is created, assign ${c.admin.name}` });
    const pub = await ok("publish_workflow", { workflow_id: wf.id });
    expect(pub.active).toBe(true);
    expect((await ok("publish_workflow", { workflow_id: wf.id, publish: false })).active).toBe(false);
  });

  it("agents (ai module): catalog, create, triggers, skills, knowledge, delete; meetings list", async () => {
    const cat = await ok("agent_catalog");
    expect(cat.templates.map((t: any) => t.key)).toContain("lead_scorer");
    const created = await ok("manage_agent", { action: "create", config: { name: "MCP agent", instructions: "test", status: "paused" } });
    expect((await ok("manage_agent", { action: "list" })).agents.map((a: any) => a.id)).toContain(created.id);
    await ok("manage_agent", { action: "update", agent_id: created.id, config: { description: "bijgewerkt" } });
    expect((await ok("manage_agent", { action: "get", agent_id: created.id })).description).toBe("bijgewerkt");
    const trig = await ok("manage_agent_triggers", { agent_id: created.id, action: "add", trigger: { type: "item_created", config: { board_id: c.boardId } } });
    expect((await ok("manage_agent_triggers", { agent_id: created.id })).triggers.map((t: any) => t.id)).toContain(trig.id);
    await ok("manage_agent_triggers", { agent_id: created.id, action: "remove", trigger_id: trig.id });
    const skill = await ok("manage_agent_skills", { agent_id: created.id, action: "add", name: "Lezen", instruction: "lees", tools: ["get_board"] });
    expect((await ok("manage_agent_skills", { agent_id: created.id })).skills).toHaveLength(1);
    await ok("manage_agent_skills", { agent_id: created.id, action: "remove", skill_id: skill.id });
    const k = await ok("manage_agent_knowledge", { agent_id: created.id, action: "add", board_id: c.boardId, access: "read" });
    expect((await ok("manage_agent_knowledge", { agent_id: created.id })).knowledge).toHaveLength(1);
    await ok("manage_agent_knowledge", { agent_id: created.id, action: "remove", knowledge_id: k.id });
    await fail("manage_agent_triggers", { agent_id: "1", action: "list" });
    await ok("manage_agent", { action: "delete", agent_id: created.id });
    expect((await ok("get_notetaker_meetings", {})).meetings).toEqual([]);
  });

  it("sprints", async () => {
    const dev = devSetup(c);
    const sp = dev.sprint("Sprint 1", "2026-10-05", "2026-10-16");
    const boards = await ok("get_weekend_dev_sprints_boards");
    expect(boards.boards.map((b: any) => b.id)).toContain(dev.t.boards.sprints);
    const meta = await ok("get_sprints_metadata", { board_id: dev.t.boards.sprints });
    expect(meta.sprints.map((s: any) => s.id)).toContain(sp.id);
    const sum = await ok("get_sprint_summary", { sprint_id: sp.id });
    expect(sum.sprint.id).toBe(sp.id);
  });

  it("graphql tools", async () => {
    const r = await ok("all_weekend_api", { query: `query($ids:[ID!]) { boards(ids:$ids) { name columns { id type } } }`, variables: { ids: [boardId] } });
    expect(r.data.boards[0].name).toBe("MCP Board");
    const mut = await ok("all_weekend_api", { query: `mutation { create_item(board_id: ${boardId}, item_name: "Via GraphQL tool") { id } }` });
    expect(mut.data.create_item.id).toBeTruthy();
    const bad = await ok("all_weekend_api", { query: `{ nope }` });
    expect(bad.errors[0].extensions.code).toBe("GraphQLValidationFailed");
    await fail("all_weekend_api", { query: "{ oops" });
    const schema = await ok("get_graphql_schema", { operation_type: "mutation" });
    expect(schema.mutations.join("\n")).toContain("create_item(");
    expect(typeof (await ok("get_graphql_schema", { full: true }))).toBe("string");
    const t = await ok("get_type_details", { type_name: "Item" });
    expect(t.sdl).toContain("column_values");
    expect(t.kind).toBe("object");
    await fail("get_type_details", { type_name: "Nope" });
  });

  it("UI component tools return structured JSON", async () => {
    const table = await ok("show_table", { title: "Items", item_ids: [itemId] });
    expect(table.ui.component).toBe("table");
    expect(table.props.rows[0].name).toBe("Alpha");
    expect(table.props.columns[0]).toEqual({ key: "name", label: "Name" });
    const t2 = await ok("show_table", { columns: [{ key: "a", label: "A" }], rows: [{ a: 1 }] });
    expect(t2.props.rows).toEqual([{ a: 1 }]);
    const chart = await ok("show_chart", { chart_type: "pie", data: [{ label: "x", value: 2 }] });
    expect(chart).toMatchObject({ ui: { component: "chart" }, props: { chart_type: "pie" } });
    const bat = await ok("show_battery", { value: 3, max: 4 });
    expect(bat.props.percent).toBe(75);
    const assign = await ok("show_assign", { item_id: itemId, query: "builder" });
    expect(assign.ui.component).toBe("assign");
    expect(assign.props.candidates.length).toBeGreaterThan(0);
  });
});
