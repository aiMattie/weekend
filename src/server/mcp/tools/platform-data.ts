/** MCP tools: bulk items, subitems, groups, columns, updates and boards beyond the basic CRUD. */
import { z } from "zod";
import type { Actor } from "@/lib/actor";
import { ValidationError } from "@/lib/errors";
import * as services from "@/server/services";
import { ensureLabels, parseValuesObject } from "@/server/graphql/column-values";
import { assertBoardInScope, assertItemInScope, filterByWorkspace } from "@/server/platform/scope";
import { id, jsonObject, normalizeArgs } from "../util";
import type { McpToolDefinition } from "./types";
import { boardSnapshot, groupRef, itemForTool, itemOut, toolCtx } from "./platform-boards";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tool<T = any> = McpToolDefinition<T>;

const MAX_BULK = 100;

const columnRef = (actor: Actor, boardId: string, ref: string) => {
  const c = services.columns.list(actor, boardId).find((x) => x.key === ref || x.id === ref);
  if (!c) throw new ValidationError(`Column "${ref}" not found on board ${boardId}`);
  return c;
};
const colOut = (c: { key: string; id: string; title: string; type: string; description: string | null; settings: Record<string, unknown> }) =>
  ({ id: c.key, column_id: c.id, title: c.title, type: c.type, description: c.description, settings: c.settings });
const groupOut = (g: { id: string; title: string; color: string; state?: string }) => ({ id: g.id, title: g.title, color: g.color, state: g.state });

/** Group ids are board-scoped; resolve by id or title and check the group belongs to the board. */
const groupOnBoard = (actor: Actor, groupId: string, boardId?: string) => {
  const g = services.groups.get(actor, boardId ? groupRef(actor, boardId, groupId)! : groupId);
  assertBoardInScope(actor, g.boardId);
  return g;
};
/** Updates are addressed by id only: check the item they sit on against the token's workspace scope. */
const scopedUpdate = (actor: Actor, updateId: string) => { assertItemInScope(actor, services.updates.getDto(actor, updateId).itemId); return updateId; };

function valuesFor(actor: Actor, boardId: string, raw: unknown, createLabels: boolean, scope: "item" | "subitem" = "item") {
  const values = raw ? parseValuesObject(raw) : {};
  if (createLabels) ensureLabels(actor, boardId, services.columns.list(actor, boardId).filter((c) => c.scope === scope), values);
  return values;
}

/* ---------------------------------------------------------------- items */

const bulkItem = z.object({ name: z.string().min(1).optional(), item_name: z.string().min(1).optional(), group_id: z.string().optional(), parent_item_id: id.optional(), column_values: jsonObject.optional() });

const createItems: Tool = {
  name: "create_items", title: "Create items (bulk)",
  description: `Create up to ${MAX_BULK} items (or subitems) on one board in one call. Each entry: {name, group_id?, parent_item_id?, column_values?} with the same value shapes as create_item.`,
  inputSchema: z.object({ board_id: id, items: z.array(z.preprocess(normalizeArgs, bulkItem)).min(1).max(MAX_BULK), create_labels_if_missing: z.boolean().default(false) }),
  handler(actor, i) {
    const created = (i.items as z.infer<typeof bulkItem>[]).map((it) => {
      const name = it.name ?? it.item_name;
      if (!name) throw new ValidationError("every item needs a name");
      const values = valuesFor(actor, i.board_id, it.column_values, i.create_labels_if_missing, it.parent_item_id ? "subitem" : "item");
      return services.items.create(actor, { boardId: i.board_id, name, parentItemId: it.parent_item_id, groupId: it.parent_item_id ? undefined : groupRef(actor, i.board_id, it.group_id), values }).id;
    });
    const tc = toolCtx(actor, i.board_id);
    return { board_id: i.board_id, count: created.length, items: created.map((itemId) => itemForTool(services.items.get(actor, itemId), tc)) };
  },
};

const updateItems: Tool = {
  name: "update_items", title: "Update items (bulk)", idempotent: true,
  description: `Change column values of up to ${MAX_BULK} items in one call. updates = [{item_id, column_values, create_labels_if_missing?}]. Use the key "name" inside column_values to rename.`,
  inputSchema: z.object({
    board_id: id.optional(),
    updates: z.array(z.preprocess(normalizeArgs, z.object({ item_id: id, column_values: jsonObject, create_labels_if_missing: z.boolean().optional() }))).min(1).max(MAX_BULK),
    create_labels_if_missing: z.boolean().default(false),
  }),
  handler(actor, i) {
    const out = (i.updates as { item_id: string; column_values: Record<string, unknown>; create_labels_if_missing?: boolean }[]).map((u) => {
      assertItemInScope(actor, u.item_id);
      const it = services.items.get(actor, u.item_id);
      if (i.board_id && i.board_id !== it.boardId) throw new ValidationError(`Item ${u.item_id} is not on board ${i.board_id}`);
      const createLabels = u.create_labels_if_missing ?? i.create_labels_if_missing;
      services.items.changeMultipleColumnValues(actor, it.id, valuesFor(actor, it.boardId, u.column_values, createLabels, it.parentItemId ? "subitem" : "item"));
      return itemOut(actor, it.id);
    });
    return { count: out.length, items: out };
  },
};

const updateItemName: Tool = {
  name: "update_item_name", title: "Rename item", idempotent: true,
  description: "Rename an item or subitem.",
  inputSchema: z.object({ item_id: id, name: z.string().min(1) }),
  handler: (actor, i) => { services.items.update(actor, i.item_id, { name: i.name }); return itemOut(actor, i.item_id); },
};

const moveItemToGroup: Tool = {
  name: "move_item_to_group", title: "Move item to group", idempotent: true,
  description: "Move an item to another group on the same board (group id or title, see get_board_info).",
  inputSchema: z.object({ item_id: id, group_id: z.string() }),
  handler(actor, i) {
    const cur = services.items.get(actor, i.item_id);
    services.items.move(actor, i.item_id, { groupId: groupRef(actor, cur.boardId, i.group_id) });
    return itemOut(actor, i.item_id);
  },
};

const listSubitems: Tool = {
  name: "list_subitems", title: "List subitems",
  description: "List the subitems of an item with their column values.",
  inputSchema: z.object({ parent_item_id: id }),
  handler(actor, i) {
    const parent = services.items.get(actor, i.parent_item_id);
    const tc = toolCtx(actor, parent.boardId);
    return { parent_item_id: parent.id, subitems: services.items.listSubitems(actor, parent.id).map((s) => itemForTool(s, tc)) };
  },
};

const createSubitem: Tool = {
  name: "create_subitem", title: "Create subitem",
  description: "Create a subitem under an item. column_values are keyed by subitem column id.",
  inputSchema: z.object({ parent_item_id: id, item_name: z.string().min(1).optional(), name: z.string().min(1).optional(), column_values: jsonObject.optional(), create_labels_if_missing: z.boolean().default(false) }),
  handler(actor, i) {
    const name = i.item_name ?? i.name;
    if (!name) throw new ValidationError("item_name is required");
    const parent = services.items.get(actor, i.parent_item_id);
    const values = valuesFor(actor, parent.boardId, i.column_values, i.create_labels_if_missing, "subitem");
    return itemOut(actor, services.items.create(actor, { boardId: parent.boardId, parentItemId: parent.id, name, values }).id);
  },
};

const getFullBoardData: Tool = {
  name: "get_full_board_data", title: "Get full board data", cost: 100,
  description: "Everything on a board in one call: structure (groups, columns, views) plus every item (max 500) with column values, subitems and updates.",
  inputSchema: z.object({ board_id: id, limit: z.number().int().min(1).max(500).default(500), include_updates: z.boolean().default(true) }),
  handler(actor, i) {
    const tc = toolCtx(actor, i.board_id);
    const items = services.items.list(actor, { boardId: i.board_id, limit: i.limit }).map((it) => ({
      ...itemForTool(it, tc),
      subitems: services.items.listSubitems(actor, it.id).map((s) => itemForTool(s, tc)),
      ...(i.include_updates ? { updates: services.updates.list(actor, it.id).map((u) => ({ id: u.id, text: u.bodyText, author: u.author?.name ?? null, created_at: u.createdAt, replies: u.replies.map((r) => ({ id: r.id, text: r.bodyText, author: r.author?.name ?? null, created_at: r.createdAt })) })) } : {}),
    }));
    return { ...boardSnapshot(actor, i.board_id), items };
  },
};

/* ---------------------------------------------------------------- groups */

const updateGroup: Tool = {
  name: "update_group", title: "Update group", idempotent: true,
  description: "Rename or recolor a group, or reposition it before/after another group (ids or titles).",
  inputSchema: z.object({ board_id: id.optional(), group_id: z.string(), group_name: z.string().optional(), title: z.string().optional(), group_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), relative_to: z.string().optional(), position_relative_method: z.enum(["before_at", "after_at"]).optional() }),
  handler(actor, i) {
    let g = groupOnBoard(actor, i.group_id, i.board_id);
    const title = i.group_name ?? i.title;
    if (title || i.group_color) g = services.groups.update(actor, g.id, { ...(title ? { title } : {}), ...(i.group_color ? { color: i.group_color } : {}) });
    if (i.relative_to) {
      const rel = groupRef(actor, g.boardId, i.relative_to)!;
      g = services.groups.move(actor, g.id, i.position_relative_method === "before_at" ? { beforeId: rel } : { afterId: rel });
    }
    return groupOut(g);
  },
};

const deleteGroup: Tool = {
  name: "delete_group", title: "Delete group", destructive: true,
  description: "Delete a group and all its items (to the trash). A board keeps at least one group.",
  inputSchema: z.object({ board_id: id.optional(), group_id: z.string() }),
  handler(actor, i) { const g = groupOnBoard(actor, i.group_id, i.board_id); services.groups.remove(actor, g.id); return { deleted: true, group_id: g.id }; },
};

const archiveGroup: Tool = {
  name: "archive_group", title: "Archive group", destructive: true,
  description: "Archive a group together with its items.",
  inputSchema: z.object({ board_id: id.optional(), group_id: z.string() }),
  handler(actor, i) { const g = groupOnBoard(actor, i.group_id, i.board_id); return { archived: true, ...groupOut(services.groups.archive(actor, g.id)) }; },
};

const duplicateGroup: Tool = {
  name: "duplicate_group", title: "Duplicate group",
  description: "Duplicate a group (with its items unless with_items is false).",
  inputSchema: z.object({ board_id: id.optional(), group_id: z.string(), group_title: z.string().optional(), with_items: z.boolean().default(true) }),
  handler(actor, i) { const g = groupOnBoard(actor, i.group_id, i.board_id); return groupOut(services.groups.duplicate(actor, g.id, { withItems: i.with_items, title: i.group_title })); },
};

/* ---------------------------------------------------------------- columns + board */

const updateColumn: Tool = {
  name: "update_column", title: "Update column", idempotent: true,
  description: "Change a column's title, description or settings (e.g. status labels), or convert it to another column_type (values are converted).",
  inputSchema: z.object({ board_id: id, column_id: z.string(), column_title: z.string().min(1).optional(), column_description: z.string().nullish(), column_settings: jsonObject.optional(), column_type: z.string().optional() }),
  handler(actor, i) {
    const c = columnRef(actor, i.board_id, i.column_id);
    if (i.column_type && i.column_type !== c.type) services.columnOps.changeType(actor, c.id, { type: i.column_type });
    const patch: Record<string, unknown> = {};
    if (i.column_title) patch.title = i.column_title;
    if (i.column_description !== undefined) patch.description = i.column_description;
    if (i.column_settings) patch.settings = i.column_settings;
    return colOut(Object.keys(patch).length ? services.columns.update(actor, c.id, patch) : services.columns.get(actor, c.id));
  },
};

const getBoardSchema: Tool = {
  name: "get_board_schema", title: "Get board schema",
  description: "Groups and columns (id, type, settings such as status labels) of a board. Lighter than get_board_info.",
  inputSchema: z.object({ board_id: id }),
  handler(actor, i) {
    return {
      board_id: i.board_id,
      groups: services.groups.list(actor, i.board_id).map(groupOut),
      columns: services.columns.list(actor, i.board_id).filter((c) => !c.archived).map((c) => ({ ...colOut(c), scope: c.scope })),
    };
  },
};

const updateBoard: Tool = {
  name: "update_board", title: "Update board", idempotent: true,
  description: "Rename a board or change its description or kind (public/private/share).",
  inputSchema: z.object({ board_id: id, board_name: z.string().min(1).optional(), description: z.string().nullish(), board_kind: z.enum(["public", "private", "share"]).optional() }),
  handler(actor, i) {
    const b = services.boards.update(actor, i.board_id, { ...(i.board_name ? { name: i.board_name } : {}), ...(i.description !== undefined ? { description: i.description } : {}), ...(i.board_kind ? { visibility: i.board_kind } : {}) });
    return { id: b.id, name: b.name, description: b.description, kind: b.visibility };
  },
};

const duplicateBoard: Tool = {
  name: "duplicate_board", title: "Duplicate board",
  description: "Duplicate a board (structure only, or with items and updates).",
  inputSchema: z.object({ board_id: id, board_name: z.string().optional(), with_items: z.boolean().default(false), with_updates: z.boolean().default(false) }),
  handler: (actor, i) => { const b = services.boards.duplicate(actor, i.board_id, { name: i.board_name, withItems: i.with_items, withUpdates: i.with_updates }); return { id: b.id, name: b.name, workspace_id: b.workspaceId }; },
};

const getBoardMembers: Tool = {
  name: "get_board_members", title: "Get board members",
  description: "Explicit members of a board with their role (owner, editor, viewer).",
  inputSchema: z.object({ board_id: id }),
  handler: (actor, i) => ({ board_id: i.board_id, members: services.boards.listMembers(actor, i.board_id).map((m) => ({ user_id: m.userId, name: m.name, email: m.email, role: m.role })) }),
};

const undoAction: Tool = {
  name: "undo_action", title: "Undo last action",
  description: "Undo your most recent undoable action on a board (redo: true re-applies the last undone one).",
  inputSchema: z.object({ board_id: id, redo: z.boolean().default(false) }),
  handler(actor, i) {
    const r = i.redo ? services.undo.redo(actor, i.board_id) : services.undo.undo(actor, i.board_id);
    return r ? { done: true, action: r.label } : { done: false, message: `Nothing to ${i.redo ? "redo" : "undo"} on this board` };
  },
};

/* ---------------------------------------------------------------- updates */

const deleteUpdate: Tool = {
  name: "delete_update", title: "Delete update", destructive: true,
  description: "Delete an update (comment) or reply. Only your own unless you are an admin.",
  inputSchema: z.object({ update_id: id.optional(), id: id.optional() }),
  handler(actor, i) {
    const updateId = i.update_id ?? i.id;
    if (!updateId) throw new ValidationError("update_id is required");
    services.updates.remove(actor, scopedUpdate(actor, updateId));
    return { deleted: true, update_id: updateId };
  },
};

const editUpdate: Tool = {
  name: "edit_update", title: "Edit update", idempotent: true,
  description: "Replace the body (HTML) of one of your updates.",
  inputSchema: z.object({ update_id: id, body: z.string().min(1) }),
  handler: (actor, i) => { const u = services.updates.edit(actor, scopedUpdate(actor, i.update_id), { body: i.body }); return { id: u.id, item_id: u.itemId, text: u.bodyText, edited_at: u.editedAt }; },
};

const listBoardsInWorkspaces: Tool = {
  name: "list_archived_boards", title: "List archived boards",
  description: "List archived boards (restore them with the GraphQL API or the trash).",
  inputSchema: z.object({ workspace_id: id.optional() }),
  handler: (actor, i) => ({ boards: filterByWorkspace(actor, services.boards.list(actor, { workspaceId: i.workspace_id, state: "archived" })).map((b) => ({ id: b.id, name: b.name, workspace_id: b.workspaceId })) }),
};

export const dataTools: Tool[] = [
  createItems, updateItems, updateItemName, moveItemToGroup, listSubitems, createSubitem, getFullBoardData,
  updateGroup, deleteGroup, archiveGroup, duplicateGroup,
  updateColumn, getBoardSchema, updateBoard, duplicateBoard, getBoardMembers, undoAction,
  deleteUpdate, editUpdate, listBoardsInWorkspaces,
];
