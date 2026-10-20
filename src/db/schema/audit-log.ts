/**
 * Schema for module "audit-log" (owner: admin). Despite the name this file holds every table of the
 * admin module: audit log, custom account roles, invitations, 2FA / sessions, permission settings
 * per workspace / board / column, guest grants and recent searches.
 *
 * Account level settings (security, SSO, retention...) live in accounts.settings (JSON).
 */
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idPk, json } from "./_helpers";
import { accounts, boards, columns, users, workspaces } from "./core";

/* ------------------------------------------------------------------ audit log */

export type AuditCategory = "auth" | "permission" | "content" | "security" | "api" | "export" | "admin";

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: idPk(),
    accountId: text("account_id").notNull(),
    actorId: text("actor_id"),
    /** denormalised so the log stays readable after a user is removed */
    actorName: text("actor_name"),
    actorEmail: text("actor_email"),
    /** dotted event name: user.login, user.role_changed, board.deleted, token.created, mcp.call, ... */
    event: text("event").notNull(),
    category: text("category").$type<AuditCategory>().notNull().default("admin"),
    targetType: text("target_type"),
    targetId: text("target_id"),
    targetName: text("target_name"),
    details: json<Record<string, unknown>>("details").notNull().default({}),
    ip: text("ip"),
    userAgent: text("user_agent"),
    /** ui | api | graphql | mcp | automation | import | system | scim */
    source: text("source"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_account_created_idx").on(t.accountId, t.createdAt),
    index("audit_event_idx").on(t.accountId, t.event),
    index("audit_actor_idx").on(t.actorId),
  ],
);

/* ------------------------------------------------------------------ custom account roles */

export const accountRoles = sqliteTable(
  "account_roles",
  {
    id: idPk(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** the built-in role that users.role is set to while this custom role is assigned */
    baseRole: text("base_role").$type<"admin" | "member" | "viewer" | "guest">().notNull().default("member"),
    /** capability matrix: Action -> allowed (see src/lib/permissions.ts CAPABILITIES) */
    capabilities: json<Record<string, boolean>>("capabilities").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("account_roles_account_idx").on(t.accountId)],
);

export const userRoles = sqliteTable("user_roles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  roleId: text("role_id").notNull().references(() => accountRoles.id, { onDelete: "cascade" }),
});

/* ------------------------------------------------------------------ invitations */

export const invitations = sqliteTable(
  "invitations",
  {
    id: idPk(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    role: text("role").$type<"admin" | "member" | "viewer" | "guest">().notNull().default("member"),
    customRoleId: text("custom_role_id"),
    /** sha256 hex of the token; the token is only in the invite link */
    tokenHash: text("token_hash").notNull().unique(),
    status: text("status").$type<"pending" | "accepted" | "revoked">().notNull().default("pending"),
    invitedBy: text("invited_by"),
    /** guest invitations: access to a workspace and/or board(s) */
    workspaceId: text("workspace_id"),
    boardIds: json<string[]>("board_ids").notNull().default([]),
    boardRole: text("board_role").$type<"editor" | "viewer">().notNull().default("viewer"),
    expiresAt: text("expires_at").notNull(),
    acceptedAt: text("accepted_at"),
    acceptedUserId: text("accepted_user_id"),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_account_idx").on(t.accountId, t.status)],
);

/* ------------------------------------------------------------------ 2FA, sessions, security */

export const userSecurity = sqliteTable("user_security", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  /** AES-256-GCM sealed base32 secret (iv.tag.cipher, hex) */
  totpSecret: text("totp_secret"),
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
  /** sha256 hex of each unused recovery code */
  recoveryCodes: json<string[]>("recovery_codes").notNull().default([]),
  /** last accepted TOTP time step (replay protection) */
  lastTotpStep: integer("last_totp_step"),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: text("locked_until"),
  passwordChangedAt: text("password_changed_at"),
});

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: idPk(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    /** session created through the panic-button recovery code */
    recovery: integer("recovery", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    lastSeenAt: text("last_seen_at").notNull().$defaultFn(() => new Date().toISOString()),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    revokedReason: text("revoked_reason"),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId, t.revokedAt)],
);

/* ------------------------------------------------------------------ permission settings */

/** who may create boards in a workspace ("Who can create boards in this workspace") */
export const workspacePermissions = sqliteTable("workspace_permissions", {
  workspaceId: text("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
  createBoards: text("create_boards").$type<"members" | "owners">().notNull().default("members"),
});

export type BoardPermissionLevel = "edit_all" | "edit_content" | "edit_assigned" | "view_only";

export const boardPermissions = sqliteTable("board_permissions", {
  boardId: text("board_id").primaryKey().references(() => boards.id, { onDelete: "cascade" }),
  /** what non-owner members may do (edit everything / edit content / edit assigned items / view only) */
  level: text("level").$type<BoardPermissionLevel>().notNull().default("edit_all"),
  /** guests only see these views (null = all shared views) */
  guestViewIds: json<string[] | null>("guest_view_ids"),
});

export type ColumnAccessMode = "everyone" | "owners" | "specific" | "assigned";
export interface ColumnAccess { mode: ColumnAccessMode; userIds: string[]; teamIds: string[] }

export const columnPermissions = sqliteTable("column_permissions", {
  columnId: text("column_id").primaryKey().references(() => columns.id, { onDelete: "cascade" }),
  boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  /** who can edit (everyone | owners | specific | assigned) */
  edit: json<ColumnAccess>("edit").notNull().default({ mode: "everyone", userIds: [], teamIds: [] }),
  /** who can see (everyone | owners | specific) */
  view: json<ColumnAccess>("view").notNull().default({ mode: "everyone", userIds: [], teamIds: [] }),
}, (t) => [index("column_permissions_board_idx").on(t.boardId)]);

/** Guests invited to a whole workspace see its boards that are shared with guests. */
export const guestGrants = sqliteTable(
  "guest_grants",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    role: text("role").$type<"editor" | "viewer">().notNull().default("viewer"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.workspaceId] })],
);

/* ------------------------------------------------------------------ search */

export const recentSearches = sqliteTable(
  "recent_searches",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("recent_searches_uq").on(t.userId, t.query)],
);
