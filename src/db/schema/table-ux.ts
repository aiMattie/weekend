/**
 * Schema for module "table-ux": undo/redo log, update read marks ("seen by" / unread) and
 * recently visited boards. Reference core tables only via ./core.
 * Migration: npm run db:generate -- table-ux --name <what_changed>
 */
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idPk, json } from "./_helpers";
import { boards, updates, users } from "./core";

/** One user action that can be undone/redone (per user per board, a stack). */
export const undoEntries = sqliteTable(
  "undo_entries",
  {
    id: idPk(),
    boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** operations (see src/server/services/undo.ts UndoOp) that revert / re-apply the action */
    undoOps: json<unknown[]>("undo_ops").notNull().default([]),
    redoOps: json<unknown[]>("redo_ops").notNull().default([]),
    /** true once undone (then it is on the redo stack) */
    undone: integer("undone", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("undo_board_user_idx").on(t.boardId, t.userId, t.createdAt)],
);

/** "Seen by": a user has viewed an update in the item panel. */
export const updateReads = sqliteTable(
  "update_reads",
  {
    updateId: text("update_id").notNull().references(() => updates.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    seenAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.updateId, t.userId] })],
);

export const recentBoards = sqliteTable(
  "recent_boards",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    visitedAt: text("visited_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.boardId] }), index("recent_boards_user_idx").on(t.userId, t.visitedAt)],
);
