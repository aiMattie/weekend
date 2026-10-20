/** Mutations on items, values, updates. */
import { NotFoundError, ValidationError } from "@/lib/errors";
import * as services from "@/server/services";
import { ensureLabels, parseJsonInput, parseValuesObject } from "../column-values";
import { boardColumns } from "../context";
import { itemOnBoard, mutation, resolveGroup } from "./mutation-helpers";

const position = (method: string | null | undefined, rel: string | null | undefined) =>
  rel ? (method === "before_at" ? { beforeId: String(rel) } : { afterId: String(rel) }) : {};

export const itemMutations = {
  create_item: mutation((a, ctx) => {
    const boardId = String(a.board_id);
    const values = a.column_values ? parseValuesObject(a.column_values) : {};
    if (a.create_labels_if_missing) ensureLabels(ctx.actor, boardId, boardColumns(ctx, boardId).map((c) => ({ ...c })), values);
    const group = resolveGroup(ctx.actor, boardId, a.group_id);
    return services.items.create(ctx.actor, { boardId, groupId: group?.id, name: a.item_name, values, ...position(a.position_relative_method, a.relative_to) });
  }, { boardArg: "board_id", hint: "ColumnValueException" }),

  create_subitem: mutation((a, ctx) => {
    const parent = services.items.get(ctx.actor, String(a.parent_item_id));
    const values = a.column_values ? parseValuesObject(a.column_values) : {};
    services.items.ensureSubitemColumns(parent.boardId);
    if (a.create_labels_if_missing) ensureLabels(ctx.actor, parent.boardId, services.columns.list(ctx.actor, parent.boardId).filter((c) => c.scope === "subitem"), values);
    return services.items.create(ctx.actor, { boardId: parent.boardId, parentItemId: parent.id, name: a.item_name, values });
  }, { itemArg: "parent_item_id", hint: "ColumnValueException" }),

  change_column_value: mutation((a, ctx) => {
    const it = itemOnBoard(ctx, a.item_id, a.board_id);
    const value = parseJsonInput(a.value);
    if (a.create_labels_if_missing) ensureLabels(ctx.actor, it.boardId, services.columns.list(ctx.actor, it.boardId), { [a.column_id]: value });
    return services.items.changeColumnValue(ctx.actor, it.id, a.column_id, value);
  }, { boardArg: "board_id", hint: "ColumnValueException" }),

  change_simple_column_value: mutation((a, ctx) => {
    const it = itemOnBoard(ctx, a.item_id, a.board_id);
    const value = a.value === "" ? null : a.value;
    if (a.create_labels_if_missing) ensureLabels(ctx.actor, it.boardId, services.columns.list(ctx.actor, it.boardId), { [a.column_id]: value });
    return services.items.changeColumnValue(ctx.actor, it.id, a.column_id, value);
  }, { boardArg: "board_id", hint: "ColumnValueException" }),

  change_multiple_column_values: mutation((a, ctx) => {
    const it = itemOnBoard(ctx, a.item_id, a.board_id);
    const values = parseValuesObject(a.column_values);
    if (a.create_labels_if_missing) ensureLabels(ctx.actor, it.boardId, services.columns.list(ctx.actor, it.boardId), values);
    return services.items.changeMultipleColumnValues(ctx.actor, it.id, values);
  }, { boardArg: "board_id", hint: "ColumnValueException" }),

  move_item_to_group: mutation((a, ctx) => {
    const it = services.items.get(ctx.actor, String(a.item_id));
    const group = resolveGroup(ctx.actor, it.boardId, a.group_id);
    return services.items.move(ctx.actor, it.id, { groupId: group!.id });
  }, { itemArg: "item_id" }),

  move_item_to_board: mutation((a, ctx) => {
    const it = services.items.get(ctx.actor, String(a.item_id));
    const group = resolveGroup(ctx.actor, String(a.board_id), a.group_id);
    return services.items.move(ctx.actor, it.id, { boardId: String(a.board_id), groupId: group!.id });
  }, { itemArg: "item_id", boardArg: "board_id" }),

  duplicate_item: mutation((a, ctx) => {
    const it = itemOnBoard(ctx, a.item_id, a.board_id);
    return services.items.duplicate(ctx.actor, it.id, { withUpdates: !!a.with_updates });
  }, { boardArg: "board_id" }),

  archive_item: mutation((a, ctx) => services.items.archive(ctx.actor, String(a.item_id)), { itemArg: "item_id" }),
  delete_item: mutation((a, ctx) => {
    const it = services.items.get(ctx.actor, String(a.item_id));
    services.items.remove(ctx.actor, it.id);
    return { ...it, state: "deleted" };
  }, { itemArg: "item_id" }),
  clear_item_updates: mutation((a, ctx) => {
    const it = services.items.get(ctx.actor, String(a.item_id));
    for (const u of services.updates.list(ctx.actor, it.id)) services.updates.remove(ctx.actor, u.id);
    return it;
  }, { itemArg: "item_id" }),

  create_update: mutation((a, ctx) => {
    const itemId = a.item_id ? String(a.item_id) : null;
    if (!itemId && a.parent_id) throw new ValidationError("item_id is required when replying to an update");
    if (!itemId) throw new ValidationError("item_id is required");
    return services.updates.create(ctx.actor, { itemId, body: a.body, parentUpdateId: a.parent_id ?? null });
  }, { itemArg: "item_id" }),
  edit_update: mutation((a, ctx) => {
    services.updates.edit(ctx.actor, String(a.id), { body: a.body });
    return findUpdate(ctx, String(a.id));
  }),
  delete_update: mutation((a, ctx) => {
    const u = findUpdate(ctx, String(a.id));
    services.updates.remove(ctx.actor, String(a.id));
    return u;
  }),
  like_update: mutation((a, ctx) => {
    const cur = findUpdate(ctx, String(a.update_id));
    if (!cur.likes.includes(ctx.actor.id)) services.updates.toggleLike(ctx.actor, String(a.update_id));
    return findUpdate(ctx, String(a.update_id));
  }),
  unlike_update: mutation((a, ctx) => {
    const cur = findUpdate(ctx, String(a.update_id));
    if (cur.likes.includes(ctx.actor.id)) services.updates.toggleLike(ctx.actor, String(a.update_id));
    return findUpdate(ctx, String(a.update_id));
  }),
  pin_to_top: mutation((a, ctx) => { services.updates.setPinned(ctx.actor, String(a.id), true); return findUpdate(ctx, String(a.id)); }),
  unpin_from_top: mutation((a, ctx) => { services.updates.setPinned(ctx.actor, String(a.id), false); return findUpdate(ctx, String(a.id)); }),

  create_or_get_tag: mutation((a, ctx) => services.tags.createOrGet(ctx.actor, { name: a.tag_name }), { boardArg: "board_id" }),

  create_notification: mutation((a, ctx) => {
    const target = String(a.target_id);
    let boardId: string | undefined;
    let itemId: string | undefined;
    let updateId: string | undefined;
    if (a.target_type === "Post") {
      const u = services.updates.getDto(ctx.actor, target);
      boardId = u.boardId; itemId = u.itemId; updateId = u.id;
    } else {
      try { const it = services.items.get(ctx.actor, target); boardId = it.boardId; itemId = it.id; } catch (e) {
        if (!(e instanceof NotFoundError)) throw e;
        boardId = services.boards.get(ctx.actor, target).id;
      }
    }
    const n = services.notifications.create(ctx.actor, { userId: String(a.user_id), title: a.text, body: a.text, type: "system", boardId, itemId, updateId });
    return { id: n?.id ?? null, text: a.text };
  }, { itemArg: undefined }),
};

const findUpdate = (ctx: import("../context").GqlContext, id: string) => services.updates.getDto(ctx.actor, id);
