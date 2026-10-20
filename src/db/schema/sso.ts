/**
 * Schema for module "sso" (Google OAuth / OpenID Connect sign-in). One row per linked external
 * identity: (provider, subject) is unique, so a Google account can belong to one user only.
 * Account level SSO settings live in accounts.settings.googleSso (see services/account-settings.ts).
 */
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idPk } from "./_helpers";
import { users } from "./core";

export const userIdentities = sqliteTable(
  "user_identities",
  {
    id: idPk(),
    /** "google" (only provider for now) */
    provider: text("provider").notNull(),
    /** stable provider user id (Google `sub`); never the e-mail address */
    subject: text("subject").notNull(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** e-mail address the provider reported at the last login (informational) */
    email: text("email").notNull(),
    createdAt: createdAt(),
    lastLoginAt: text("last_login_at"),
  },
  (t) => [uniqueIndex("user_identities_subject_uq").on(t.provider, t.subject), index("user_identities_user_idx").on(t.userId)],
);
