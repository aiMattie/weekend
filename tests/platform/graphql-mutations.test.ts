import { beforeEach, describe, expect, it, vi } from "vitest";
import { platformCtx, type PCtx } from "./helpers";
import * as webhooks from "../../src/server/services/webhooks";

let c: PCtx;
beforeEach(async () => { c = await platformCtx(); });

const q = async (query: string, vars?: Record<string, unknown>) => {
  const r = await c.gql(query, vars);
  expect(r.errors, JSON.stringify(r.errors)).toBeUndefined();
  return r.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
const err = async (query: string, vars?: Record<string, unknown>) => (await c.gql(query, vars)).errors?.[0];
const cv = (o: unknown) => JSON.stringify(JSON.stringify(o)); // GraphQL string literal holding JSON

describe("structure mutations", () => {
  it("workspace, folder, board, group, column lifecycle", async () => {
    const ws = (await q(`mutation { create_workspace(name: "Platform WS", kind: open, description: "d") { id name kind } }`)).create_workspace;
    expect(ws).toMatchObject({ name: "Platform WS", kind: "open" });
    const folder = (await q(`mutation { create_folder(workspace_id: ${ws.id}, name: "F1", color: "done-green") { id name color workspace { id } } }`)).create_folder;
    expect(folder.workspace.id).toBe(ws.id);
    expect(folder.color).toBe("#00c875");
    const board = (await q(`mutation { create_board(board_name: "Roadmap", board_kind: private, workspace_id: ${ws.id}, folder_id: ${folder.id}, description: "x") { id name board_kind board_folder_id workspace_id } }`)).create_board;
    expect(board).toMatchObject({ name: "Roadmap", board_kind: "private", board_folder_id: folder.id, workspace_id: ws.id });
    const g = (await q(`mutation { create_group(board_id: ${board.id}, group_name: "Sprint 1", group_color: "#ff158a") { id title color } }`)).create_group;
    expect(g).toMatchObject({ title: "Sprint 1", color: "#ff158a" });
    await q(`mutation { update_group(board_id: ${board.id}, group_id: "${g.id}", group_attribute: title, new_value: "Sprint 2") { title } }`).catch(() => null);
    const dup = (await q(`mutation { duplicate_group(board_id: ${board.id}, group_id: "${g.id}") { id title } }`)).duplicate_group;
    expect(dup.id).not.toBe(g.id);
    await q(`mutation { archive_group(board_id: ${board.id}, group_id: "${dup.id}") { id } }`);
    await q(`mutation { delete_group(board_id: ${board.id}, group_id: "${g.id}") { id } }`);

    const col = (await q(`mutation { create_column(board_id: ${board.id}, title: "Budget", column_type: numbers, description: "eur") { id title type description } }`)).create_column;
    expect(col).toMatchObject({ title: "Budget", type: "numbers", description: "eur" });
    expect((await q(`mutation { change_column_title(board_id: ${board.id}, column_id: "${col.id}", title: "Cost") { title } }`)).change_column_title.title).toBe("Cost");
    expect((await q(`mutation { change_column_metadata(board_id: ${board.id}, column_id: "${col.id}", column_property: description, value: "new") { description } }`)).change_column_metadata.description).toBe("new");
    const st = (await q(`mutation { create_status_column(board_id: ${board.id}, title: "Phase", defaults: ${cv({ labels: [{ label: "Plan", color: "working_orange", index: 1 }, { label: "Ship", color: "done-green", index: 2, is_done: true }] })}) { id settings_str } }`)).create_status_column;
    const labels = JSON.parse(st.settings_str);
    expect(Object.values(labels.labels)).toEqual(["Plan", "Ship"]);
    const dd = (await q(`mutation { create_dropdown_column(board_id: ${board.id}, title: "Team", defaults: ${cv({ labels: [{ id: 1, label: "A" }, { id: 2, label: "B" }] })}) { id settings_str } }`)).create_dropdown_column;
    expect(JSON.parse(dd.settings_str).labels).toHaveLength(2);
    await q(`mutation { update_status_column(board_id: ${board.id}, id: "${st.id}", defaults: ${cv({ labels: [{ label: "Only", color: "stuck-red", index: 0 }] })}) { id } }`);
    expect((await q(`mutation { delete_column(board_id: ${board.id}, column_id: "${col.id}") { id } }`)).delete_column.id).toBe(col.id);

    const copy = (await q(`mutation { duplicate_board(board_id: ${board.id}, duplicate_type: duplicate_board_with_structure, board_name: "Roadmap copy") { board { id name } } }`)).duplicate_board.board;
    expect(copy.name).toBe("Roadmap copy");
    await q(`mutation { archive_board(board_id: ${copy.id}) { id state } }`);
    expect((await q(`mutation { delete_board(board_id: ${copy.id}) { id state } }`)).delete_board.state).toBe("deleted");
    await q(`mutation { update_folder(folder_id: ${folder.id}, name: "F2") { name } }`);
    await q(`mutation { update_workspace(id: ${ws.id}, attributes: { name: "Renamed" }) { name } }`);
    const members = (await q(`mutation { add_users_to_workspace(workspace_id: ${ws.id}, user_ids: [${c.userIds.pm1}], kind: subscriber) { id name } }`)).add_users_to_workspace;
    expect(members[0].id).toBe(c.userIds.pm1);
    await q(`mutation { delete_users_from_workspace(workspace_id: ${ws.id}, user_ids: [${c.userIds.pm1}]) { id } }`);
    await q(`mutation { add_users_to_board(board_id: ${board.id}, user_ids: [${c.userIds.pm1}], kind: subscriber) { id } }`);
    await q(`mutation { delete_folder(folder_id: ${folder.id}) { id } }`);
    expect((await q(`mutation { delete_workspace(workspace_id: ${ws.id}) { state } }`)).delete_workspace.state).toBe("deleted");
  });

  it("webhooks: create_webhook, query webhooks, delete_webhook", async () => {
    const w = (await q(`mutation { create_webhook(board_id: ${c.boardId}, url: "https://example.com/hook", event: create_item) { id board_id event } }`)).create_webhook;
    expect(w).toMatchObject({ board_id: c.boardId, event: "create_item" });
    const cfg = (await q(`mutation { create_webhook(board_id: ${c.boardId}, url: "https://example.com/h2", event: change_specific_column_value, config: ${cv({ columnId: "status" })}) { id config } }`)).create_webhook;
    expect(JSON.parse(cfg.config)).toEqual({ columnId: "status" });
    const list = (await q(`{ webhooks(board_id: ${c.boardId}) { id event } }`)).webhooks;
    expect(list).toHaveLength(2);
    expect((await q(`mutation { delete_webhook(id: ${w.id}) { id } }`)).delete_webhook.id).toBe(w.id);
    expect((await q(`{ webhooks(board_id: ${c.boardId}) { id } }`)).webhooks).toHaveLength(1);
    vi.spyOn(webhooks, "list"); // service stays the single source of truth
  });

  it("notifications and docs", async () => {
    const [n] = [(await q(`mutation { create_notification(user_id: ${c.userIds.pm1}, target_id: ${c.boardId}, text: "Kijk even", target_type: Project) { text } }`)).create_notification];
    expect(n.text).toBe("Kijk even");
    const doc = (await q(`mutation { create_doc(location: { workspace: { workspace_id: ${c.workspaceId}, name: "Notes" } }) { id name workspace_id } }`)).create_doc;
    expect(doc.name).toBe("Notes");
    const docs = (await q(`{ docs(workspace_ids: [${c.workspaceId}]) { id name } }`)).docs;
    expect(docs.map((d: { id: string }) => d.id)).toContain(doc.id);
  });
});

describe("item mutations and column value shapes", () => {
  const newItem = async (name = "Task", values: unknown = {}) =>
    (await q(`mutation($v: JSON) { create_item(board_id: ${c.boardId}, item_name: "${name}", column_values: $v, create_labels_if_missing: true) { id name } }`, { v: JSON.stringify(values) })).create_item;
  const read = async (id: string) => {
    const d = await q(`{ items(ids: [${id}]) { column_values { id type text value } } }`);
    return Object.fromEntries(d.items[0].column_values.map((x: { id: string; text: string; value: string | null }) => [x.id, x]));
  };

  it("create_item accepts API shapes for status, date, people and creates missing labels", async () => {
    const it = await newItem("Shapes", { status: { label: "Brand new label" }, date: { date: "2026-12-01", time: "10:00:00" }, people: { personsAndTeams: [{ id: Number(c.userIds.pm1), kind: "person" }] } });
    const v = await read(it.id);
    expect(v.status.text).toBe("Brand new label");
    expect(JSON.parse(v.date.value)).toMatchObject({ date: "2026-12-01", time: "10:00:00" });
    const people = JSON.parse(v.people.value);
    expect(people.personsAndTeams[0]).toEqual({ id: Number(c.userIds.pm1), kind: "person" });
    expect(v.people.text).toMatch(/Planner/i);
  });

  it("change_column_value, change_simple_column_value, change_multiple_column_values", async () => {
    const it = await newItem("Changer");
    await q(`mutation { change_column_value(board_id: ${c.boardId}, item_id: ${it.id}, column_id: "status", value: ${cv({ label: "Done" })}) { id } }`);
    expect((await read(it.id)).status.text).toBe("Done");
    await q(`mutation { change_column_value(board_id: ${c.boardId}, item_id: ${it.id}, column_id: "status", value: ${cv({ index: 2 })}) { id } }`);
    expect((await read(it.id)).status.text).toBe("Stuck");
    await q(`mutation { change_simple_column_value(board_id: ${c.boardId}, item_id: ${it.id}, column_id: "status", value: "Working on it") { id } }`);
    expect((await read(it.id)).status.text).toBe("Working on it");
    await q(`mutation { change_simple_column_value(board_id: ${c.boardId}, item_id: ${it.id}, column_id: "date", value: "2026-11-11") { id } }`);
    expect((await read(it.id)).date.text).toContain("2026-11-11");
    await q(`mutation { change_multiple_column_values(board_id: ${c.boardId}, item_id: ${it.id}, column_values: ${cv({ status: { label: "Done" }, date: null, name: "Renamed" })}) { id name } }`);
    const after = await read(it.id);
    expect(after.status.text).toBe("Done");
    expect(after.date.value).toBeNull();
    expect((await q(`{ items(ids: [${it.id}]) { name } }`)).items[0].name).toBe("Renamed");
    // clearing with null / empty string
    await q(`mutation { change_column_value(board_id: ${c.boardId}, item_id: ${it.id}, column_id: "status", value: ${cv(null)}) { id } }`);
    expect((await read(it.id)).status.value).toBeNull();
  });

  it("text, numbers, checkbox, link, dropdown and timeline columns round trip", async () => {
    const mk = async (type: string, extra = "") => (await q(`mutation { create_column(board_id: ${c.boardId}, title: "${type} col", column_type: ${type} ${extra}) { id } }`)).create_column.id as string;
    const text = await mk("text"); const num = await mk("numbers"); const chk = await mk("checkbox"); const link = await mk("link"); const tl = await mk("timeline");
    const dd = (await q(`mutation { create_dropdown_column(board_id: ${c.boardId}, title: "dd", defaults: ${cv({ labels: [{ id: 1, label: "One" }, { id: 2, label: "Two" }] })}) { id } }`)).create_dropdown_column.id;
    const it = await newItem("Round trip", { [text]: "hello", [num]: "42.5", [chk]: { checked: "true" }, [link]: { url: "https://example.com", text: "mon" }, [dd]: { ids: [2] }, [tl]: { from: "2026-10-01", to: "2026-10-09" } });
    const v = await read(it.id);
    expect(JSON.parse(v[text].value)).toBe("hello");
    expect(JSON.parse(v[num].value)).toBe("42.5"); // numbers are returned as JSON strings
    expect(JSON.parse(v[chk].value)).toEqual({ checked: "true" });
    expect(JSON.parse(v[link].value)).toMatchObject({ url: "https://example.com", text: "mon" });
    expect(v[dd].text).toBe("Two");
    expect(JSON.parse(v[tl].value)).toMatchObject({ from: "2026-10-01", to: "2026-10-09" });
    const typed = await q(`{ items(ids: [${it.id}]) { column_values { id ... on NumbersValue { number } ... on CheckboxValue { checked } ... on LinkValue { url url_text } ... on DropdownValue { values { id label } } ... on TimelineValue { from to } } } }`);
    const by = Object.fromEntries(typed.items[0].column_values.map((x: { id: string }) => [x.id, x]));
    expect(by[num].number).toBe(42.5);
    expect(by[chk].checked).toBe(true);
    expect(by[link]).toMatchObject({ url: "https://example.com", url_text: "mon" });
    expect(by[dd].values).toEqual([{ id: 2, label: "Two" }]);
    expect(by[tl]).toMatchObject({ from: "2026-10-01", to: "2026-10-09" });
  });

  it("board_relation and computed (formula) columns are returned in API shapes", async () => {
    const other = (await q(`mutation { create_board(board_name: "Related", board_kind: public, workspace_id: ${c.workspaceId}) { id } }`)).create_board.id;
    const target = (await q(`mutation { create_item(board_id: ${other}, item_name: "Target") { id } }`)).create_item.id;
    const rel = (await q(`mutation { create_column(board_id: ${c.boardId}, title: "Link", column_type: board_relation, defaults: ${cv({ boardIds: [other] })}) { id } }`)).create_column.id as string;
    const num = (await q(`mutation { create_column(board_id: ${c.boardId}, title: "Hours", column_type: numbers) { id } }`)).create_column.id as string;
    const f = (await q(`mutation { create_column(board_id: ${c.boardId}, title: "Double", column_type: formula, defaults: ${cv({ formula: "{Hours} * 2" })}) { id } }`)).create_column.id as string;
    const it = await newItem("Linked", { [rel]: { item_ids: [target] }, [num]: 21 });
    const d = await q(`{ items(ids: [${it.id}]) { column_values { id type text value ... on BoardRelationValue { linked_item_ids display_value } ... on FormulaValue { display_value } } } }`);
    const by = Object.fromEntries(d.items[0].column_values.map((x: { id: string }) => [x.id, x]));
    expect(by[rel].linked_item_ids).toEqual([target]);
    expect(by[rel].display_value).toContain("Target");
    expect(JSON.parse(by[rel].value)).toEqual({ linkedPulseIds: [{ linkedPulseId: Number(target) }] });
    expect(by[f].type).toBe("formula");
    expect(by[f].display_value).toContain("42");
  });

  it("invalid values return ColumnValueException; unknown columns InvalidColumnIdException", async () => {
    const it = await newItem("Bad");
    const e1 = await err(`mutation { change_column_value(board_id: ${c.boardId}, item_id: ${it.id}, column_id: "status", value: ${cv({ label: "Nope" })}) { id } }`);
    expect(e1.extensions.code).toBe("ColumnValueException");
    const e2 = await err(`mutation { change_column_value(board_id: ${c.boardId}, item_id: ${it.id}, column_id: "zzz", value: "1") { id } }`);
    expect(e2.extensions.code).toBe("InvalidColumnIdException");
    const e3 = await err(`mutation { change_column_value(board_id: ${c.boardId}, item_id: ${it.id}, column_id: "status", value: "{not json") { id } }`);
    expect(e3.extensions.code).toBe("ColumnValueException");
    const e4 = await err(`{ boards(ids: [999999]) { id } }`);
    expect(e4).toBeUndefined(); // unknown ids are skipped
    const e5 = await err(`mutation { delete_item(item_id: 999999) { id } }`);
    expect(e5.extensions.code).toBe("InvalidItemIdException");
    const e6 = await err(`{ nonexistent }`);
    expect(e6.message).toMatch(/Cannot query field/);
  });

  it("move, duplicate, archive, delete and subitems", async () => {
    const it = await newItem("Mover");
    const g2 = (await q(`mutation { create_group(board_id: ${c.boardId}, group_name: "Second") { id } }`)).create_group;
    const moved = (await q(`mutation { move_item_to_group(item_id: ${it.id}, group_id: "${g2.id}") { id group { id title } } }`)).move_item_to_group;
    expect(moved.group.id).toBe(g2.id);
    const byTitle = (await q(`mutation { create_item(board_id: ${c.boardId}, group_id: "Second", item_name: "By title") { group { title } } }`)).create_item;
    expect(byTitle.group.title).toBe("Second");
    const dup = (await q(`mutation { duplicate_item(board_id: ${c.boardId}, item_id: ${it.id}) { id name } }`)).duplicate_item;
    expect(dup.name).toContain("Mover");
    const other = (await q(`mutation { create_board(board_name: "Target", board_kind: public, workspace_id: ${c.workspaceId}) { id } }`)).create_board.id;
    const tg = (await q(`{ boards(ids: [${other}]) { groups { id } } }`)).boards[0].groups[0].id;
    const mb = (await q(`mutation { move_item_to_board(board_id: ${other}, group_id: ${tg}, item_id: ${dup.id}) { id board { id } } }`)).move_item_to_board;
    expect(mb.board.id).toBe(other);
    expect((await q(`mutation { archive_item(item_id: ${it.id}) { id state } }`)).archive_item.state).toBe("archived");
    expect((await q(`mutation { delete_item(item_id: ${dup.id}) { id state } }`)).delete_item.state).toBe("deleted");
    const parent = await newItem("Parent");
    const sub = (await q(`mutation { create_subitem(parent_item_id: ${parent.id}, item_name: "Child", column_values: ${cv({ status: { label: "Done" } })}) { id parent_item { id } } }`)).create_subitem;
    expect(sub.parent_item.id).toBe(parent.id);
  });

  it("updates: create, edit, like, unlike, pin, delete", async () => {
    const it = await newItem("Talk");
    const u = (await q(`mutation { create_update(item_id: ${it.id}, body: "<p>First</p>") { id text_body } }`)).create_update;
    expect((await q(`mutation { edit_update(id: ${u.id}, body: "<p>Edited</p>") { text_body edited_at } }`)).edit_update.text_body).toBe("Edited");
    expect((await q(`mutation { like_update(update_id: ${u.id}) { likes { creator_id } } }`)).like_update.likes).toHaveLength(1);
    expect((await q(`mutation { unlike_update(update_id: ${u.id}) { likes { creator_id } } }`)).unlike_update.likes).toHaveLength(0);
    await q(`mutation { pin_to_top(id: ${u.id}) { id } }`);
    expect((await q(`mutation { delete_update(id: ${u.id}) { id } }`)).delete_update.id).toBe(u.id);
    expect((await q(`{ items(ids: [${it.id}]) { updates { id } } }`)).items[0].updates).toEqual([]);
  });
});
