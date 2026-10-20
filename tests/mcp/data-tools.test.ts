/** MCP data tools (platform-data / platform-more) and tool annotations, through the SDK client. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { platformCtx, type PCtx } from "../platform/helpers";
import { mcpClient } from "../platform/mcp-helpers";
import * as services from "../../src/server/services";
import { dataTools } from "../../src/server/mcp/tools/platform-data";
import { moreTools } from "../../src/server/mcp/tools/platform-more";

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
  const missing = [...dataTools, ...moreTools].map((t) => t.name).filter((n) => !called.has(n));
  expect(missing, "tools never called by this test").toEqual([]);
});

describe("tool annotations", () => {
  it("emits title and read-only / destructive / idempotent hints", async () => {
    const { tools } = await m.client.listTools();
    const a = (n: string) => tools.find((t) => t.name === n)!.annotations!;
    expect(a("get_board_info")).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(a("delete_item")).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(a("archive_group")).toMatchObject({ destructiveHint: true });
    expect(a("delete_update")).toMatchObject({ destructiveHint: true });
    expect(a("create_item")).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
    expect(a("update_column")).toMatchObject({ idempotentHint: true, destructiveHint: false });
    expect(a("request_change")).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(a("get_board_info").title).toBe("Get board info");
    expect(tools.find((t) => t.name === "create_items")!.title).toBe("Create items (bulk)");
  });
});

describe("data tools", () => {
  let itemA = ""; let itemB = "";

  it("bulk create and update items, rename, move to group", async () => {
    const created = await ok("create_items", { board_id: c.boardId, items: [{ name: "Bulk A", columnValues: { status: { label: "Done" } } }, { item_name: "Bulk B" }] });
    expect(created.count).toBe(2);
    [itemA, itemB] = created.items.map((i: any) => i.id);
    expect(created.items[0].column_values.status.text).toBe("Done");
    await fail("create_items", { board_id: c.boardId, items: [] });

    const upd = await ok("update_items", { board_id: c.boardId, updates: [{ itemId: itemA, columnValues: { status: { label: "Stuck" } } }, { item_id: itemB, column_values: { status: { label: "Brand new" } }, create_labels_if_missing: true }] });
    expect(upd.items.map((i: any) => i.column_values.status.text)).toEqual(["Stuck", "Brand new"]);

    expect((await ok("update_item_name", { item_id: itemA, name: "Bulk A renamed" })).name).toBe("Bulk A renamed");
    const g = services.groups.create(c.admin, c.boardId, { title: "Elsewhere" });
    expect((await ok("move_item_to_group", { item_id: itemA, group_id: "Elsewhere" })).group_id).toBe(g.id);
  });

  it("subitems and full board data", async () => {
    const sub = await ok("create_subitem", { parent_item_id: itemA, item_name: "Sub 1" });
    expect(sub.parent_item_id).toBe(itemA);
    expect((await ok("list_subitems", { parent_item_id: itemA })).subitems.map((s: any) => s.name)).toEqual(["Sub 1"]);
    services.updates.create(c.admin, { itemId: itemA, body: "<p>hello</p>" });
    const full = await ok("get_full_board_data", { board_id: c.boardId });
    const a = full.items.find((i: any) => i.id === itemA);
    expect(a.subitems.map((s: any) => s.name)).toEqual(["Sub 1"]);
    expect(a.updates[0].text).toContain("hello");
    expect(full.columns.length).toBeGreaterThan(0);
  });

  it("groups: update, duplicate, archive, delete", async () => {
    const g = services.groups.create(c.admin, c.boardId, { title: "G1" });
    expect((await ok("update_group", { board_id: c.boardId, group_id: "G1", group_name: "G1b", group_color: "#00c875" })).title).toBe("G1b");
    const dup = await ok("duplicate_group", { group_id: g.id, group_title: "G1 copy" });
    expect(dup.title).toBe("G1 copy");
    expect((await ok("archive_group", { group_id: dup.id })).archived).toBe(true);
    expect((await ok("delete_group", { board_id: c.boardId, group_id: g.id })).deleted).toBe(true);
    expect((await ok("get_board_schema", { board_id: c.boardId })).groups.map((x: any) => x.id)).not.toContain(g.id);
  });

  it("columns, board update/duplicate/members, archived boards, undo", async () => {
    const col = await ok("update_column", { board_id: c.boardId, column_id: "status", column_title: "State", column_description: "the state" });
    expect(col).toMatchObject({ id: "status", title: "State", description: "the state" });
    await fail("update_column", { board_id: c.boardId, column_id: "nope", column_title: "x" });
    const schema = await ok("get_board_schema", { board_id: c.boardId });
    expect(schema.columns.find((x: any) => x.id === "status").title).toBe("State");

    expect((await ok("update_board", { board_id: c.boardId, board_name: "Renamed board", description: "d" })).name).toBe("Renamed board");
    const copy = await ok("duplicate_board", { board_id: c.boardId, board_name: "Copy board" });
    expect(copy.name).toBe("Copy board");
    expect((await ok("get_board_members", { board_id: c.boardId })).members).toBeInstanceOf(Array);
    services.boards.archive(c.admin, copy.id);
    expect((await ok("list_archived_boards")).boards.map((b: any) => b.id)).toContain(copy.id);
    expect((await ok("undo_action", { board_id: c.boardId })).done).toBe(false);
  });

  it("updates: edit and delete", async () => {
    const u = services.updates.create(c.admin, { itemId: itemB, body: "<p>first</p>" });
    expect((await ok("edit_update", { update_id: u.id, body: "<p>second</p>" })).text).toContain("second");
    expect((await ok("delete_update", { id: u.id })).deleted).toBe(true);
    expect(services.updates.list(c.admin, itemB)).toHaveLength(0);
  });

  it("teams, docs, dashboards", async () => {
    expect((await ok("list_teams")).teams.length).toBeGreaterThan(0);
    const d = services.docs.create(c.admin, { workspaceId: c.workspaceId, title: "Spec", markdown: "# Spec" });
    expect((await ok("list_docs", { workspace_id: c.workspaceId })).docs.map((x: any) => x.id)).toContain(d.id);
    await ok("add_content_to_doc", { doc_id: d.id, markdown: "Appended line" });
    expect(services.docs.toMarkdown(c.admin, d.id)).toContain("Appended line");
    expect((await ok("delete_doc", { doc_id: d.id })).deleted).toBe(true);
    const dash = services.dashboards.create(c.admin, { workspaceId: c.workspaceId, name: "Dash", boardIds: [c.boardId] });
    services.dashboards.createWidget(c.admin, dash.id, { type: "numbers" });
    expect((await ok("list_dashboards", { workspace_id: c.workspaceId })).dashboards.find((x: any) => x.id === dash.id).widget_count).toBe(1);
    const got = await ok("get_dashboard", { dashboard_id: dash.id });
    expect(got.boards.map((b: any) => b.id)).toEqual([c.boardId]);
    expect(got.widgets[0].type).toBe("numbers");
  });

  it("time tracking", async () => {
    const e = await ok("create_time_entry", { item_id: itemB, hours: 1.5, description: "work" });
    expect(e.minutes).toBe(90);
    const l = await ok("list_time_entries", { item_id: itemB });
    expect(l.total_minutes).toBe(90);
    await fail("delete_time_entry", { item_id: itemA, time_entry_id: e.id });
    expect((await ok("delete_time_entry", { item_id: itemB, time_entry_id: e.id })).deleted).toBe(true);
  });

  it("read-scope tokens cannot call write tools; workspace scope applies to nested ids", async () => {
    const ro = await mcpClient(c.admin, { scopes: ["read"] });
    expect((await ro.call("update_items", { updates: [{ item_id: itemA, column_values: {} }] })).isError).toBe(true);
    expect((await ro.call("list_teams")).isError).toBe(false);
    await ro.close();
    const other = services.workspaces.create(c.admin, { name: "Other", kind: "open" });
    const scoped = await mcpClient(c.admin, { workspaceIds: [other.id] });
    const r = await scoped.call("update_items", { updates: [{ item_id: itemA, column_values: { status: { label: "Done" } } }] });
    expect(r.isError, r.text).toBe(true);
    await scoped.close();
  });
});
