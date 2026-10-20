/**
 * Schema for module "oauth": OAuth 2.1 authorization server for the MCP endpoint, so Claude
 * (claude.ai connectors, Claude Desktop/mobile, Claude Code) can connect without a pasted token.
 *  - oauth_clients: dynamically registered clients (RFC 7591). Public clients use PKCE only.
 *  - oauth_grants: one consent per user + client (scopes, optional workspace restriction).
 *  - oauth_codes: short-lived authorization codes (hashed, single use).
 *  - oauth_tokens: access + refresh tokens (hashed). Refresh tokens rotate on every use.
 */
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idPk, json } from "./_helpers";
import { users } from "./core";
import type { TokenScope } from "./api-tokens";

export const oauthClients = sqliteTable("oauth_clients", {
  /** the public client_id */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  redirectUris: json<string[]>("redirect_uris").notNull(),
  /** "none" (public client, PKCE) | "client_secret_post" | "client_secret_basic" */
  authMethod: text("auth_method").notNull().default("none"),
  /** sha256 hex of the client secret (confidential clients only) */
  secretHash: text("secret_hash"),
  clientUri: text("client_uri"),
  createdAt: createdAt(),
  lastUsedAt: text("last_used_at"),
});

export const oauthGrants = sqliteTable(
  "oauth_grants",
  {
    id: idPk(),
    clientId: text("client_id").notNull().references(() => oauthClients.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    scopes: json<TokenScope[]>("scopes").notNull(),
    /** null = every workspace the user can see */
    workspaceIds: json<string[] | null>("workspace_ids"),
    createdAt: createdAt(),
    lastUsedAt: text("last_used_at"),
    revokedAt: text("revoked_at"),
  },
  (t) => [index("oauth_grants_user_idx").on(t.userId), index("oauth_grants_client_idx").on(t.clientId)],
);

export const oauthCodes = sqliteTable("oauth_codes", {
  /** sha256 hex of the code */
  codeHash: text("code_hash").primaryKey(),
  grantId: text("grant_id").notNull().references(() => oauthGrants.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  resource: text("resource"),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

export const oauthTokens = sqliteTable(
  "oauth_tokens",
  {
    /** sha256 hex of the token */
    tokenHash: text("token_hash").primaryKey(),
    grantId: text("grant_id").notNull().references(() => oauthGrants.id, { onDelete: "cascade" }),
    /** "access" | "refresh" */
    kind: text("kind").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("oauth_tokens_grant_idx").on(t.grantId)],
);
