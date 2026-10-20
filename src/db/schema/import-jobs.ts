/**
 * Schema of module M (migration): import_jobs (history of monday.com imports and Jira migrations)
 * and external_refs (maps an external id, e.g. a monday.com item id or a Jira key, to a clone entity
 * so re-runs update instead of duplicate; the core schema stays untouched).
 */
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idPk, json, updatedAt } from "./_helpers";
import { accounts, users } from "./core";

export type ImportJobKind = "monday" | "jira";
export type ImportJobStatus = "running" | "done" | "failed";

export const importJobs = sqliteTable(
  "import_jobs",
  {
    id: idPk(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ImportJobKind>().notNull(),
    /** dry_run never writes to the clone, apply does */
    mode: text("mode").$type<"dry_run" | "apply">().notNull().default("dry_run"),
    status: text("status").$type<ImportJobStatus>().notNull().default("running"),
    /** filters used: { workspaces: string[], projects: string[], since: string, ... } */
    options: json<Record<string, unknown>>("options").notNull().default({}),
    /** counts per entity: { workspaces: { create: 3, update: 0, skip: 0 }, ... } */
    counts: json<Record<string, unknown>>("counts").notNull().default({}),
    /** full report: warnings, diff lines, verification */
    report: json<Record<string, unknown>>("report").notNull().default({}),
    error: text("error"),
    startedBy: text("started_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    finishedAt: text("finished_at"),
  },
  (t) => [index("import_jobs_account_idx").on(t.accountId, t.createdAt)],
);

export const externalRefs = sqliteTable(
  "external_refs",
  {
    id: idPk(),
    /** user | team | workspace | folder | board | group | column | item | update | asset | sprint | doc | worklog */
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /** monday | jira */
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    /** hash of the last imported payload, lets a re-run skip unchanged rows */
    hash: text("hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("external_refs_source_ext_uq").on(t.source, t.entityType, t.externalId),
    index("external_refs_entity_idx").on(t.entityType, t.entityId),
  ],
);
