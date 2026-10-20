/** Mutations on boards, groups, columns, workspaces, folders, webhooks, docs, files, users. */
import { GraphQLError } from "graphql";
import { ValidationError } from "@/lib/errors";
import * as services from "@/server/services";
import * as webhooksService from "@/server/services/webhooks";
import { assertWorkspaceInScope } from "@/server/platform/scope";
import { labelDefaultsToSettings, parseJsonInput, resolveColor } from "../column-values";
import { mutation, resolveGroup, type Args, type Ctx } from "./mutation-helpers";

const position = (method: string | null | undefined, rel: string | null | undefined) =>
  rel ? (method === "before_at" ? { beforeId: String(rel) } : { afterId: String(rel) }) : {};

function defaultWorkspace(ctx: Ctx): string {
  const ws = services.workspaces.list(ctx.actor).filter((w) => !ctx.actor.token?.workspaceIds || ctx.actor.token.workspaceIds.includes(w.id));
  if (!ws.length) throw new ValidationError("No workspace available, pass workspace_id");
  return ws[0].id;
}

function createColumn(a: Args, ctx: Ctx, type: string, settings?: Record<string, unknown>) {
  let defaults = a.defaults ? (parseJsonInput(a.defaults, "defaults") as Record<string, unknown>) : {};
  if (type === "status" || type === "dropdown") defaults = labelDefaultsToSettings(type, defaults);
  return services.columns.create(ctx.actor, String(a.board_id), {
    title: a.title, type, description: a.description ?? null, key: a.id ?? undefined, settings: settings ?? defaults,
    ...(a.after_column_id ? { afterId: services.columns.get(ctx.actor, String(a.after_column_id)).id } : {}),
  });
}

const colByRef = (a: Args, ctx: Ctx, ref: string) => {
  const cols = services.columns.list(ctx.actor, String(a.board_id));
  const c = cols.find((x) => x.key === ref || x.id === ref);
  if (!c) throw new GraphQLError(`Column "${ref}" not found`, { extensions: { code: "InvalidColumnIdException" } });
  return c;
};

const memberUsers = (ctx: Ctx, ids: string[]) => ids.map((id) => services.users.get(ctx.actor, id));

export const structureMutations = {
  create_board: mutation((a, ctx) => {
    const workspaceId = a.workspace_id ? String(a.workspace_id) : defaultWorkspace(ctx);
    assertWorkspaceInScope(ctx.actor, workspaceId);
    const board = services.boards.create(ctx.actor, {
      workspaceId, folderId: a.folder_id ?? null, name: a.board_name, description: a.description ?? null, visibility: a.board_kind, emptyColumns: !!a.empty,
    });
    for (const uid of a.board_owner_ids ?? []) services.boards.setMember(ctx.actor, board.id, String(uid), "owner");
    for (const uid of a.board_subscriber_ids ?? []) services.boards.setMember(ctx.actor, board.id, String(uid), "editor");
    return board;
  }, { hint: "CreateBoardException" }),
  duplicate_board: mutation((a, ctx) => {
    const src = services.boards.get(ctx.actor, String(a.board_id));
    const board = services.boards.duplicate(ctx.actor, src.id, {
      name: a.board_name ?? undefined,
      withItems: a.duplicate_type !== "duplicate_board_with_structure",
      withUpdates: a.duplicate_type === "duplicate_board_with_pulses_and_updates",
    });
    let out = board;
    if (a.workspace_id || a.folder_id) out = services.boards.move(ctx.actor, board.id, { workspaceId: a.workspace_id ?? undefined, folderId: a.folder_id ?? null });
    return { board: out, is_async: false };
  }, { boardArg: "board_id" }),
  update_board: mutation((a, ctx) => {
    const attr = a.board_attribute === "name" ? "name" : a.board_attribute === "description" ? "description" : null;
    if (!attr) throw new ValidationError("Only name and description can be updated");
    services.boards.update(ctx.actor, String(a.board_id), { [attr]: a.new_value });
    return { success: true, undo_data: null };
  }, { boardArg: "board_id" }),
  archive_board: mutation((a, ctx) => services.boards.archive(ctx.actor, String(a.board_id)), { boardArg: "board_id" }),
  delete_board: mutation((a, ctx) => {
    const b = services.boards.get(ctx.actor, String(a.board_id));
    services.boards.remove(ctx.actor, b.id);
    return { ...b, state: "deleted" };
  }, { boardArg: "board_id" }),
  update_board_hierarchy: mutation((a, ctx) => {
    const attrs = a.attributes ?? {};
    services.boards.move(ctx.actor, String(a.board_id), { workspaceId: attrs.workspace_id ?? undefined, folderId: attrs.folder_id ?? undefined });
    return { success: true };
  }, { boardArg: "board_id" }),
  add_users_to_board: mutation((a, ctx) => {
    for (const uid of a.user_ids) services.boards.setMember(ctx.actor, String(a.board_id), String(uid), a.kind === "owner" ? "owner" : "editor");
    return memberUsers(ctx, a.user_ids.map(String));
  }, { boardArg: "board_id" }),
  delete_subscribers_from_board: mutation((a, ctx) => {
    for (const uid of a.user_ids) services.boards.removeMember(ctx.actor, String(a.board_id), String(uid));
    return memberUsers(ctx, a.user_ids.map(String));
  }, { boardArg: "board_id" }),

  create_group: mutation((a, ctx) => {
    const rel = a.relative_to ? resolveGroup(ctx.actor, String(a.board_id), a.relative_to)?.id : null;
    return services.groups.create(ctx.actor, String(a.board_id), {
      title: a.group_name, color: a.group_color ? resolveColor(a.group_color) : undefined, ...position(a.position_relative_method, rel),
    });
  }, { boardArg: "board_id" }),
  update_group: mutation((a, ctx) => {
    const g = resolveGroup(ctx.actor, String(a.board_id), a.group_id)!;
    const patch = a.group_attribute === "title" ? { title: a.new_value } : a.group_attribute === "color" ? { color: resolveColor(a.new_value) } : null;
    if (!patch) throw new ValidationError("group_attribute must be title or color");
    return services.groups.update(ctx.actor, g.id, patch);
  }, { boardArg: "board_id" }),
  duplicate_group: mutation((a, ctx) => {
    const g = resolveGroup(ctx.actor, String(a.board_id), a.group_id)!;
    return services.groups.duplicate(ctx.actor, g.id, { withItems: true, title: a.group_title ?? undefined });
  }, { boardArg: "board_id" }),
  archive_group: mutation((a, ctx) => services.groups.archive(ctx.actor, resolveGroup(ctx.actor, String(a.board_id), a.group_id)!.id), { boardArg: "board_id" }),
  delete_group: mutation((a, ctx) => {
    const g = resolveGroup(ctx.actor, String(a.board_id), a.group_id)!;
    services.groups.remove(ctx.actor, g.id);
    return { ...g, state: "deleted" };
  }, { boardArg: "board_id" }),

  create_column: mutation((a, ctx) => createColumn(a, ctx, a.column_type), { boardArg: "board_id" }),
  create_status_column: mutation((a, ctx) => createColumn(a, ctx, "status"), { boardArg: "board_id" }),
  create_dropdown_column: mutation((a, ctx) => createColumn(a, ctx, "dropdown"), { boardArg: "board_id" }),
  update_status_column: mutation((a, ctx) => updateLabelColumn(a, ctx, "status"), { boardArg: "board_id" }),
  update_dropdown_column: mutation((a, ctx) => updateLabelColumn(a, ctx, "dropdown"), { boardArg: "board_id" }),
  change_column_title: mutation((a, ctx) => services.columns.update(ctx.actor, colByRef(a, ctx, a.column_id).id, { title: a.title }), { boardArg: "board_id" }),
  change_column_metadata: mutation((a, ctx) => {
    const prop = a.column_property === "description" ? "description" : "title";
    return services.columns.update(ctx.actor, colByRef(a, ctx, a.column_id).id, { [prop]: a.value });
  }, { boardArg: "board_id" }),
  delete_column: mutation((a, ctx) => {
    const c = colByRef(a, ctx, a.column_id);
    services.columns.remove(ctx.actor, c.id);
    return c;
  }, { boardArg: "board_id" }),

  create_workspace: mutation((a, ctx) => services.workspaces.create(ctx.actor, { name: a.name, kind: a.kind, description: a.description ?? null })),
  update_workspace: mutation((a, ctx) => {
    assertWorkspaceInScope(ctx.actor, String(a.id));
    return services.workspaces.update(ctx.actor, String(a.id), a.attributes ?? {});
  }),
  delete_workspace: mutation((a, ctx) => {
    assertWorkspaceInScope(ctx.actor, String(a.workspace_id));
    const w = services.workspaces.get(ctx.actor, String(a.workspace_id));
    services.workspaces.remove(ctx.actor, w.id);
    return { ...w, state: "deleted" };
  }),
  add_users_to_workspace: mutation((a, ctx) => {
    assertWorkspaceInScope(ctx.actor, String(a.workspace_id));
    for (const uid of a.user_ids) services.workspaces.setMember(ctx.actor, String(a.workspace_id), String(uid), a.kind === "owner" ? "owner" : "member");
    return memberUsers(ctx, a.user_ids.map(String));
  }),
  delete_users_from_workspace: mutation((a, ctx) => {
    assertWorkspaceInScope(ctx.actor, String(a.workspace_id));
    for (const uid of a.user_ids) services.workspaces.removeMember(ctx.actor, String(a.workspace_id), String(uid));
    return memberUsers(ctx, a.user_ids.map(String));
  }),
  create_folder: mutation((a, ctx) => {
    const workspaceId = a.workspace_id ? String(a.workspace_id) : defaultWorkspace(ctx);
    assertWorkspaceInScope(ctx.actor, workspaceId);
    return services.folders.create(ctx.actor, { workspaceId, name: a.name, color: resolveColorOrNull(a.color), parentFolderId: a.parent_folder_id ?? null });
  }),
  update_folder: mutation((a, ctx) => {
    const f = services.folders.get(ctx.actor, String(a.folder_id));
    assertWorkspaceInScope(ctx.actor, f.workspaceId);
    return services.folders.update(ctx.actor, f.id, { ...(a.name ? { name: a.name } : {}), ...(a.color ? { color: resolveColor(a.color) } : {}) });
  }),
  delete_folder: mutation((a, ctx) => {
    const f = services.folders.get(ctx.actor, String(a.folder_id));
    assertWorkspaceInScope(ctx.actor, f.workspaceId);
    services.folders.remove(ctx.actor, f.id);
    return f;
  }),

  create_webhook: mutation((a, ctx) => {
    const config = a.config ? parseJsonInput(a.config, "config") : {};
    return webhooksService.create(ctx.actor, { boardId: String(a.board_id), url: a.url, event: a.event, config });
  }, { boardArg: "board_id" }),
  delete_webhook: mutation((a, ctx) => {
    const w = webhooksService.get(ctx.actor, String(a.id));
    if (w.boardId) assertWorkspaceInScope(ctx.actor, services.boards.get(ctx.actor, w.boardId).workspaceId);
    webhooksService.remove(ctx.actor, w.id);
    return w;
  }),

  create_doc: mutation((a, ctx) => {
    const loc = a.location ?? {};
    if (loc.workspace) {
      assertWorkspaceInScope(ctx.actor, String(loc.workspace.workspace_id));
      return services.docs.create(ctx.actor, { workspaceId: String(loc.workspace.workspace_id), title: loc.workspace.name, visibility: loc.workspace.kind === "private" ? "private" : "main" });
    }
    if (loc.board) {
      const it = services.items.get(ctx.actor, String(loc.board.item_id));
      assertWorkspaceInScope(ctx.actor, services.boards.get(ctx.actor, it.boardId).workspaceId);
      return services.docs.create(ctx.actor, { itemId: it.id, columnId: loc.board.column_id });
    }
    throw new ValidationError("location.workspace or location.board is required");
  }),
};

function resolveColorOrNull(c: unknown): string | null {
  return typeof c === "string" && c ? resolveColor(c) : null;
}

function updateLabelColumn(a: Args, ctx: Ctx, type: "status" | "dropdown") {
  const col = colByRef(a, ctx, a.id);
  if (col.type !== type) throw new ValidationError(`Column "${a.id}" is not a ${type} column`);
  const settings = a.defaults ? labelDefaultsToSettings(type, parseJsonInput(a.defaults, "defaults")) : undefined;
  return services.columns.update(ctx.actor, col.id, { ...(a.title ? { title: a.title } : {}), ...(a.description !== undefined ? { description: a.description } : {}), ...(settings && Object.keys(settings).length ? { settings } : {}) });
}
