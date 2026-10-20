/**
 * Schema for module "docs" (boards-extra): WorkDocs, whiteboards and the inbox extras
 * (bookmarks, notification settings, e-mail outbox). Core `notifications` stays in core.ts.
 */
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idPk, json, updatedAt } from "./_helpers";
import { boards, items, notifications, users, workspaces } from "./core";

/** Tiptap / ProseMirror JSON document. */
export interface DocJson { type: "doc"; content?: Record<string, unknown>[] }

export const docs = sqliteTable(
  "docs",
  {
    id: idPk(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    /** attached to an item when set (doc column) */
    itemId: text("item_id").references(() => items.id, { onDelete: "cascade" }),
    boardId: text("board_id").references(() => boards.id, { onDelete: "cascade" }),
    columnId: text("column_id"),
    title: text("title").notNull().default("Naamloos document"),
    blocks: json<DocJson>("blocks").notNull().default({ type: "doc", content: [] }),
    /** cover: image url or "#rrggbb" */
    cover: text("cover"),
    icon: text("icon"),
    /** main = everyone who can see the workspace (edit), private = owner + doc_members */
    visibility: text("visibility").$type<"main" | "private">().notNull().default("main"),
    state: text("state").$type<"active" | "archived" | "deleted">().notNull().default("active"),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
    position: real("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("docs_ws_idx").on(t.workspaceId), index("docs_item_idx").on(t.itemId)],
);

export const docMembers = sqliteTable(
  "doc_members",
  {
    docId: text("doc_id").notNull().references(() => docs.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<"editor" | "viewer">().notNull().default("editor"),
  },
  (t) => [primaryKey({ columns: [t.docId, t.userId] })],
);

export const docVersions = sqliteTable(
  "doc_versions",
  {
    id: idPk(),
    docId: text("doc_id").notNull().references(() => docs.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    blocks: json<DocJson>("blocks").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("doc_versions_doc_idx").on(t.docId, t.createdAt)],
);

export const docComments = sqliteTable(
  "doc_comments",
  {
    id: idPk(),
    docId: text("doc_id").notNull().references(() => docs.id, { onDelete: "cascade" }),
    /** blockId attribute of the block the comment belongs to (null = whole doc) */
    blockId: text("block_id"),
    parentId: text("parent_id"),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("doc_comments_doc_idx").on(t.docId, t.createdAt)],
);

/* ------------------------------------------------------------------ whiteboards */

export interface WhiteboardElement {
  id: string;
  type: "note" | "rect" | "ellipse" | "diamond" | "text" | "connector" | "pen" | "image";
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
  color?: string;
  /** connector endpoints (element ids) and/or free points */
  from?: string;
  to?: string;
  points?: number[][];
  src?: string;
  z?: number;
}
export interface WhiteboardData { elements: WhiteboardElement[]; view?: { x: number; y: number; zoom: number } }

export const whiteboards = sqliteTable(
  "whiteboards",
  {
    id: idPk(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Nieuw whiteboard"),
    data: json<WhiteboardData>("data").notNull().default({ elements: [] }),
    /** bumped on every save, clients poll it for realtime-ish refresh */
    version: integer("version").notNull().default(1),
    state: text("state").$type<"active" | "deleted">().notNull().default("active"),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("whiteboards_ws_idx").on(t.workspaceId)],
);

/* ------------------------------------------------------------------ inbox extras */

export const notificationBookmarks = sqliteTable(
  "notification_bookmarks",
  {
    notificationId: text("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.notificationId, t.userId] })],
);

export const notificationSettings = sqliteTable(
  "notification_settings",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** mention | reply | assigned | update | system | automation */
    eventType: text("event_type").notNull(),
    inApp: integer("in_app", { mode: "boolean" }).notNull().default(true),
    email: integer("email", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.eventType] })],
);

/** Outgoing e-mail (digest etc.). Without SMTP configured the outbox row is the "sent" mail. */
export const emailOutbox = sqliteTable(
  "email_outbox",
  {
    id: idPk(),
    toUserId: text("to_user_id").references(() => users.id, { onDelete: "set null" }),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    kind: text("kind").notNull().default("digest"),
    sentAt: text("sent_at"),
    createdAt: createdAt(),
  },
  (t) => [index("email_outbox_user_idx").on(t.toUserId, t.kind, t.createdAt), uniqueIndex("email_outbox_id_uq").on(t.id)],
);
