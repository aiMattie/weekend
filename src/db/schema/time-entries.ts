/**
 * Schema file for module "time-entries": worklog per item (hours written on a task).
 * Used by the item panel tab "Uren" and, later, the sync to the Urenregistratie board.
 */
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idPk } from "./_helpers";
import { boards, items, users } from "./core";

export const timeEntries = sqliteTable(
  "time_entries",
  {
    id: idPk(),
    itemId: text("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** YYYY-MM-DD */
    date: text("date").notNull(),
    minutes: integer("minutes").notNull(),
    description: text("description"),
    billable: integer("billable", { mode: "boolean" }).notNull().default(true),
    /** manual | timer | jip */
    source: text("source").notNull().default("manual"),
    /** id of the Urenregistratie item once synced (null = not synced yet) */
    syncedItemId: text("synced_item_id"),
    syncedAt: text("synced_at"),
    createdAt: createdAt(),
  },
  (t) => [index("time_entries_item_idx").on(t.itemId, t.date), index("time_entries_user_idx").on(t.userId, t.date)],
);
