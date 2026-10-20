/** MCP tools: boards, groups, columns, items. */
import { z } from "zod";
import type { Actor } from "@/lib/actor";
import { ValidationError } from "@/lib/errors";
import { listColumnLogic, getColumnLogic } from "@/server/columns/registry";
import * as services from "@/server/services";
import { formatContext, type ColumnRow, type ItemRow } from "@/server/services/_shared";
import { buildColumnValues, ensureLabels, parseValuesObject } from "@/server/graphql/column-values";
import { decodeCursor, pageItems, type ItemsQueryParams } from "@/server/graphql/items-query";
import { filterByWorkspace, assertWorkspaceInScope } from "@/server/platform/scope";
import { boardInsights } from "../board-digest";
import { id, idList, jsonArray, jsonObject } from "../util";
import type { McpToolDefinition } from "./types";
import { COLUMN_EXAMPLES } from "./column-examples";
import { getColumnTypeInfo as columnTypeInfo } from "@/server/columns/type-info";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tool<T = any> = McpToolDefinition<T>;

export interface ToolCtx { cols: ColumnRow[]; fmt: ReturnType<typeof formatContext>; groups: Map<string, string> }
export const toolCtx = (actor: Actor, boardId: string): ToolCtx => ({
  cols: services.columns.list(actor, boardId),
  fmt: formatContext(actor.accountId),
  groups: new Map(services.groups.list(actor, boardId).map((g) => [g.id, g.title])),
});

export function itemForTool(item: ItemRow, tc: ToolCtx, includeColumns = true, only?: string[]) {
  const values = includeColumns ? Object.fromEntries(
    buildColumnValues(item, tc.cols, tc.fmt, { ids: only })
      .filter((c) => c.type !== "name")
      .map((c) => [c.id, { title: c.column.title, type: c.type, text: c.text, value: c.raw }]),
  ) : undefined;
  return { id: item.id, name: item.name, group_id: item.groupId, group: item.groupId ? tc.groups.get(item.groupId) ?? null : null, state: item.state, parent_item_id: item.parentItemId, created_at: item.createdAt, updated_at: item.updatedAt, ...(values ? { column_values: values } : {}) };
}

/** Compact snapshot of a board (structure + first items); used by get_board_info and the MCP resource. */
export function boardSnapshot(actor: Actor, boardId: string, itemLimit = 0) {
  const b = services.boards.get(actor, boardId);
  const cols = services.columns.list(actor, boardId);
  const groups = services.groups.list(actor, boardId);
  const ws = services.workspaces.get(actor, b.workspaceId);
  const tc = toolCtx(actor, boardId);
  const info = services.boardInfo.info(actor, boardId);
  return {
    id: b.id, name: b.name, description: b.description, kind: b.visibility, type: b.kind, state: b.state,
    workspace: { id: ws.id, name: ws.name }, folder_id: b.folderId, owner_id: b.ownerId, counts: info.counts,
    groups: groups.map((g) => ({ id: g.id, title: g.title, color: g.color })),
    columns: cols.filter((c) => !c.archived).map((c) => ({ id: c.key, column_id: c.id, title: c.title, type: c.type, scope: c.scope, description: c.description, settings: c.settings })),
    views: services.views.list(actor, boardId).map((v) => ({ id: v.id, name: v.name, type: v.type })),
    ...(itemLimit ? { items: services.items.list(actor, { boardId, limit: itemLimit }).map((i) => itemForTool(i, tc)) } : {}),
  };
}

export const groupRef = (actor: Actor, boardId: string, ref?: string | null) => {
  if (!ref) return undefined;
  const gs = services.groups.list(actor, boardId);
  const g = gs.find((x) => x.id === ref) ?? gs.find((x) => x.title.toLowerCase() === ref.toLowerCase());
  if (!g) throw new ValidationError(`Group "${ref}" not found on board ${boardId}`);
  return g.id;
};

const filterSchema = z.object({
  column_id: z.string(),
  compare_value: z.unknown(),
  operator: z.string().optional(),
  compare_attribute: z.string().nullish(),
});

const createBoard: Tool = {
  name: "create_board",
  description: "Create a board in a workspace. Optional initial groups and columns ({title, type, settings}). Returns the board with its columns.",
  inputSchema: z.object({
    board_name: z.string().min(1).optional(), name: z.string().min(1).optional(), title: z.string().min(1).optional(),
    board_kind: z.enum(["public", "private", "share"]).default("public"),
    workspace_id: id.optional(), workspace: id.optional(), folder_id: id.optional(), description: z.string().optional(),
    columns: jsonArray.optional(), groups: z.array(z.string()).optional(),
    empty: z.boolean().optional().describe("true = no default Owner/Status/Date columns"),
  }),
  handler(actor, i) {
    const name = i.board_name ?? i.name ?? i.title;
    if (!name) throw new ValidationError("board_name is required");
    const workspaceId = i.workspace_id ?? i.workspace ?? filterByWorkspace(actor, services.workspaces.list(actor), "id")[0]?.id;
    if (!workspaceId) throw new ValidationError("workspace_id is required");
    assertWorkspaceInScope(actor, workspaceId);
    const wantsColumns = Array.isArray(i.columns) && i.columns.length > 0;
    const board = services.boards.create(actor, { workspaceId, folderId: i.folder_id ?? null, name, description: i.description ?? null, visibility: i.board_kind, emptyColumns: i.empty || wantsColumns });
    for (const c of (i.columns ?? []) as { title: string; type: string; settings?: Record<string, unknown> }[]) {
      services.columns.create(actor, board.id, { title: c.title, type: c.type, settings: c.settings });
    }
    if (i.groups?.length) {
      const existing = services.groups.list(actor, board.id);
      i.groups.forEach((title: string, idx: number) => {
        if (idx === 0 && existing[0]) services.groups.update(actor, existing[0].id, { title });
        else services.groups.create(actor, board.id, { title });
      });
    }
    return boardSnapshot(actor, board.id);
  },
};

const getBoardInfo: Tool = {
  name: "get_board_info",
  description: "Get a board's structure: workspace, groups, columns (ids, types, settings such as status labels), views and counts.",
  inputSchema: z.object({ board_id: id }),
  handler: (actor, i) => boardSnapshot(actor, i.board_id),
};

const getBoardItemsPage: Tool = {
  name: "get_board_items_page",
  description: "Get a page of items of a board with column values. Supports filters (rules with operators any_of, is_empty, contains_text, greater_than...), order_by, search_term and cursor pagination. Pass the returned cursor to get the next page.",
  inputSchema: z.object({
    board_id: id, limit: z.number().int().min(1).max(500).default(25), cursor: z.string().optional(),
    filters: jsonArray.optional(), filters_operator: z.enum(["and", "or", "AND", "OR"]).optional(),
    order_by: jsonArray.optional(), include_columns: z.boolean().default(true), column_ids: z.array(z.string()).optional(),
    item_ids: idList.optional(), search_term: z.string().optional(),
  }),
  handler(actor, i) {
    const tc = toolCtx(actor, i.board_id);
    let page;
    if (i.cursor) page = pageItems(actor, decodeCursor(i.cursor), i.limit);
    else {
      const rules = ((i.filters ?? []) as unknown[]).map((f) => filterSchema.parse(f)).map((f) => ({ ...f, operator: f.operator?.toLowerCase() }));
      const op = (i.filters_operator ?? "and").toLowerCase() as "and" | "or";
      if (i.search_term && op === "and") rules.push({ column_id: "name", compare_value: [i.search_term], operator: "contains_text", compare_attribute: null });
      const params: ItemsQueryParams = {
        ids: i.item_ids ?? null, operator: op, rules,
        order_by: ((i.order_by ?? []) as { column_id: string; direction?: string }[]).map((o) => ({ column_id: o.column_id, direction: o.direction?.toLowerCase() === "desc" ? "desc" : "asc" })),
      };
      page = pageItems(actor, { boardId: i.board_id, offset: 0, params }, i.limit);
      if (i.search_term && op === "or") page = { ...page, items: page.items.filter((x) => x.name.toLowerCase().includes(i.search_term!.toLowerCase())) };
    }
    return { board_id: i.board_id, count: page.items.length, cursor: page.cursor, items: page.items.map((it) => itemForTool(it, tc, i.include_columns, i.column_ids)) };
  },
};

const getBoardActivity: Tool = {
  name: "get_board_activity",
  description: "Get the activity log of a board (newest first), optionally between two ISO dates.",
  inputSchema: z.object({ board_id: id, from_date: z.string().optional(), to_date: z.string().optional(), limit: z.number().int().min(1).max(500).default(50) }),
  handler(actor, i) {
    const rows = services.activity.activityForBoard(actor, i.board_id, 5000)
      .filter((r) => (!i.from_date || r.createdAt >= i.from_date) && (!i.to_date || r.createdAt <= i.to_date)).slice(0, i.limit);
    return { board_id: i.board_id, count: rows.length, activity: rows.map((r) => ({ id: r.id, event: r.event, item_id: r.itemId, group_id: r.groupId, column_id: r.columnId, user_id: r.userId, created_at: r.createdAt, data: r.data })) };
  },
};

const boardInsightsTool: Tool = {
  name: "board_insights",
  description: "Aggregate a board: item count per group, per status/dropdown/people/checkbox value, sums and averages of numbers columns, overdue items. Optional filters (same rule format as get_board_items_page).",
  inputSchema: z.object({ board_id: id, filters: jsonArray.optional(), filters_operator: z.enum(["and", "or"]).optional(), column_ids: z.array(z.string()).optional() }),
  handler: (actor, i) => boardInsights(actor, i.board_id, {
    columnIds: i.column_ids,
    filters: i.filters ? { rules: (i.filters as unknown[]).map((f) => filterSchema.parse(f)), operator: i.filters_operator ?? "and" } : null,
  }),
};

const createGroup: Tool = {
  name: "create_group",
  description: "Create a group on a board (optionally positioned before/after another group).",
  inputSchema: z.object({
    board_id: id, group_name: z.string().optional(), title: z.string().optional(), name: z.string().optional(), group_color: z.string().optional(),
    relative_to: z.string().optional(), position_relative_method: z.enum(["before_at", "after_at"]).optional(),
  }),
  handler(actor, i) {
    const title = i.group_name ?? i.title ?? i.name;
    if (!title) throw new ValidationError("group_name is required");
    const rel = groupRef(actor, i.board_id, i.relative_to);
    const g = services.groups.create(actor, i.board_id, { title, ...(i.group_color && /^#[0-9a-f]{6}$/i.test(i.group_color) ? { color: i.group_color } : {}), ...(rel ? (i.position_relative_method === "before_at" ? { beforeId: rel } : { afterId: rel }) : {}) });
    return { id: g.id, title: g.title, color: g.color };
  },
};

const createColumn: Tool = {
  name: "create_column",
  description: "Add a column to a board. column_type e.g. status, text, long_text, numbers, date, timeline, people, dropdown, checkbox, link, email, phone, rating, tags, board_relation, formula. Use get_column_type_info for settings.",
  inputSchema: z.object({
    board_id: id, column_type: z.string(), column_title: z.string().optional(), title: z.string().optional(),
    column_description: z.string().optional(), column_settings: jsonObject.optional(), after_column_id: z.string().optional(),
  }),
  handler(actor, i) {
    const title = i.column_title ?? i.title;
    if (!title) throw new ValidationError("column_title is required");
    const after = i.after_column_id ? services.columns.list(actor, i.board_id).find((c) => c.key === i.after_column_id || c.id === i.after_column_id) : undefined;
    const c = services.columns.create(actor, i.board_id, { title, type: i.column_type, description: i.column_description, settings: i.column_settings, ...(after ? { afterId: after.id } : {}) });
    return { id: c.key, column_id: c.id, title: c.title, type: c.type, settings: c.settings };
  },
};

const getColumnTypeInfo: Tool = {
  name: "get_column_type_info",
  description: "Describe a column type: label, whether it is read-only, default settings, and example values for create_item / change_item_column_values.",
  inputSchema: z.object({ column_type: z.string().optional() }),
  handler(_actor, i) {
    const describe = (type: string) => {
      const l = getColumnLogic(type);
      const info = columnTypeInfo(type);
      return {
        type, label: l.label, category: l.category, read_only: !!l.readOnly, value_shape: info.valueShape, example_value: info.exampleValue ?? COLUMN_EXAMPLES[type] ?? null,
        settings_example: info.settingsExample, default_settings: l.defaultSettings(), filter_operators: l.filter.operators.map((o) => o.id), ...(info.notes ? { notes: info.notes } : {}),
      };
    };
    if (i.column_type) return describe(i.column_type);
    return { column_types: listColumnLogic().map((l) => describe(l.type)) };
  },
};

const createItem: Tool = {
  name: "create_item",
  description: "Create an item (or a subitem when parent_item_id is set). column_values is an object keyed by column id, e.g. {\"status\":{\"label\":\"Done\"},\"date\":\"2026-10-12\",\"people\":{\"personsAndTeams\":[{\"id\":123,\"kind\":\"person\"}]}}. Unknown status/dropdown labels are created when create_labels_if_missing is true.",
  inputSchema: z.object({
    board_id: id, name: z.string().optional(), item_name: z.string().optional(), group_id: z.string().optional(), parent_item_id: id.optional(),
    column_values: jsonObject.optional(), create_labels_if_missing: z.boolean().default(false),
  }),
  handler(actor, i) {
    const name = i.name ?? i.item_name;
    if (!name) throw new ValidationError("name is required");
    const values = i.column_values ? parseValuesObject(i.column_values) : {};
    if (i.create_labels_if_missing) ensureLabels(actor, i.board_id, services.columns.list(actor, i.board_id).filter((c) => c.scope === (i.parent_item_id ? "subitem" : "item")), values);
    const row = services.items.create(actor, { boardId: i.board_id, name, parentItemId: i.parent_item_id, groupId: i.parent_item_id ? undefined : groupRef(actor, i.board_id, i.group_id), values });
    return itemOut(actor, row.id);
  },
};

export function itemOut(actor: Actor, itemId: string) {
  const it = services.items.get(actor, itemId);
  return itemForTool(it, toolCtx(actor, it.boardId));
}

const changeItemColumnValues: Tool = {
  name: "change_item_column_values",
  description: "Change one or more column values of an item. column_values is an object keyed by column id (null clears a column). Use the API value shapes (see get_column_type_info).",
  inputSchema: z.object({ board_id: id.optional(), item_id: id, column_values: jsonObject, create_labels_if_missing: z.boolean().default(false) }),
  handler(actor, i) {
    const it = services.items.get(actor, i.item_id);
    if (i.board_id && i.board_id !== it.boardId) throw new ValidationError(`Item ${i.item_id} is not on board ${i.board_id}`);
    const values = parseValuesObject(i.column_values);
    if (i.create_labels_if_missing) ensureLabels(actor, it.boardId, services.columns.list(actor, it.boardId), values);
    services.items.changeMultipleColumnValues(actor, it.id, values);
    return itemOut(actor, it.id);
  },
};

/* ---- extras beyond the basic tool list ---- */
const getItem: Tool = {
  name: "get_item", readOnly: true,
  description: "Get one item with all its column values, subitems and updates.",
  inputSchema: z.object({ item_id: id }),
  handler(actor, i) {
    const it = services.items.get(actor, i.item_id);
    const tc = toolCtx(actor, it.boardId);
    return { ...itemForTool(it, tc), subitems: it.subitems.map((s) => itemForTool(s, tc)), updates: services.updates.list(actor, it.id).map((u) => ({ id: u.id, text: u.bodyText, author: u.author?.name ?? null, created_at: u.createdAt, replies: u.replies.length })) };
  },
};
const deleteItem: Tool = { name: "delete_item", description: "Delete an item (moves it to the trash).", inputSchema: z.object({ item_id: id }), handler: (actor, i) => { services.items.remove(actor, i.item_id); return { deleted: true, item_id: i.item_id }; } };
const archiveItem: Tool = { name: "archive_item", description: "Archive an item.", inputSchema: z.object({ item_id: id }), handler: (actor, i) => { services.items.archive(actor, i.item_id); return { archived: true, item_id: i.item_id }; } };
const duplicateItem: Tool = { name: "duplicate_item", description: "Duplicate an item (with subitems).", inputSchema: z.object({ item_id: id, with_updates: z.boolean().default(false) }), handler: (actor, i) => itemOut(actor, services.items.duplicate(actor, i.item_id, { withUpdates: i.with_updates }).id) };
const moveItem: Tool = {
  name: "move_item", description: "Move an item to another group and/or board.",
  inputSchema: z.object({ item_id: id, group_id: z.string().optional(), board_id: id.optional() }),
  handler(actor, i) {
    const cur = services.items.get(actor, i.item_id);
    const boardId = i.board_id ?? cur.boardId;
    const row = services.items.move(actor, i.item_id, { boardId: i.board_id, groupId: groupRef(actor, boardId, i.group_id) });
    return itemOut(actor, row.id);
  },
};
const deleteColumn: Tool = { name: "delete_column", description: "Delete a column from a board.", inputSchema: z.object({ board_id: id, column_id: z.string() }), handler: (actor, i) => { const c = services.columns.list(actor, i.board_id).find((x) => x.key === i.column_id || x.id === i.column_id); if (!c) throw new ValidationError("Column not found"); services.columns.remove(actor, c.id); return { deleted: true, column_id: i.column_id }; } };
const archiveBoard: Tool = { name: "archive_board", description: "Archive a board.", inputSchema: z.object({ board_id: id }), handler: (actor, i) => { services.boards.archive(actor, i.board_id); return { archived: true, board_id: i.board_id }; } };
const deleteBoard: Tool = { name: "delete_board", description: "Delete a board (trash).", inputSchema: z.object({ board_id: id }), handler: (actor, i) => { services.boards.remove(actor, i.board_id); return { deleted: true, board_id: i.board_id }; } };
const listBoards: Tool = {
  name: "list_boards", readOnly: true,
  description: "List boards the token can see (optionally in one workspace).",
  inputSchema: z.object({ workspace_id: id.optional(), search_term: z.string().optional(), limit: z.number().int().min(1).max(500).default(100) }),
  handler: (actor, i) => ({
    boards: filterByWorkspace(actor, services.boards.list(actor, { workspaceId: i.workspace_id }))
      .filter((b) => !i.search_term || b.name.toLowerCase().includes(i.search_term.toLowerCase())).slice(0, i.limit)
      .map((b) => ({ id: b.id, name: b.name, workspace_id: b.workspaceId, kind: b.visibility, type: b.kind })),
  }),
};

export const boardTools: Tool[] = [
  createBoard, getBoardInfo, getBoardItemsPage, getBoardActivity, boardInsightsTool, createGroup, createColumn, getColumnTypeInfo, createItem, changeItemColumnValues,
  getItem, deleteItem, archiveItem, duplicateItem, moveItem, deleteColumn, archiveBoard, deleteBoard, listBoards,
];
