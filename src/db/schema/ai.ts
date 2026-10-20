/**
 * Schema for module "ai": settings + credit usage, Sidekick conversations, agents (triggers, skills,
 * knowledge, runs) and notetaker meetings. Owned by the `ai` agent.
 */
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idPk, json, updatedAt } from "./_helpers";
import { accounts, users, workspaces } from "./core";

/** One row per account: credit limits and the agent kill switch. The API key is never stored here. */
export const aiSettings = sqliteTable("ai_settings", {
  accountId: text("account_id").primaryKey().references(() => accounts.id, { onDelete: "cascade" }),
  /** null = unlimited */
  accountMonthlyCredits: integer("account_monthly_credits"),
  userMonthlyCredits: integer("user_monthly_credits"),
  /** global kill switch for agents (false = no agent runs at all) */
  agentsEnabled: integer("agents_enabled", { mode: "boolean" }).notNull().default(true),
  /** account-wide switch for all AI features */
  aiEnabled: integer("ai_enabled", { mode: "boolean" }).notNull().default(true),
  /** model override (falls back to env AI_MODEL, then claude-sonnet-5-5) */
  model: text("model"),
  updatedAt: updatedAt(),
});

export type AiSource = "sidekick" | "magic" | "block" | "agent" | "notetaker" | "automation_text" | "autofill";

/** Every LLM call. credits = ceil((input + 5 * output) / 1000). */
export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: idPk(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    source: text("source").$type<AiSource>().notNull(),
    refId: text("ref_id"),
    model: text("model").notNull().default(""),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    credits: integer("credits").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_account_idx").on(t.accountId, t.createdAt), index("ai_usage_user_idx").on(t.userId, t.createdAt)],
);

export type AiContextRef = { kind: "board" | "item" | "doc"; id: string } | null;

export const aiConversations = sqliteTable(
  "ai_conversations",
  {
    id: idPk(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Nieuw gesprek"),
    context: json<AiContextRef>("context"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_conv_user_idx").on(t.userId, t.updatedAt)],
);

export const aiMessages = sqliteTable(
  "ai_messages",
  {
    id: idPk(),
    conversationId: text("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    /** user | assistant. Tool results are stored as user messages (Anthropic format) with `kind` = "tool_result". */
    role: text("role").$type<"user" | "assistant">().notNull(),
    kind: text("kind").$type<"text" | "tool_result" | "note">().notNull().default("text"),
    /** raw Anthropic content (string or content blocks), replayed verbatim */
    content: json<unknown>("content").notNull(),
    /** plain text for display */
    text: text("text").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("ai_msg_conv_idx").on(t.conversationId, t.seq)],
);

/** A write the model asked for; it only executes after the user confirms the card. */
export const aiPendingActions = sqliteTable(
  "ai_pending_actions",
  {
    id: idPk(),
    conversationId: text("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    input: json<Record<string, unknown>>("input").notNull(),
    summary: text("summary").notNull(),
    /** preview data shown on the card (Weekend magic board outline) */
    preview: json<unknown>("preview"),
    status: text("status").$type<"pending" | "confirmed" | "rejected" | "failed">().notNull().default("pending"),
    result: json<unknown>("result"),
    error: text("error"),
    createdAt: createdAt(),
    decidedAt: text("decided_at"),
  },
  (t) => [index("ai_pending_conv_idx").on(t.conversationId, t.createdAt)],
);

/* ------------------------------------------------------------------ agents */

export type AgentStatus = "active" | "paused" | "draft";

export const agents = sqliteTable(
  "agents",
  {
    id: idPk(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** emoji or color key for the avatar */
    avatar: text("avatar").notNull().default("#a25ddc"),
    instructions: text("instructions").notNull().default(""),
    model: text("model"),
    status: text("status").$type<AgentStatus>().notNull().default("draft"),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** identity: an AI user (isAiAgent). Writes are attributed to it. */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** true when the identity user was created for this agent (deactivated on delete) */
    ownsUser: integer("owns_user", { mode: "boolean" }).notNull().default(false),
    /** ready-made template key (lead_scorer ...) */
    templateKey: text("template_key"),
    maxSteps: integer("max_steps").notNull().default(8),
    maxTokens: integer("max_tokens").notNull().default(20000),
    maxRunsPerHour: integer("max_runs_per_hour").notNull().default(30),
    state: text("state").$type<"active" | "deleted">().notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("agents_account_idx").on(t.accountId, t.state)],
);

export type AgentTriggerType = "item_created" | "column_changed" | "mention" | "schedule" | "manual";

export const agentTriggers = sqliteTable(
  "agent_triggers",
  {
    id: idPk(),
    agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    type: text("type").$type<AgentTriggerType>().notNull(),
    /** item_created/column_changed: { boardId, columnId?, labelText? }; schedule: { every, time, weekday? } */
    config: json<Record<string, unknown>>("config").notNull().default({}),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    /** schedule dedupe key of the last firing */
    lastFiredKey: text("last_fired_key"),
    createdAt: createdAt(),
  },
  (t) => [index("agent_triggers_agent_idx").on(t.agentId)],
);

export const agentSkills = sqliteTable(
  "agent_skills",
  {
    id: idPk(),
    agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    instruction: text("instruction").notNull().default(""),
    /** tool allow-list; empty = no extra tools */
    tools: json<string[]>("tools").notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("agent_skills_agent_idx").on(t.agentId)],
);

export const agentKnowledge = sqliteTable(
  "agent_knowledge",
  {
    id: idPk(),
    agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"board" | "doc">().notNull(),
    refId: text("ref_id").notNull(),
    access: text("access").$type<"read" | "write">().notNull().default("read"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("agent_knowledge_uq").on(t.agentId, t.kind, t.refId)],
);

export type AgentRunStatus = "running" | "success" | "failed" | "capped" | "skipped";
export interface AgentToolCall { name: string; input: unknown; output: string; error?: boolean; at: string }
export interface AgentTranscriptEntry { role: "system" | "user" | "assistant" | "tool"; text: string; at: string }

export const agentRuns = sqliteTable(
  "agent_runs",
  {
    id: idPk(),
    agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    status: text("status").$type<AgentRunStatus>().notNull().default("running"),
    triggerType: text("trigger_type").$type<AgentTriggerType>().notNull().default("manual"),
    trigger: json<Record<string, unknown>>("trigger").notNull().default({}),
    startedBy: text("started_by"),
    transcript: json<AgentTranscriptEntry[]>("transcript").notNull().default([]),
    toolCalls: json<AgentToolCall[]>("tool_calls").notNull().default([]),
    result: text("result"),
    error: text("error"),
    steps: integer("steps").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    credits: integer("credits").notNull().default(0),
    depth: integer("depth").notNull().default(0),
    chain: json<string[]>("chain").notNull().default([]),
    startedAt: text("started_at").notNull().$defaultFn(() => new Date().toISOString()),
    finishedAt: text("finished_at"),
    createdAt: createdAt(),
  },
  (t) => [index("agent_runs_agent_idx").on(t.agentId, t.createdAt), index("agent_runs_account_idx").on(t.accountId, t.createdAt)],
);

/* ------------------------------------------------------------------ notetaker */

export interface MeetingActionItem {
  id: string;
  text: string;
  assigneeName?: string | null;
  assigneeId?: string | null;
  due?: string | null;
  status: "proposed" | "created" | "skipped";
  itemId?: string | null;
}

export const meetings = sqliteTable(
  "meetings",
  {
    id: idPk(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    heldAt: text("held_at").notNull(),
    /** klant workspace the report lives in */
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    clientName: text("client_name"),
    attendees: json<string[]>("attendees").notNull().default([]),
    transcript: text("transcript").notNull().default(""),
    summary: text("summary").notNull().default(""),
    decisions: json<string[]>("decisions").notNull().default([]),
    actionItems: json<MeetingActionItem[]>("action_items").notNull().default([]),
    /** how the extraction was done: ai | fallback */
    method: text("method").$type<"ai" | "fallback">().notNull().default("fallback"),
    docId: text("doc_id"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("meetings_account_idx").on(t.accountId, t.heldAt)],
);
