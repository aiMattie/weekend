/**
 * Schema for module "webhooks" (owned by the `automations` agent): outgoing webhook endpoints,
 * delivery queue/log, and integration connections (Slack, Teams, GitHub, inbound webhooks ...).
 */
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idPk, json, updatedAt } from "./_helpers";
import { accounts, boards, users } from "./core";

export const webhookEndpoints = sqliteTable(
  "webhook_endpoints",
  {
    id: idPk(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    /** null = account wide */
    boardId: text("board_id").references(() => boards.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** event names (create_item, change_column_value ...) or "*" */
    events: json<string[]>("events").notNull().default(["*"]),
    /** event specific config (create_webhook config), e.g. { columnId } for change_specific_column_value */
    config: json<Record<string, unknown>>("config").notNull().default({}),
    secret: text("secret").notNull(),
    description: text("description"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("webhook_endpoints_account_idx").on(t.accountId, t.boardId)],
);

export type DeliveryStatus = "pending" | "success" | "failed" | "dead";

export const webhookDeliveries = sqliteTable(
  "webhook_deliveries",
  {
    id: idPk(),
    endpointId: text("endpoint_id").notNull().references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: json<Record<string, unknown>>("payload").notNull(),
    /** pending = waiting for (re)try, success = 2xx, dead = out of attempts */
    status: text("status").$type<DeliveryStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("next_attempt_at"),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    error: text("error"),
    deliveredAt: text("delivered_at"),
    createdAt: createdAt(),
  },
  (t) => [index("webhook_deliveries_endpoint_idx").on(t.endpointId, t.createdAt), index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt)],
);

export type IntegrationKind = "slack" | "teams" | "github" | "gmail" | "outlook" | "jira" | "webhook_in" | "webhook_out";

export const integrations = sqliteTable(
  "integrations",
  {
    id: idPk(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    boardId: text("board_id").references(() => boards.id, { onDelete: "cascade" }),
    kind: text("kind").$type<IntegrationKind>().notNull(),
    name: text("name").notNull(),
    /** kind specific: slack/teams {webhookUrl}, inbound {groupId, mapping, secret}, github {secret} ... */
    config: json<Record<string, unknown>>("config").notNull().default({}),
    /** secret URL token for inbound webhooks: POST /api/public/hooks/<token> */
    token: text("token").unique(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    lastEventAt: text("last_event_at"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("integrations_account_idx").on(t.accountId, t.kind)],
);
