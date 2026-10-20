/**
 * Schema for module "api-tokens" (owner: platform): personal API tokens (hashed), daily API
 * usage per token (complexity budget) and an audit trail of API/MCP calls.
 */
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idPk, json } from "./_helpers";
import { users } from "./core";

export type TokenScope = "read" | "write";

export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: idPk(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** sha256 hex of the full token. The token itself is shown once and never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    /** first characters, shown in the UI to recognise a token (never enough to use it) */
    tokenPrefix: text("token_prefix").notNull(),
    scopes: json<TokenScope[]>("scopes").notNull().default(["read", "write"]),
    /** null = all workspaces the user can see; otherwise only these workspaces */
    workspaceIds: json<string[] | null>("workspace_ids"),
    /** daily complexity budget; null = server default (API_DAILY_BUDGET) */
    dailyBudget: integer("daily_budget"),
    lastUsedAt: text("last_used_at"),
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)],
);

/** Complexity spent per token per UTC day (daily budget, `complexity` header). */
export const apiUsage = sqliteTable(
  "api_usage",
  {
    tokenId: text("token_id").notNull(),
    day: text("day").notNull(),
    used: integer("used").notNull().default(0),
    calls: integer("calls").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tokenId, t.day] })],
);

/** Audit of MCP and API calls made with a token (own table until the admin audit service exists). */
export const apiCalls = sqliteTable(
  "api_calls",
  {
    id: idPk(),
    tokenId: text("token_id"),
    userId: text("user_id"),
    /** mcp | graphql | rest */
    channel: text("channel").notNull(),
    /** tool name or GraphQL operation name */
    name: text("name").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull().default(true),
    error: text("error"),
    durationMs: integer("duration_ms").notNull().default(0),
    detail: json<Record<string, unknown>>("detail").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("api_calls_created_idx").on(t.createdAt), index("api_calls_token_idx").on(t.tokenId, t.createdAt)],
);
