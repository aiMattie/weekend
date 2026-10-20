import { beforeEach, describe, expect, it } from "vitest";
import { platformCtx, type PCtx } from "./helpers";

let c: PCtx;
beforeEach(async () => { c = await platformCtx(); });

const q = async (query: string, vars?: Record<string, unknown>) => {
  const r = await c.gql(query, vars);
  expect(r.errors, JSON.stringify(r.errors)).toBeUndefined();
  return r.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

async function addItems(n: number) {
  const ids: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = await q(`mutation($b: ID!, $name: String!, $v: JSON) { create_item(board_id: $b, item_name: $name, column_values: $v) { id } }`, {
      b: c.boardId, name: `Item ${i}`, v: JSON.stringify({ status: { label: i % 2 ? "Done" : "Stuck" }, date: `2026-10-0${i}` }),
    });
    ids.push(d.create_item.id);
  }
  return ids;
}

describe("graphql queries", () => {
  it("me, users, teams, workspaces, folders", async () => {
    const d = await q(`{ me { id name email is_admin teams { id name } } users(limit: 3) { id name } teams { id name users { id } } workspaces(limit: 50) { id name kind state } folders { id name } version { value } versions { value } }`);
    expect(d.me.is_admin).toBe(true);
    expect(d.users).toHaveLength(3);
    expect(d.teams.length).toBeGreaterThan(0);
    expect(d.workspaces.map((w: { name: string }) => w.name)).toContain("Delivery");
    expect(d.version.value).toMatch(/^\d{4}-\d{2}$/);
    const one = await q(`query($ids: [ID!]) { workspaces(ids: $ids, kind: open) { id name } }`, { ids: [c.workspaceId] });
    expect(one.workspaces).toHaveLength(1);
    const email = await q(`{ users(emails: ["admin@example.com"]) { id email } }`);
    expect(email.users).toHaveLength(1);
  });

  it("boards filter by ids, workspace_ids, state, board_kind, order_by, limit and page", async () => {
    const mk = (name: string, kind = "public") => q(`mutation { create_board(board_name: "${name}", board_kind: ${kind}, workspace_id: ${c.workspaceId}) { id } }`);
    await mk("Alpha"); await mk("Beta"); await mk("Gamma", "private");
    const all = await q(`{ boards(workspace_ids: [${c.workspaceId}], limit: 100) { id name board_kind workspace_id state } }`);
    expect(all.boards.map((b: { name: string }) => b.name)).toEqual(expect.arrayContaining(["Test board", "Alpha", "Beta", "Gamma"]));
    const priv = await q(`{ boards(board_kind: private, workspace_ids: [${c.workspaceId}]) { name } }`);
    expect(priv.boards.map((b: { name: string }) => b.name)).toEqual(["Gamma"]);
    const p1 = await q(`{ boards(workspace_ids: [${c.workspaceId}], limit: 2, page: 1) { id } }`);
    const p2 = await q(`{ boards(workspace_ids: [${c.workspaceId}], limit: 2, page: 2) { id } }`);
    expect(p1.boards).toHaveLength(2);
    expect(p2.boards.length).toBeGreaterThan(0);
    expect(p1.boards[0].id).not.toBe(p2.boards[0].id);
    const newest = await q(`{ boards(workspace_ids: [${c.workspaceId}], order_by: created_at, limit: 1) { name } }`);
    expect(newest.boards[0].name).toBe("Gamma");
    await q(`mutation { archive_board(board_id: ${(await q(`{ boards(workspace_ids: [${c.workspaceId}]) { id name } }`)).boards.find((b: { name: string }) => b.name === "Alpha").id}) { id state } }`);
    const archived = await q(`{ boards(state: archived, workspace_ids: [${c.workspaceId}]) { name state } }`);
    expect(archived.boards).toEqual([{ name: "Alpha", state: "archived" }]);
  });

  it("board columns and groups use ids and settings_str", async () => {
    const d = await q(`{ boards(ids: [${c.boardId}]) { columns { id title type settings_str } groups { id title color } top_group { id } items_count } }`);
    const status = d.boards[0].columns.find((x: { id: string }) => x.id === "status");
    expect(status.type).toBe("status");
    const settings = JSON.parse(status.settings_str);
    expect(settings.labels).toMatchObject({ "1": "Done" });
    expect(settings.done_colors).toContain(1);
    expect(d.boards[0].groups.length).toBeGreaterThan(0);
    const filtered = await q(`{ boards(ids: [${c.boardId}]) { columns(ids: ["status"]) { id } } }`);
    expect(filtered.boards[0].columns).toEqual([{ id: "status" }]);
  });

  it("items(ids) returns column values in API shapes with typed fragments", async () => {
    const [id] = await addItems(1);
    const d = await q(`query($ids: [ID!]) { items(ids: $ids) { id name state board { id } group { id title } column_values { id type text value ... on StatusValue { label index is_done label_style { color } } ... on DateValue { date time } } } }`, { ids: [id] });
    const item = d.items[0];
    expect(item.name).toBe("Item 1");
    expect(item.board.id).toBe(c.boardId);
    const status = item.column_values.find((v: { id: string }) => v.id === "status");
    expect(status).toMatchObject({ type: "status", text: "Done", label: "Done", is_done: true });
    expect(JSON.parse(status.value)).toMatchObject({ index: 1 });
    const date = item.column_values.find((v: { id: string }) => v.id === "date");
    expect(date.date).toBe("2026-10-01");
    expect(JSON.parse(date.value).date).toBe("2026-10-01");
    const only = await q(`query($ids: [ID!]) { items(ids: $ids) { column_values(ids: ["status"]) { id } } }`, { ids: [id] });
    expect(only.items[0].column_values).toEqual([{ id: "status" }]);
    const missing = await q(`{ items(ids: [1]) { id } }`);
    expect(missing.items).toEqual([]);
  });

  it("items_page: limit, cursor, next_items_page and a final null cursor", async () => {
    await addItems(5);
    const first = await q(`{ boards(ids: [${c.boardId}]) { items_page(limit: 2) { cursor items { id name } } } }`);
    const p1 = first.boards[0].items_page;
    expect(p1.items.map((i: { name: string }) => i.name)).toEqual(["Item 1", "Item 2"]);
    expect(p1.cursor).toBeTruthy();
    const p2 = (await q(`query($c: String!) { next_items_page(limit: 2, cursor: $c) { cursor items { name } } }`, { c: p1.cursor })).next_items_page;
    expect(p2.items.map((i: { name: string }) => i.name)).toEqual(["Item 3", "Item 4"]);
    const p3 = (await q(`query($c: String!) { next_items_page(limit: 2, cursor: $c) { cursor items { name } } }`, { c: p2.cursor })).next_items_page;
    expect(p3.items.map((i: { name: string }) => i.name)).toEqual(["Item 5"]);
    expect(p3.cursor).toBeNull();
    const bad = await c.gql(`{ next_items_page(cursor: "garbage") { items { id } } }`);
    expect(bad.errors?.[0].extensions.code).toBe("InvalidArgumentException");
  });

  it("items_page query_params: rules, operators, order_by, ids and groups", async () => {
    const ids = await addItems(4);
    const run = async (params: string) => (await q(`{ boards(ids: [${c.boardId}]) { items_page(limit: 50, query_params: ${params}) { items { name } } } }`)).boards[0].items_page.items.map((i: { name: string }) => i.name);
    expect(await run(`{ rules: [{ column_id: "status", compare_value: [1] }] }`)).toEqual(["Item 1", "Item 3"]);
    expect(await run(`{ rules: [{ column_id: "status", compare_value: ["Stuck"], operator: any_of }] }`)).toEqual(["Item 2", "Item 4"]);
    expect(await run(`{ rules: [{ column_id: "status", compare_value: [1], operator: not_any_of }] }`)).toEqual(["Item 2", "Item 4"]);
    expect(await run(`{ rules: [{ column_id: "name", compare_value: ["item 3"], operator: contains_text }] }`)).toEqual(["Item 3"]);
    expect(await run(`{ rules: [{ column_id: "date", compare_value: ["2026-10-02"], operator: greater_than }] }`)).toEqual(["Item 3", "Item 4"]);
    expect(await run(`{ rules: [{ column_id: "date", compare_value: ["2026-10-02", "2026-10-03"], operator: between }] }`)).toEqual(["Item 2", "Item 3"]);
    expect(await run(`{ rules: [{ column_id: "people", compare_value: [], operator: is_empty }] }`)).toHaveLength(4);
    expect(await run(`{ operator: or, rules: [{ column_id: "name", compare_value: ["Item 1"], operator: starts_with }, { column_id: "name", compare_value: ["Item 4"], operator: ends_with }] }`)).toEqual(["Item 1", "Item 4"]);
    expect(await run(`{ order_by: [{ column_id: "date", direction: desc }] }`)).toEqual(["Item 4", "Item 3", "Item 2", "Item 1"]);
    expect(await run(`{ ids: [${ids[1]}, ${ids[2]}] }`)).toEqual(["Item 2", "Item 3"]);
    const g = (await q(`{ boards(ids: [${c.boardId}]) { groups { id } } }`)).boards[0].groups[0].id;
    expect(await run(`{ groups: [{ group_ids: ["${g}"] }] }`)).toHaveLength(4);
    const bad = await c.gql(`{ boards(ids: [${c.boardId}]) { items_page(query_params: { rules: [{ column_id: "nope", compare_value: [1] }] }) { items { id } } } }`);
    expect(bad.errors?.[0].extensions.code).toBe("InvalidColumnIdException");
  });

  it("items_page_by_column_values and group items_page", async () => {
    await addItems(4);
    const d = await q(`{ items_page_by_column_values(board_id: ${c.boardId}, columns: [{ column_id: "status", column_values: ["Done"] }], limit: 10) { cursor items { name } } }`);
    expect(d.items_page_by_column_values.items.map((i: { name: string }) => i.name)).toEqual(["Item 1", "Item 3"]);
    const g = await q(`{ boards(ids: [${c.boardId}]) { groups { id items_page(limit: 3) { cursor items { name } } } } }`);
    expect(g.boards[0].groups[0].items_page.items).toHaveLength(3);
    expect(g.boards[0].groups[0].items_page.cursor).toBeTruthy();
  });

  it("updates, replies, likes, activity_logs and subitems", async () => {
    const [id] = await addItems(1);
    const u = await q(`mutation { create_update(item_id: ${id}, body: "<p>Hello</p>") { id } }`);
    await q(`mutation { create_update(item_id: ${id}, parent_id: ${u.create_update.id}, body: "<p>Reply</p>") { id } }`);
    await q(`mutation { like_update(update_id: ${u.create_update.id}) { id } }`);
    const sub = await q(`mutation { create_subitem(parent_item_id: ${id}, item_name: "Sub 1") { id name board { id } } }`);
    expect(sub.create_subitem.name).toBe("Sub 1");
    const d = await q(`{ items(ids: [${id}]) { updates { id text_body body replies { text_body } likes { creator_id } creator { name } } subitems { id name } } updates(limit: 10) { id } boards(ids: [${c.boardId}]) { activity_logs(limit: 20) { event data created_at } } }`);
    expect(d.items[0].updates[0]).toMatchObject({ text_body: "Hello", replies: [{ text_body: "Reply" }] });
    expect(d.items[0].updates[0].likes).toHaveLength(1);
    expect(d.items[0].subitems.map((s: { name: string }) => s.name)).toEqual(["Sub 1"]);
    expect(d.updates.length).toBeGreaterThan(0);
    expect(d.boards[0].activity_logs.map((l: { event: string }) => l.event)).toContain("create_item");
    expect(d.boards[0].activity_logs[0].created_at).toMatch(/^\d{17}$/);
  });

  it("complexity field and complexity headers", async () => {
    const r = await c.gql(`{ boards(limit: 5) { id items_page(limit: 10) { items { id } } } complexity { query before after reset_in_x_seconds } }`);
    expect(r.errors).toBeUndefined();
    expect(r.data.complexity.query).toBeGreaterThan(50);
    expect(r.data.complexity.after).toBe(r.data.complexity.before - r.data.complexity.query);
    expect(r.headers.get("x-complexity-query")).toBe(String(r.data.complexity.query));
    expect(r.headers.get("api-version")).toBeTruthy();
  });
});
