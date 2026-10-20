/**
 * Schema for module "forms" (boards-extra): WorkForms. Every form has a backing board; each
 * submission creates an item (plus an update with the answers).
 */
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idPk, json, updatedAt } from "./_helpers";
import { boards, items, users, workspaces } from "./core";

export interface FormSettings {
  description?: string;
  coverUrl?: string | null;
  logoUrl?: string | null;
  /** theme colours */
  primaryColor?: string;
  backgroundColor?: string;
  submitLabel?: string;
  thankYou?: { title?: string; message?: string; redirectUrl?: string | null };
  /** scrypt hash of the password (never returned to clients) */
  passwordHash?: string | null;
  tags?: string[];
  /** only one response per logged-in user */
  limitOneResponse?: boolean;
  /** require login to submit */
  requireLogin?: boolean;
}

export const forms = sqliteTable(
  "forms",
  {
    id: idPk(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    /** backing board: submissions become items here */
    boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    /** target group for new items (null = first group) */
    groupId: text("group_id"),
    name: text("name").notNull(),
    /** public token used in /f/<token> */
    token: text("token").notNull(),
    isPublished: integer("is_published", { mode: "boolean" }).notNull().default(false),
    settings: json<FormSettings>("settings").notNull().default({}),
    state: text("state").$type<"active" | "deleted">().notNull().default("active"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("forms_token_uq").on(t.token), index("forms_board_idx").on(t.boardId), index("forms_ws_idx").on(t.workspaceId)],
);

export interface QuestionLogic {
  /** show this question only when the answer to another question matches */
  showWhen?: { questionId: string; op: "equals" | "not_equals" | "contains" | "not_empty" | "is_empty"; value?: unknown }[];
  /** all (AND) or any (OR) of the rules */
  match?: "all" | "any";
}

export const formQuestions = sqliteTable(
  "form_questions",
  {
    id: idPk(),
    formId: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
    /** mapped column (null for the item name, or a pure text/section block) */
    columnId: text("column_id"),
    /** "name" | column type | "section" (description block, no answer) */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    required: integer("required", { mode: "boolean" }).notNull().default(false),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    position: real("position").notNull().default(0),
    /** placeholder, options subset, logic ... */
    settings: json<Record<string, unknown> & { logic?: QuestionLogic }>("settings").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("form_questions_form_idx").on(t.formId, t.position)],
);

export const formSubmissions = sqliteTable(
  "form_submissions",
  {
    id: idPk(),
    formId: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
    itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** hashed client address, for rate limiting only */
    ipHash: text("ip_hash"),
    answers: json<Record<string, unknown>>("answers").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("form_submissions_form_idx").on(t.formId, t.createdAt), index("form_submissions_user_idx").on(t.formId, t.userId)],
);

