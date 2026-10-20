/**
 * CORE schema (module F / foundation): accounts, users, teams, workspaces, folders, boards,
 * groups, columns, items, updates, assets, activity_log, notifications, views, favorites.
 *
 * Owned by `foundation`. Other modules put their tables in their own schema file and may only
 * REFERENCE these tables. Changing a core table = additive migration, coordinate with the lead.
 */
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idPk, json, updatedAt } from "./_helpers";

/* ------------------------------------------------------------------ account / people */

export const accounts = sqliteTable("accounts", {
  id: idPk(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  settings: json<Record<string, unknown>>("settings").notNull().default({}),
  createdAt: createdAt(),
});

export type AccountRole = "admin" | "member" | "guest" | "viewer";

export const users = sqliteTable(
  "users",
  {
    id: idPk(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    title: text("title"),
    phone: text("phone"),
    photoUrl: text("photo_url"),
    /** account-level role. admin = everything; guest = only boards they are explicitly added to. */
    role: text("role").$type<AccountRole>().notNull().default("member"),
    isAiAgent: integer("is_ai_agent", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    locale: text("locale").notNull().default("nl"),
    timeZone: text("time_zone").notNull().default("Europe/Amsterdam"),
    lastLoginAt: text("last_login_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`), index("users_account_idx").on(t.accountId)],
);

export const teams = sqliteTable("teams", {
  id: idPk(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  pictureUrl: text("picture_url"),
  createdAt: createdAt(),
});

export const teamMembers = sqliteTable(
  "team_members",
  {
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    isOwner: integer("is_owner", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

/* ------------------------------------------------------------------ workspaces / folders */

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: idPk(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** open: every non-guest account user can see/join. closed: members only. */
    kind: text("kind").$type<"open" | "closed">().notNull().default("open"),
    color: text("color"),
    icon: text("icon"),
    position: real("position").notNull().default(0),
    state: text("state").$type<"active" | "archived" | "deleted">().notNull().default("active"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("workspaces_account_idx").on(t.accountId)],
);

export const workspaceMembers = sqliteTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<"owner" | "member" | "viewer">().notNull().default("member"),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const folders = sqliteTable(
  "folders",
  {
    id: idPk(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    parentFolderId: text("parent_folder_id"),
    name: text("name").notNull(),
    color: text("color"),
    position: real("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("folders_ws_idx").on(t.workspaceId)],
);

/* ------------------------------------------------------------------ boards */

export type BoardKind = "board" | "dev_sprints" | "doc" | "dashboard";
export type BoardVisibility = "public" | "private" | "share";
export type BoardState = "active" | "archived" | "deleted";

export const boards = sqliteTable(
  "boards",
  {
    id: idPk(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    kind: text("kind").$type<BoardKind>().notNull().default("board"),
    /** public = main board (all workspace members), private = board_members only, share = + guests. */
    visibility: text("visibility").$type<BoardVisibility>().notNull().default("public"),
    state: text("state").$type<BoardState>().notNull().default("active"),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
    position: real("position").notNull().default(0),
    /** free-form per-board settings (item terminology, template key, subitem settings...) */
    settings: json<Record<string, unknown>>("settings").notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("boards_ws_idx").on(t.workspaceId), index("boards_folder_idx").on(t.folderId)],
);

export const boardMembers = sqliteTable(
  "board_members",
  {
    boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<"owner" | "editor" | "viewer">().notNull().default("editor"),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.userId] })],
);

export const groups = sqliteTable(
  "groups",
  {
    id: idPk(),
    boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    color: text("color").notNull().default("#579bfc"),
    position: real("position").notNull().default(0),
    state: text("state").$type<"active" | "archived" | "deleted">().notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("groups_board_idx").on(t.boardId, t.position)],
);

/**
 * Columns. `id` is the global numeric id; values in items.values are keyed by this `id`.
 * `key` is a short id ("status", "people4") unique per board, used as the
 * column id by GraphQL/MCP/importer; services accept either id or key.
 * `scope` = "item" for the main table, "subitem" for the subitem table of the board.
 */
export const columns = sqliteTable(
  "columns",
  {
    id: idPk(),
    boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    type: text("type").notNull(),
    scope: text("scope").$type<"item" | "subitem">().notNull().default("item"),
    description: text("description"),
    /** type specific (status labels, dropdown labels, number unit, ...) */
    settings: json<Record<string, unknown>>("settings").notNull().default({}),
    position: real("position").notNull().default(0),
    width: integer("width"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("columns_board_key_scope_uq").on(t.boardId, t.scope, t.key),
    index("columns_board_idx").on(t.boardId, t.position),
  ],
);

/* ------------------------------------------------------------------ items */

export type ItemState = "active" | "archived" | "deleted";

export const items = sqliteTable(
  "items",
  {
    id: idPk(),
    boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    /** subitems keep the group of their parent */
    groupId: text("group_id").references(() => groups.id, { onDelete: "set null" }),
    parentItemId: text("parent_item_id"),
    name: text("name").notNull(),
    /** column values keyed by columns.id; shape per column type (see src/server/columns/*) */
    values: json<Record<string, unknown>>("values").notNull().default({}),
    position: real("position").notNull().default(0),
    state: text("state").$type<ItemState>().notNull().default("active"),
    creatorId: text("creator_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("items_board_group_idx").on(t.boardId, t.groupId, t.position),
    index("items_parent_idx").on(t.parentItemId),
    index("items_board_state_idx").on(t.boardId, t.state),
  ],
);

/* ------------------------------------------------------------------ updates / files / log */

export const updates = sqliteTable(
  "updates",
  {
    id: idPk(),
    itemId: text("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** reply when set */
    parentUpdateId: text("parent_update_id"),
    /** sanitised HTML (Tiptap) */
    body: text("body").notNull(),
    bodyText: text("body_text").notNull().default(""),
    mentions: json<string[]>("mentions").notNull().default([]),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    editedAt: text("edited_at"),
  },
  (t) => [index("updates_item_idx").on(t.itemId, t.createdAt)],
);

export const updateLikes = sqliteTable(
  "update_likes",
  {
    updateId: text("update_id").notNull().references(() => updates.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.updateId, t.userId] })],
);

export const assets = sqliteTable(
  "assets",
  {
    id: idPk(),
    boardId: text("board_id").references(() => boards.id, { onDelete: "cascade" }),
    itemId: text("item_id").references(() => items.id, { onDelete: "cascade" }),
    updateId: text("update_id").references(() => updates.id, { onDelete: "set null" }),
    columnId: text("column_id"),
    name: text("name").notNull(),
    mimeType: text("mime_type"),
    size: integer("size").notNull().default(0),
    /** path relative to the uploads dir (data/uploads) */
    path: text("path").notNull(),
    uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("assets_item_idx").on(t.itemId)],
);

export const activityLog = sqliteTable(
  "activity_log",
  {
    id: idPk(),
    boardId: text("board_id").notNull(),
    itemId: text("item_id"),
    groupId: text("group_id"),
    columnId: text("column_id"),
    userId: text("user_id"),
    /** e.g. create_item, change_column_value, move_item, delete_item, create_group, ... */
    event: text("event").notNull(),
    /** event specific payload: { name, columnTitle, from, to, ... } (display strings included) */
    data: json<Record<string, unknown>>("data").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("activity_board_idx").on(t.boardId, t.createdAt), index("activity_item_idx").on(t.itemId, t.createdAt)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: idPk(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    actorId: text("actor_id"),
    /** mention | assigned | update | reply | system | automation ... */
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    boardId: text("board_id"),
    itemId: text("item_id"),
    updateId: text("update_id"),
    link: text("link"),
    read: integer("read", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.read, t.createdAt)],
);

/* ------------------------------------------------------------------ views / favorites */

export const views = sqliteTable(
  "views",
  {
    id: idPk(),
    boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** key in the view registry: table | kanban | calendar | ... */
    type: text("type").notNull().default("table"),
    /** type specific settings (kanban column, calendar date column, hidden columns...) */
    settings: json<Record<string, unknown>>("settings").notNull().default({}),
    /** saved filter rules, see src/lib/view-state.ts */
    filters: json<unknown[]>("filters").notNull().default([]),
    sort: json<unknown[]>("sort").notNull().default([]),
    position: real("position").notNull().default(0),
    /** null = shared with everyone on the board, else personal view of that user */
    ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("views_board_idx").on(t.boardId, t.position)],
);

export const favorites = sqliteTable(
  "favorites",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    position: real("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.boardId] })],
);
