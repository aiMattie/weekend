/** Resolvers for the object types (User, Team, Workspace, Folder, Board, Group, Column, Item, Update, Asset ...). */
import { NotFoundError } from "@/lib/errors";
import type { ColumnRow, GroupRow, ItemRow, BoardRow } from "@/server/services/_shared";
import * as services from "@/server/services";
import { assertBoardInScope } from "@/server/platform/scope";
import { buildColumnValues, settingsStr } from "../column-values";
import { boardColumns, fmtCtx, memo, userById, type GqlContext } from "../context";
import { decodeCursor, pageItems, type ItemsQueryParams } from "../items-query";
import { guard } from "../errors";

type Ctx = GqlContext;

const safe = <T>(fn: () => T): T | null => {
  try { return fn(); } catch (e) { if (e instanceof NotFoundError) return null; throw e; }
};

const publicUrl = (path: string) => `${process.env.PUBLIC_URL?.replace(/\/$/, "") ?? ""}${path}`;

function allUsers(ctx: Ctx) {
  return memo(ctx, "users:all", () => services.users.list(ctx.actor, { includeInactive: true }));
}

type U = ReturnType<typeof services.users.list>[number];
type TeamRow = ReturnType<typeof services.users.listTeams>[number];

export const User = {
  id: (u: U) => u.id,
  name: (u: U) => u.name,
  email: (u: U) => u.email,
  title: (u: U) => u.title,
  phone: (u: U) => u.phone,
  mobile_phone: (u: U) => u.phone,
  photo_original: (u: U) => u.photoUrl,
  photo_thumb: (u: U) => u.photoUrl,
  photo_thumb_small: (u: U) => u.photoUrl,
  photo_small: (u: U) => u.photoUrl,
  time_zone_identifier: (u: U) => u.timeZone,
  current_language: (u: U) => u.locale,
  created_at: (u: U) => u.createdAt,
  join_date: (u: U) => u.createdAt.slice(0, 10),
  last_activity: (u: U) => u.lastLoginAt,
  enabled: (u: U) => u.isActive,
  is_admin: (u: U) => u.role === "admin",
  is_guest: (u: U) => u.role === "guest",
  is_pending: () => false,
  is_view_only: (u: U) => u.role === "viewer",
  is_verified: () => true,
  url: (u: U) => publicUrl(`/admin/users/${u.id}`),
  teams: (u: U, _a: unknown, ctx: Ctx) => services.users.listTeams(ctx.actor).filter((t) => t.memberIds.includes(u.id)),
  account: (_u: U, _a: unknown, ctx: Ctx) => ({ id: ctx.actor.accountId }),
};

export const Account = {
  id: (a: { id: string }) => a.id,
  name: (a: { id: string }) => (a as { name?: string }).name ?? "Weekend",
  slug: (a: { id: string }) => (a as { slug?: string }).slug ?? a.id,
  plan: () => ({ tier: "enterprise", max_users: 1000 }),
  tier: () => "enterprise",
  show_timeline_weekends: () => true,
  users: (_a: unknown, _x: unknown, ctx: Ctx) => allUsers(ctx),
};

export const Team = {
  id: (t: TeamRow) => t.id,
  name: (t: TeamRow) => t.name,
  picture_url: (t: TeamRow) => t.pictureUrl,
  is_guest: () => false,
  users: (t: TeamRow, _a: unknown, ctx: Ctx) => allUsers(ctx).filter((u) => t.memberIds.includes(u.id)),
  owners: () => [],
};

type W = ReturnType<typeof services.workspaces.list>[number];
export const Workspace = {
  id: (w: W) => w.id,
  name: (w: W) => w.name,
  kind: (w: W) => w.kind,
  description: (w: W) => w.description,
  state: (w: W) => w.state,
  created_at: (w: W) => w.createdAt,
  is_default_workspace: () => false,
  account_product: () => ({ id: "1", kind: "core" }),
  settings: (w: W) => ({ icon: { color: w.color } }),
  users_subscribers: (w: W, _a: unknown, ctx: Ctx) => {
    const ids = new Set(services.workspaces.listMembers(ctx.actor, w.id).map((m) => m.userId));
    return allUsers(ctx).filter((u) => ids.has(u.id));
  },
  owners_subscribers: (w: W, _a: unknown, ctx: Ctx) => {
    const ids = new Set(services.workspaces.listMembers(ctx.actor, w.id).filter((m) => m.role === "owner").map((m) => m.userId));
    return allUsers(ctx).filter((u) => ids.has(u.id));
  },
  teams_subscribers: () => [],
};

type F = ReturnType<typeof services.folders.list>[number];
export const Folder = {
  id: (f: F) => f.id,
  name: (f: F) => f.name,
  color: (f: F) => f.color,
  created_at: (f: F) => f.createdAt,
  owner_id: () => null,
  parent: (f: F, _a: unknown, ctx: Ctx) => (f.parentFolderId ? safe(() => services.folders.get(ctx.actor, f.parentFolderId!)) : null),
  sub_folders: (f: F, _a: unknown, ctx: Ctx) => services.folders.list(ctx.actor, f.workspaceId).filter((x) => x.parentFolderId === f.id),
  children: (f: F, _a: unknown, ctx: Ctx) => services.boards.list(ctx.actor, { workspaceId: f.workspaceId }).filter((b) => b.folderId === f.id),
  workspace: (f: F, _a: unknown, ctx: Ctx) => safe(() => services.workspaces.get(ctx.actor, f.workspaceId)),
};

const KIND_BY_VISIBILITY = { public: "public", private: "private", share: "share" } as const;
const boardUrl = (b: BoardRow) => publicUrl(`/boards/${b.id}`);

function clampPage(limit: number | null | undefined, page: number | null | undefined, def = 25) {
  const l = Math.max(1, Math.min(limit ?? def, 500));
  return { limit: l, offset: (Math.max(1, page ?? 1) - 1) * l };
}

export const Board = {
  id: (b: BoardRow) => b.id,
  name: (b: BoardRow) => b.name,
  description: (b: BoardRow) => b.description,
  state: (b: BoardRow) => b.state,
  board_kind: (b: BoardRow) => KIND_BY_VISIBILITY[b.visibility],
  board_folder_id: (b: BoardRow) => b.folderId,
  workspace_id: (b: BoardRow) => b.workspaceId,
  workspace: (b: BoardRow, _a: unknown, ctx: Ctx) => safe(() => services.workspaces.get(ctx.actor, b.workspaceId)),
  type: (b: BoardRow) => (b.kind === "doc" ? "document" : b.kind === "dev_sprints" ? "board" : b.kind),
  permissions: () => "everyone",
  url: boardUrl,
  creator: (b: BoardRow, _a: unknown, ctx: Ctx) => userById(ctx, b.ownerId),
  owner: (b: BoardRow, _a: unknown, ctx: Ctx) => userById(ctx, b.ownerId) ?? userById(ctx, ctx.actor.id),
  owners: (b: BoardRow, _a: unknown, ctx: Ctx) => {
    const ids = services.boards.listMembers(ctx.actor, b.id).filter((m) => m.role === "owner").map((m) => m.userId);
    return ids.map((id) => userById(ctx, id)).filter(Boolean);
  },
  subscribers: (b: BoardRow, _a: unknown, ctx: Ctx) => services.boards.listMembers(ctx.actor, b.id).map((m) => userById(ctx, m.userId)).filter(Boolean),
  items_count: (b: BoardRow, _a: unknown, ctx: Ctx) => services.items.list(ctx.actor, { boardId: b.id, limit: 5000 }).length,
  updated_at: (b: BoardRow) => b.updatedAt,
  created_at: (b: BoardRow) => b.createdAt,
  top_group: (b: BoardRow, _a: unknown, ctx: Ctx) => services.groups.list(ctx.actor, b.id)[0],
  columns: (b: BoardRow, a: { ids?: string[] | null; types?: string[] | null }, ctx: Ctx) => {
    let cols = boardColumns(ctx, b.id).filter((c) => c.scope === "item" && !c.archived);
    if (a.ids?.length) cols = cols.filter((c) => a.ids!.includes(c.key) || a.ids!.includes(c.id));
    if (a.types?.length) cols = cols.filter((c) => a.types!.includes(c.type));
    return cols;
  },
  groups: (b: BoardRow, a: { ids?: string[] | null }, ctx: Ctx) => {
    const gs = services.groups.list(ctx.actor, b.id);
    return a.ids?.length ? gs.filter((g) => a.ids!.includes(g.id)) : gs;
  },
  items_page: guard((b: BoardRow, a: { limit?: number | null; cursor?: string | null; query_params?: ItemsQueryParams | null }, ctx: Ctx) => {
    assertBoardInScope(ctx.actor, b.id);
    if (a.cursor) return pageItems(ctx.actor, decodeCursor(a.cursor), a.limit ?? 25);
    return pageItems(ctx.actor, { boardId: b.id, offset: 0, params: a.query_params ?? null }, a.limit ?? 25);
  }),
  tags: () => [],
  views: (b: BoardRow, a: { ids?: string[] | null; type?: string | null }, ctx: Ctx) =>
    services.views.list(ctx.actor, b.id).filter((v) => (!a.ids?.length || a.ids.includes(v.id)) && (!a.type || v.type === a.type)),
  updates: (b: BoardRow, a: { limit?: number | null; page?: number | null }, ctx: Ctx) => {
    const { limit, offset } = clampPage(a.limit, a.page);
    return services.items.list(ctx.actor, { boardId: b.id, limit: 5000 }).flatMap((i) => services.updates.list(ctx.actor, i.id)).sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(offset, offset + limit);
  },
  activity_logs: (b: BoardRow, a: { user_ids?: string[] | null; column_ids?: string[] | null; group_ids?: string[] | null; item_ids?: string[] | null; from?: string | null; to?: string | null; limit?: number | null; page?: number | null }, ctx: Ctx) => {
    const { limit, offset } = clampPage(a.limit, a.page, 25);
    const cols = boardColumns(ctx, b.id);
    const colIds = a.column_ids?.map((r) => cols.find((c) => c.key === r || c.id === r)?.id ?? r);
    return services.activity.activityForBoard(ctx.actor, b.id, 5000)
      .filter((r) => (!a.user_ids?.length || (r.userId && a.user_ids.includes(r.userId))) && (!colIds?.length || (r.columnId && colIds.includes(r.columnId)))
        && (!a.group_ids?.length || (r.groupId && a.group_ids.includes(r.groupId))) && (!a.item_ids?.length || (r.itemId && a.item_ids.includes(r.itemId)))
        && (!a.from || r.createdAt >= a.from) && (!a.to || r.createdAt <= a.to))
      .slice(offset, offset + limit);
  },
};

export const ActivityLogType = {
  id: (r: { id: string }) => r.id,
  account_id: (_r: unknown, _a: unknown, ctx: Ctx) => ctx.actor.accountId,
  // returned as a 17 digit timestamp (10^-7 s)
  created_at: (r: { createdAt: string }) => String(Date.parse(r.createdAt) * 10_000),
  data: (r: { data: Record<string, unknown>; itemId: string | null; groupId: string | null; columnId: string | null; boardId: string }) =>
    JSON.stringify({ board_id: Number(r.boardId), pulse_id: r.itemId ? Number(r.itemId) : undefined, group_id: r.groupId, column_id: r.columnId, ...r.data }),
  entity: (r: { itemId: string | null; columnId: string | null; groupId: string | null; event: string }) =>
    r.event.includes("update") ? "update" : r.columnId && !r.itemId ? "board" : r.groupId && !r.itemId ? "board" : r.itemId ? "pulse" : "board",
  event: (r: { event: string }) => r.event,
  user_id: (r: { userId: string | null }) => r.userId ?? "",
};

export const BoardView = {
  id: (v: { id: string }) => v.id,
  name: (v: { name: string }) => v.name,
  type: (v: { type: string }) => v.type,
  settings_str: (v: { settings: unknown }) => JSON.stringify(v.settings ?? {}),
  view_specific_data_str: () => "{}",
  filter: (v: { filters: unknown }) => v.filters,
};

export const Group = {
  id: (g: GroupRow) => g.id,
  title: (g: GroupRow) => g.title,
  color: (g: GroupRow) => g.color,
  position: (g: GroupRow) => String(g.position),
  archived: (g: GroupRow) => g.state === "archived",
  deleted: (g: GroupRow) => g.state === "deleted",
  items_page: guard((g: GroupRow, a: { limit?: number | null; cursor?: string | null; query_params?: ItemsQueryParams | null }, ctx: Ctx) => {
    assertBoardInScope(ctx.actor, g.boardId);
    if (a.cursor) return pageItems(ctx.actor, decodeCursor(a.cursor), a.limit ?? 25);
    return pageItems(ctx.actor, { boardId: g.boardId, offset: 0, params: a.query_params ?? null, groupId: g.id }, a.limit ?? 25);
  }),
};

export const Column = {
  id: (c: ColumnRow) => c.key,
  title: (c: ColumnRow) => c.title,
  type: (c: ColumnRow) => c.type,
  description: (c: ColumnRow) => c.description,
  archived: (c: ColumnRow) => c.archived,
  settings_str: settingsStr,
  settings: (c: ColumnRow) => c.settings,
  width: (c: ColumnRow) => c.width,
};

export const ItemsResponse = {
  cursor: (p: { cursor: string | null }) => p.cursor,
  items: (p: { items: ItemRow[] }) => p.items,
};

export const Item = {
  id: (i: ItemRow) => i.id,
  name: (i: ItemRow) => i.name,
  state: (i: ItemRow) => i.state,
  url: (i: ItemRow) => publicUrl(`/boards/${i.boardId}?item=${i.id}`),
  relative_link: (i: ItemRow) => `/boards/${i.boardId}?item=${i.id}`,
  email: () => null,
  created_at: (i: ItemRow) => i.createdAt,
  updated_at: (i: ItemRow) => i.updatedAt,
  creator_id: (i: ItemRow) => i.creatorId,
  creator: (i: ItemRow, _a: unknown, ctx: Ctx) => userById(ctx, i.creatorId),
  board: (i: ItemRow, _a: unknown, ctx: Ctx) => memo(ctx, `board:${i.boardId}`, () => services.boards.get(ctx.actor, i.boardId)),
  group: (i: ItemRow, _a: unknown, ctx: Ctx) => (i.groupId ? memo(ctx, `group:${i.groupId}`, () => safe(() => services.groups.get(ctx.actor, i.groupId!))) : null),
  parent_item: (i: ItemRow, _a: unknown, ctx: Ctx) => (i.parentItemId ? safe(() => services.items.get(ctx.actor, i.parentItemId!)) : null),
  subitems: (i: ItemRow, _a: unknown, ctx: Ctx) => (i.parentItemId ? [] : services.items.listSubitems(ctx.actor, i.id)),
  column_values: (i: ItemRow, a: { ids?: string[] | null; types?: string[] | null }, ctx: Ctx) =>
    buildColumnValues(i, boardColumns(ctx, i.boardId), fmtCtx(ctx), a),
  assets: (i: ItemRow, a: { column_ids?: string[] | null }, ctx: Ctx) => {
    const cols = boardColumns(ctx, i.boardId);
    const want = a.column_ids?.length ? cols.filter((c) => a.column_ids!.includes(c.key) || a.column_ids!.includes(c.id)).map((c) => c.id) : null;
    return services.assets.list(ctx.actor, { itemId: i.id }).filter((x) => !want || (x.columnId && want.includes(x.columnId)));
  },
  updates: (i: ItemRow, a: { limit?: number | null; page?: number | null; ids?: string[] | null }, ctx: Ctx) => {
    const { limit, offset } = clampPage(a.limit, a.page);
    const all = services.updates.list(ctx.actor, i.id);
    return (a.ids?.length ? all.filter((u) => a.ids!.includes(u.id)) : all).slice(offset, offset + limit);
  },
  subscribers: (i: ItemRow, _a: unknown, ctx: Ctx) => {
    const ids = new Set<string>();
    for (const c of boardColumns(ctx, i.boardId)) {
      if (c.type !== "people") continue;
      for (const p of (i.values[c.id] as { personsAndTeams?: { id: string; kind: string }[] } | undefined)?.personsAndTeams ?? []) if (p.kind === "person") ids.add(p.id);
    }
    return [...ids].map((id) => userById(ctx, id)).filter(Boolean);
  },
};

type Up = ReturnType<typeof services.updates.list>[number];
const textOf = (u: { bodyText: string }) => u.bodyText;
export const Update = {
  id: (u: Up) => u.id,
  body: (u: Up) => u.body,
  text_body: textOf,
  created_at: (u: Up) => u.createdAt,
  updated_at: (u: Up) => u.editedAt ?? u.createdAt,
  edited_at: (u: Up) => u.editedAt,
  creator_id: (u: Up) => u.userId,
  creator: (u: Up, _a: unknown, ctx: Ctx) => userById(ctx, u.userId),
  item_id: (u: Up) => u.itemId,
  item: (u: Up, _a: unknown, ctx: Ctx) => safe(() => services.items.get(ctx.actor, u.itemId)),
  replies: (u: Up) => u.replies ?? [],
  likes: (u: Up) => (u.likes ?? []).map((uid) => ({ id: `${u.id}-${uid}`, creator_id: uid, reaction_type: "LIKE" })),
  assets: () => [],
  pinned_to_top: (u: Up) => (u.pinned ? [{ item_id: u.itemId }] : []),
};
export const Reply = { ...Update, replies: undefined };
export const Like = {
  id: (l: { id: string }) => l.id,
  creator_id: (l: { creator_id: string }) => l.creator_id,
  creator: (l: { creator_id: string }, _a: unknown, ctx: Ctx) => userById(ctx, l.creator_id),
  reaction_type: (l: { reaction_type: string }) => l.reaction_type,
};

export const Asset = {
  id: (a: { id: string }) => a.id,
  name: (a: { name: string }) => a.name,
  url: (a: { id: string }) => publicUrl(`/api/v1/assets/${a.id}`),
  public_url: (a: { id: string }) => publicUrl(`/api/v1/assets/${a.id}`),
  file_extension: (a: { name: string }) => (a.name.includes(".") ? `.${a.name.split(".").pop()}` : ""),
  file_size: (a: { size: number }) => a.size ?? 0,
  created_at: (a: { createdAt: string }) => a.createdAt,
  uploaded_by: (a: { uploadedBy: string | null }, _x: unknown, ctx: Ctx) => userById(ctx, a.uploadedBy),
  original_geometry: () => null,
};

export const Webhook = {
  id: (w: { id: string }) => w.id,
  board_id: (w: { boardId: string | null }) => w.boardId,
  event: (w: { event?: string; events?: string[] }) => w.event ?? w.events?.[0] ?? "*",
  config: (w: { config?: unknown }) => (w.config ? JSON.stringify(w.config) : null),
};

export const Document = {
  id: (d: { id: string }) => d.id,
  object_id: (d: { id: string }) => d.id,
  name: (d: { title: string }) => d.title,
  doc_kind: (d: { visibility: string }) => (d.visibility === "private" ? "private" : "public"),
  workspace_id: (d: { workspaceId: string }) => d.workspaceId,
  doc_folder_id: () => null,
  created_by: (d: { ownerId: string | null }, _a: unknown, ctx: Ctx) => userById(ctx, d.ownerId),
  created_at: (d: { createdAt: string }) => d.createdAt,
  url: (d: { id: string }) => publicUrl(`/docs/${d.id}`),
  relative_url: (d: { id: string }) => `/docs/${d.id}`,
  settings: () => ({}),
};

