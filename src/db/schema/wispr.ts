/**
 * Schema for module "wispr" (Wispr Flow meetings). The app is an MCP client of the Wispr Flow remote MCP server
 * (https://api.wisprflow.ai/connect/mcp, OAuth 2.1 + PKCE, dynamic client registration).
 *
 *  - wispr_connections: one row per user. Tokens and the PKCE verifier are sealed (AES-GCM, see admin/lib/seal).
 *  - wispr_meetings: the user's meetings as last listed from Wispr (metadata only, no transcript) plus what the user
 *    decided: `personal` (hidden, never imported) or `saved` (imported as a Notetaker meeting into a workspace,
 *    optionally linked to a board item such as a project or klant).
 */
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idPk, json, updatedAt } from "./_helpers";
import { accounts, boards, items, users, workspaces } from "./core";
import { meetings } from "./ai";

export const wisprConnections = sqliteTable("wispr_connections", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  /** client id from dynamic client registration (public client, PKCE) */
  clientId: text("client_id"),
  redirectUri: text("redirect_uri"),
  /** sealed access / refresh token; null while the authorization is pending */
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: text("expires_at"),
  /** pending authorization: state + sealed PKCE verifier (cleared after the callback) */
  pendingState: text("pending_state"),
  pendingVerifier: text("pending_verifier"),
  pendingAt: text("pending_at"),
  /** Wispr account name/email from get_account_info (informational) */
  label: text("label"),
  connectedAt: text("connected_at"),
  lastSyncAt: text("last_sync_at"),
  lastError: text("last_error"),
  updatedAt: updatedAt(),
});

export type WisprMeetingStatus = "new" | "personal" | "saved";

export const wisprMeetings = sqliteTable(
  "wispr_meetings",
  {
    id: idPk(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    /** Wispr meeting id */
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    startedAt: text("started_at"),
    attendees: json<string[]>("attendees").notNull().default([]),
    /** short preview of the Wispr summary (list view) */
    preview: text("preview").notNull().default(""),
    calendarId: text("calendar_id"),
    status: text("status").$type<WisprMeetingStatus>().notNull().default("new"),
    /** where it was saved */
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    boardId: text("board_id").references(() => boards.id, { onDelete: "set null" }),
    itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
    meetingId: text("meeting_id").references(() => meetings.id, { onDelete: "set null" }),
    docId: text("doc_id"),
    savedAt: text("saved_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("wispr_meetings_ext_uq").on(t.userId, t.externalId), index("wispr_meetings_user_idx").on(t.userId, t.startedAt)],
);
