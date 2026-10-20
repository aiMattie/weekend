/**
 * Schema of module "columns": account-level tags for the `tags` column type.
 * (File bytes are tracked in the core `assets` table.)
 */
import { sql } from "drizzle-orm";
import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idPk } from "./_helpers";
import { accounts } from "./core";

export const tags = sqliteTable(
  "tags",
  {
    id: idPk(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#579bfc"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tags_account_name_uq").on(t.accountId, sql`lower(${t.name})`)],
);
