/**
 * Schema for module "automations": automations (also workflows), run log, scheduler dedupe.
 * Owned by the `automations` agent. Definition shape: src/server/automations/model.ts.
 */
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AutomationDefinition, RunStep, TriggerSnapshot } from "../../server/automations/model";
import { createdAt, idPk, json, updatedAt } from "./_helpers";
import { accounts, boards, users } from "./core";

export const automations = sqliteTable(
  "automations",
  {
    id: idPk(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    boardId: text("board_id").references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** automation = recipe/custom, workflow = canvas built (same engine) */
    kind: text("kind").$type<"automation" | "workflow">().notNull().default("automation"),
    /** toggle on/off. Only active + published definitions run. */
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    /** workflows start as draft until published; automations are always published */
    status: text("status").$type<"published" | "draft">().notNull().default("published"),
    definition: json<AutomationDefinition>("definition").notNull(),
    /** workflow canvas layout (node positions); engine ignores it */
    graph: json<Record<string, unknown>>("graph").notNull().default({}),
    /** recipe id when created from the recipe center */
    recipeId: text("recipe_id"),
    runCount: integer("run_count").notNull().default(0),
    lastRunAt: text("last_run_at"),
    state: text("state").$type<"active" | "deleted">().notNull().default("active"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("automations_board_idx").on(t.boardId, t.state), index("automations_account_idx").on(t.accountId, t.state)],
);

export type RunStatus = "running" | "success" | "failed" | "retrying" | "skipped" | "waiting_approval" | "rejected";

export const automationRuns = sqliteTable(
  "automation_runs",
  {
    id: idPk(),
    automationId: text("automation_id").notNull().references(() => automations.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    boardId: text("board_id"),
    itemId: text("item_id"),
    status: text("status").$type<RunStatus>().notNull().default("running"),
    error: text("error"),
    attempt: integer("attempt").notNull().default(1),
    maxAttempts: integer("max_attempts").notNull().default(3),
    /** program counter into the compiled step list (resume point for retries/approvals) */
    pc: integer("pc").notNull().default(0),
    nextRetryAt: text("next_retry_at"),
    /** loop protection: how deep in an automation-caused chain this run is, and which automations are in it */
    depth: integer("depth").notNull().default(0),
    originId: text("origin_id"),
    chain: json<string[]>("chain").notNull().default([]),
    trigger: json<TriggerSnapshot>("trigger").notNull(),
    /** steps as they were when the run started (definition edits do not affect a running run) */
    snapshot: json<AutomationDefinition["steps"]>("snapshot").notNull().default([]),
    steps: json<RunStep[]>("steps").notNull().default([]),
    approval: json<Record<string, unknown> | null>("approval"),
    startedAt: text("started_at").notNull().$defaultFn(() => new Date().toISOString()),
    finishedAt: text("finished_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("automation_runs_auto_idx").on(t.automationId, t.createdAt),
    index("automation_runs_board_idx").on(t.boardId, t.createdAt),
    index("automation_runs_account_idx").on(t.accountId, t.createdAt),
    index("automation_runs_retry_idx").on(t.status, t.nextRetryAt),
  ],
);

/** Scheduler dedupe: a time-based trigger fires once per (automation, key). Makes boot catch-up safe. */
export const automationFired = sqliteTable(
  "automation_fired",
  {
    automationId: text("automation_id").notNull().references(() => automations.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    firedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.automationId, t.dedupeKey] })],
);
