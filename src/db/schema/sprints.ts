/**
 * Schema file for module "sprints" (module D, dev): sprints, sprint membership history,
 * retrospective votes and git integration (webhook secrets + commit/PR/branch links).
 *
 * Source of truth for "which sprint is a task in" is the `sprint` column on the task board
 * (value `{ sprintId }`); `sprint_items` is the history (added/removed/started/done timestamps)
 * that burndown, velocity, scope change and cycle time are computed from.
 */
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idPk, json } from "./_helpers";
import { accounts, boards, items, users } from "./core";

export type SprintState = "planned" | "active" | "completed";

export interface SprintCommitted { count: number; points: number }
export interface SprintResult {
  committedCount: number;
  committedPoints: number;
  addedCount: number;
  addedPoints: number;
  removedCount: number;
  removedPoints: number;
  doneCount: number;
  donePoints: number;
  carriedCount: number;
  carriedPoints: number;
  carriedTo: "next" | "backlog" | null;
  nextSprintId: string | null;
}

export const sprints = sqliteTable(
  "sprints",
  {
    id: idPk(),
    /** the dev_sprints board this sprint belongs to (one sprint board per team) */
    boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    /** the item on the sprints board that represents this sprint (status/timeline stay in sync) */
    itemId: text("item_id"),
    name: text("name").notNull(),
    goal: text("goal"),
    state: text("state").$type<SprintState>().notNull().default("planned"),
    /** YYYY-MM-DD */
    startsOn: text("starts_on"),
    endsOn: text("ends_on"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    committed: json<SprintCommitted>("committed"),
    result: json<SprintResult>("result"),
    settings: json<Record<string, unknown>>("settings").notNull().default({}),
    position: real("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("sprints_board_idx").on(t.boardId, t.position)],
);

/** One row per period an item spent in a sprint (history; an item can have several rows over time). */
export const sprintItems = sqliteTable(
  "sprint_items",
  {
    id: idPk(),
    sprintId: text("sprint_id").notNull().references(() => sprints.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    boardId: text("board_id").notNull(),
    addedAt: text("added_at").notNull(),
    removedAt: text("removed_at"),
    /** true when the item was added after the sprint was started (scope creep) */
    addedAfterStart: integer("added_after_start", { mode: "boolean" }).notNull().default(false),
    /** current estimate (hours or story points), refreshed on every sync */
    points: real("points").notNull().default(0),
    startedAt: text("started_at"),
    doneAt: text("done_at"),
    /** done | carried | removed | null (still open) */
    outcome: text("outcome").$type<"done" | "carried" | "removed">(),
  },
  (t) => [index("sprint_items_sprint_idx").on(t.sprintId), index("sprint_items_item_idx").on(t.itemId)],
);

/** Retrospective votes (one per user per card). Cards are items on the Retrospectives board. */
export const retroVotes = sqliteTable(
  "retro_votes",
  {
    id: idPk(),
    itemId: text("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("retro_votes_uq").on(t.itemId, t.userId)],
);

export type GitProvider = "github" | "bitbucket";

/** Webhook secret per provider. The plain secret is needed to verify the HMAC of incoming payloads. */
export const gitIntegrations = sqliteTable(
  "git_integrations",
  {
    id: idPk(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    provider: text("provider").$type<GitProvider>().notNull(),
    name: text("name").notNull(),
    secret: text("secret").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    lastEventAt: text("last_event_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("git_integrations_account_idx").on(t.accountId, t.provider)],
);

export type GitLinkKind = "commit" | "pull_request" | "branch";

export const gitLinks = sqliteTable(
  "git_links",
  {
    id: idPk(),
    accountId: text("account_id").notNull(),
    itemId: text("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    boardId: text("board_id").notNull(),
    provider: text("provider").$type<GitProvider>().notNull(),
    kind: text("kind").$type<GitLinkKind>().notNull(),
    repo: text("repo").notNull(),
    /** commit sha, pull request number or branch name */
    externalId: text("external_id").notNull(),
    title: text("title").notNull().default(""),
    url: text("url"),
    author: text("author"),
    /** pull requests: open | merged | closed; commits/branches: null */
    state: text("state"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("git_links_uq").on(t.itemId, t.provider, t.repo, t.kind, t.externalId),
    index("git_links_item_idx").on(t.itemId),
  ],
);
