/**
 * OAuth 2.1 authorization server (module oauth) for the MCP endpoint: dynamic client
 * registration (RFC 7591), authorization code + PKCE (S256 only), rotating refresh tokens and
 * token revocation (RFC 7009). Access tokens resolve to an Actor with `actor.token` set, so the
 * MCP/GraphQL scope checks, rate limits and audit trail treat them like API tokens (the grant id
 * plays the token id). Codes and tokens are stored as sha256 hashes only.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError } from "../../lib/errors";
import { db } from "../../db/client";
import { users, workspaces } from "../../db/schema/core";
import { oauthClients, oauthCodes, oauthGrants, oauthTokens } from "../../db/schema/oauth";
import type { TokenScope } from "../../db/schema/api-tokens";
import { appUrl } from "../sso/config";
import { pkceChallenge, safeEqual } from "../sso/oauth";
import { recordAudit } from "./audit";

export const ACCESS_TTL_SECONDS = 3600;
export const REFRESH_TTL_SECONDS = 90 * 86_400;
const CODE_TTL_SECONDS = 600;
export const ACCESS_PREFIX = "mno_at_";
const REFRESH_PREFIX = "mno_rt_";
export const SCOPES: TokenScope[] = ["read", "write"];

export type OAuthClient = typeof oauthClients.$inferSelect;
export type OAuthGrant = typeof oauthGrants.$inferSelect;

/** RFC 6749 error: `error` is the protocol code, `status` the HTTP status of the token endpoint. */
export class OAuthError extends Error {
  constructor(readonly error: string, message: string, readonly status = 400) {
    super(message);
    this.name = "OAuthError";
  }
}

const hash = (v: string): string => createHash("sha256").update(v).digest("hex");
const rand = (bytes = 32): string => randomBytes(bytes).toString("base64url");
const iso = (ms: number): string => new Date(ms).toISOString();

/* ------------------------------------------------------------------ issuer + metadata */

export const issuer = (): string => (process.env.PUBLIC_URL?.trim() || appUrl()).replace(/\/+$/, "");
export const mcpResource = (): string => `${issuer()}/api/mcp`;

export function authorizationServerMetadata() {
  const iss = issuer();
  return {
    issuer: iss,
    authorization_endpoint: `${iss}/oauth/authorize`,
    token_endpoint: `${iss}/api/oauth/token`,
    registration_endpoint: `${iss}/api/oauth/register`,
    revocation_endpoint: `${iss}/api/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: SCOPES,
    service_documentation: `${iss}/admin/api`,
  };
}

export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [issuer()],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Weekend MCP",
    resource_documentation: `${issuer()}/admin/api`,
  };
}

/* ------------------------------------------------------------------ redirect URIs */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** https on an allowed host (OAUTH_REDIRECT_HOSTS, default claude.ai + claude.com) or http(s) on loopback (Claude Code, RFC 8252). */
export function isAllowedRedirectUri(uri: string): boolean {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash || u.username || u.password) return false;
  if (LOOPBACK.has(u.hostname)) return u.protocol === "http:" || u.protocol === "https:";
  if (u.protocol !== "https:") return false;
  const hosts = (process.env.OAUTH_REDIRECT_HOSTS ?? "claude.ai,claude.com").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return hosts.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
}

/** Exact match, except that loopback redirects may use any port (RFC 8252 §7.3). */
function redirectMatches(registered: string, given: string): boolean {
  if (registered === given) return true;
  try {
    const a = new URL(registered), b = new URL(given);
    return LOOPBACK.has(a.hostname) && a.hostname === b.hostname && a.protocol === b.protocol && a.pathname === b.pathname && a.search === b.search;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ dynamic client registration */

const registerInput = z.object({
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  client_name: z.string().trim().max(120).optional(),
  client_uri: z.string().url().max(500).optional(),
  token_endpoint_auth_method: z.enum(["none", "client_secret_post", "client_secret_basic"]).default("none"),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
}).passthrough();

export function registerClient(input: unknown) {
  const r = registerInput.safeParse(input);
  if (!r.success) throw new OAuthError("invalid_client_metadata", r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const d = r.data;
  const bad = d.redirect_uris.find((u) => !isAllowedRedirectUri(u));
  if (bad) throw new OAuthError("invalid_redirect_uri", `Redirect URI not allowed: ${bad}`);
  if (d.grant_types?.some((g) => g !== "authorization_code" && g !== "refresh_token")) throw new OAuthError("invalid_client_metadata", "Only authorization_code and refresh_token grants are supported");
  if (d.response_types?.some((t) => t !== "code")) throw new OAuthError("invalid_client_metadata", "Only response_type code is supported");
  const id = "mnc_" + rand(16);
  const secret = d.token_endpoint_auth_method === "none" ? null : "mncs_" + rand(32);
  const row = db.insert(oauthClients).values({
    id, name: d.client_name || "MCP client", redirectUris: d.redirect_uris, authMethod: d.token_endpoint_auth_method,
    secretHash: secret ? hash(secret) : null, clientUri: d.client_uri ?? null,
  }).returning().get();
  return {
    client_id: row.id, client_id_issued_at: Math.floor(Date.parse(row.createdAt) / 1000), client_name: row.name,
    redirect_uris: row.redirectUris, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
    token_endpoint_auth_method: row.authMethod, ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
  };
}

export const getClient = (id: string): OAuthClient | undefined => db.select().from(oauthClients).where(eq(oauthClients.id, id)).get();

/* ------------------------------------------------------------------ authorization request */

export interface AuthorizeRequest {
  client: OAuthClient;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scopes: TokenScope[];
  resource: string | null;
}

/** Thrown when the request is invalid in a way that may NOT be reported back to the redirect URI. */
export class AuthorizeFatalError extends Error {}

type Params = URLSearchParams | Record<string, string | string[] | undefined>;
const param = (p: Params, k: string): string | null => {
  const v = p instanceof URLSearchParams ? p.get(k) : p[k];
  const s = Array.isArray(v) ? v[0] : v;
  return s === undefined || s === null || s === "" ? null : String(s);
};

export function parseScopes(raw: string | null): TokenScope[] {
  if (!raw) return [...SCOPES];
  const asked = new Set(raw.split(/\s+/));
  const out = SCOPES.filter((s) => asked.has(s));
  return out.length ? out : [...SCOPES];
}

/** Client + redirect URI of an authorize request. Throws AuthorizeFatalError: errors may not be sent to an unverified redirect. */
export function resolveClientRedirect(p: Params): { client: OAuthClient; redirectUri: string; state: string | null } {
  const clientId = param(p, "client_id");
  const client = clientId ? getClient(clientId) : undefined;
  if (!client) throw new AuthorizeFatalError("Unknown client_id");
  const given = param(p, "redirect_uri");
  const registered = given ? client.redirectUris.find((r) => redirectMatches(r, given)) : client.redirectUris.length === 1 ? client.redirectUris[0] : undefined;
  if (!registered) throw new AuthorizeFatalError("redirect_uri does not match a registered redirect URI");
  return { client, redirectUri: given ?? registered, state: param(p, "state") };
}

/** Validates the query of /oauth/authorize. Throws AuthorizeFatalError or OAuthError (redirectable). */
export function parseAuthorizeRequest(p: Params): AuthorizeRequest {
  const { client, redirectUri } = resolveClientRedirect(p);
  if (param(p, "response_type") !== "code") throw new OAuthError("unsupported_response_type", "response_type must be code");
  const codeChallenge = param(p, "code_challenge");
  if (!codeChallenge || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) throw new OAuthError("invalid_request", "PKCE code_challenge (S256) is required");
  if ((param(p, "code_challenge_method") ?? "plain") !== "S256") throw new OAuthError("invalid_request", "code_challenge_method must be S256");
  const resource = param(p, "resource");
  if (resource && !resource.startsWith(issuer())) throw new OAuthError("invalid_target", "Unknown resource");
  return { client, redirectUri, state: param(p, "state"), codeChallenge, scopes: parseScopes(param(p, "scope")), resource };
}

export function errorRedirect(req: { redirectUri: string; state: string | null }, error: string, description?: string): string {
  const u = new URL(req.redirectUri);
  u.searchParams.set("error", error);
  if (description) u.searchParams.set("error_description", description);
  if (req.state) u.searchParams.set("state", req.state);
  u.searchParams.set("iss", issuer());
  return u.toString();
}

const approveInput = z.object({
  scopes: z.array(z.enum(["read", "write"])).default(["read"]),
  workspaceIds: z.array(z.string()).nullish(),
});

/** The signed-in user approved the request: store/refresh the grant and return the redirect URL carrying the code. */
export function approve(actor: Actor, req: AuthorizeRequest, input: unknown): string {
  if (actor.isSystem || actor.token || actor.agent) throw new ForbiddenError("Only a signed-in user can approve an OAuth client");
  const d = approveInput.parse(input);
  // a user can narrow the request, never widen it; read is implied by write
  let scopes = SCOPES.filter((s) => d.scopes.includes(s) && req.scopes.includes(s));
  if (scopes.includes("write") && !scopes.includes("read")) scopes = ["read", ...scopes];
  if (!scopes.length) scopes = ["read"];
  const wsIds = d.workspaceIds?.filter(Boolean) ?? [];
  for (const id of wsIds) {
    const ws = db.select({ accountId: workspaces.accountId }).from(workspaces).where(eq(workspaces.id, id)).get();
    if (!ws || ws.accountId !== actor.accountId) throw new NotFoundError(`Workspace ${id}`);
  }
  const workspaceIds = wsIds.length ? wsIds : null;
  const code = rand(32);
  const grant = db.transaction((tx) => {
    const existing = tx.select().from(oauthGrants)
      .where(and(eq(oauthGrants.clientId, req.client.id), eq(oauthGrants.userId, actor.id), isNull(oauthGrants.revokedAt))).get();
    const g = existing
      ? tx.update(oauthGrants).set({ scopes, workspaceIds }).where(eq(oauthGrants.id, existing.id)).returning().get()
      : tx.insert(oauthGrants).values({ clientId: req.client.id, userId: actor.id, scopes, workspaceIds }).returning().get();
    tx.insert(oauthCodes).values({
      codeHash: hash(code), grantId: g.id, redirectUri: req.redirectUri, codeChallenge: req.codeChallenge,
      resource: req.resource, expiresAt: iso(Date.now() + CODE_TTL_SECONDS * 1000),
    }).run();
    return g;
  });
  recordAudit(actor, "oauth.approved", { targetType: "oauth_client", targetId: req.client.id, targetName: req.client.name, scopes, workspaceIds, grantId: grant.id });
  const u = new URL(req.redirectUri);
  u.searchParams.set("code", code);
  if (req.state) u.searchParams.set("state", req.state);
  u.searchParams.set("iss", issuer());
  return u.toString();
}

/* ------------------------------------------------------------------ token endpoint */

export interface TokenResponse { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string }

/** Client authentication: client_secret_basic header or form fields; public clients only send client_id. */
function authenticateClient(form: URLSearchParams, authorization: string | null): OAuthClient {
  let id = form.get("client_id"), secret = form.get("client_secret");
  const m = authorization && /^Basic\s+(.+)$/i.exec(authorization);
  if (m) {
    const [u, s] = Buffer.from(m[1], "base64").toString("utf8").split(":");
    id = decodeURIComponent(u ?? ""); secret = decodeURIComponent(s ?? "");
  }
  const client = id ? getClient(id) : undefined;
  if (!client) throw new OAuthError("invalid_client", "Unknown client", 401);
  if (client.authMethod !== "none" && (!secret || !client.secretHash || !safeEqual(hash(secret), client.secretHash))) {
    throw new OAuthError("invalid_client", "Client authentication failed", 401);
  }
  return client;
}

function issueTokens(grant: OAuthGrant): TokenResponse {
  const access = ACCESS_PREFIX + rand(32), refresh = REFRESH_PREFIX + rand(32);
  const now = Date.now();
  db.insert(oauthTokens).values([
    { tokenHash: hash(access), grantId: grant.id, kind: "access", expiresAt: iso(now + ACCESS_TTL_SECONDS * 1000) },
    { tokenHash: hash(refresh), grantId: grant.id, kind: "refresh", expiresAt: iso(now + REFRESH_TTL_SECONDS * 1000) },
  ]).run();
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_SECONDS, refresh_token: refresh, scope: grant.scopes.join(" ") };
}

function revokeGrantTokens(grantId: string, alsoGrant: boolean): void {
  const now = iso(Date.now());
  db.update(oauthTokens).set({ revokedAt: now }).where(and(eq(oauthTokens.grantId, grantId), isNull(oauthTokens.revokedAt))).run();
  if (alsoGrant) db.update(oauthGrants).set({ revokedAt: now }).where(and(eq(oauthGrants.id, grantId), isNull(oauthGrants.revokedAt))).run();
}

function purgeExpired(): void {
  const cutoff = iso(Date.now() - 86_400_000);
  db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, cutoff)).run();
  db.delete(oauthTokens).where(lt(oauthTokens.expiresAt, cutoff)).run();
}

function activeGrant(id: string): OAuthGrant {
  const g = db.select().from(oauthGrants).where(eq(oauthGrants.id, id)).get();
  if (!g || g.revokedAt) throw new OAuthError("invalid_grant", "Grant revoked");
  const u = db.select({ isActive: users.isActive }).from(users).where(eq(users.id, g.userId)).get();
  if (!u?.isActive) throw new OAuthError("invalid_grant", "User inactive");
  return g;
}

/** POST /api/oauth/token (form encoded). */
export function exchangeToken(form: URLSearchParams, authorization: string | null): TokenResponse {
  const client = authenticateClient(form, authorization);
  const grantType = form.get("grant_type");
  purgeExpired();
  if (grantType === "authorization_code") {
    const code = form.get("code"), verifier = form.get("code_verifier");
    if (!code || !verifier) throw new OAuthError("invalid_request", "code and code_verifier are required");
    const row = db.select().from(oauthCodes).where(eq(oauthCodes.codeHash, hash(code))).get();
    if (!row) throw new OAuthError("invalid_grant", "Unknown authorization code");
    const grant = db.select().from(oauthGrants).where(eq(oauthGrants.id, row.grantId)).get();
    if (!grant || grant.clientId !== client.id) throw new OAuthError("invalid_grant", "Code was issued to another client");
    if (row.usedAt) {
      revokeGrantTokens(grant.id, false); // replayed code: kill whatever it produced
      throw new OAuthError("invalid_grant", "Authorization code already used");
    }
    db.update(oauthCodes).set({ usedAt: iso(Date.now()) }).where(eq(oauthCodes.codeHash, row.codeHash)).run();
    if (Date.parse(row.expiresAt) < Date.now()) throw new OAuthError("invalid_grant", "Authorization code expired");
    const redirect = form.get("redirect_uri");
    if (redirect && !redirectMatches(row.redirectUri, redirect)) throw new OAuthError("invalid_grant", "redirect_uri mismatch");
    if (!safeEqual(pkceChallenge(verifier), row.codeChallenge)) throw new OAuthError("invalid_grant", "PKCE verification failed");
    db.update(oauthClients).set({ lastUsedAt: iso(Date.now()) }).where(eq(oauthClients.id, client.id)).run();
    return issueTokens(activeGrant(grant.id));
  }
  if (grantType === "refresh_token") {
    const token = form.get("refresh_token");
    if (!token) throw new OAuthError("invalid_request", "refresh_token is required");
    const row = db.select().from(oauthTokens).where(and(eq(oauthTokens.tokenHash, hash(token)), eq(oauthTokens.kind, "refresh"))).get();
    if (!row) throw new OAuthError("invalid_grant", "Unknown refresh token");
    const grant = activeGrant(row.grantId);
    if (grant.clientId !== client.id) throw new OAuthError("invalid_grant", "Token was issued to another client");
    if (row.revokedAt) {
      revokeGrantTokens(grant.id, true); // refresh token reuse: assume theft, revoke the whole grant
      throw new OAuthError("invalid_grant", "Refresh token already used");
    }
    if (Date.parse(row.expiresAt) < Date.now()) throw new OAuthError("invalid_grant", "Refresh token expired");
    db.update(oauthTokens).set({ revokedAt: iso(Date.now()) }).where(eq(oauthTokens.tokenHash, row.tokenHash)).run();
    return issueTokens(grant);
  }
  throw new OAuthError("unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
}

/** POST /api/oauth/revoke: always succeeds for unknown tokens (RFC 7009 §2.2). */
export function revokeToken(form: URLSearchParams, authorization: string | null): void {
  const client = authenticateClient(form, authorization);
  const token = form.get("token");
  if (!token) return;
  const row = db.select({ t: oauthTokens, clientId: oauthGrants.clientId }).from(oauthTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthTokens.grantId)).where(eq(oauthTokens.tokenHash, hash(token))).get();
  if (!row || row.clientId !== client.id) return;
  if (row.t.kind === "refresh") revokeGrantTokens(row.t.grantId, false);
  else db.update(oauthTokens).set({ revokedAt: iso(Date.now()) }).where(eq(oauthTokens.tokenHash, row.t.tokenHash)).run();
}

/* ------------------------------------------------------------------ bearer resolution */

const lastTouched = new Map<string, number>();

/** Access token -> Actor (null when unknown, expired, revoked or the user is inactive). */
export function authenticate(token: string): Actor | null {
  if (!token.startsWith(ACCESS_PREFIX)) return null;
  const row = db.select({ t: oauthTokens, g: oauthGrants, u: users }).from(oauthTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthTokens.grantId)).innerJoin(users, eq(users.id, oauthGrants.userId))
    .where(and(eq(oauthTokens.tokenHash, hash(token)), eq(oauthTokens.kind, "access"))).get();
  if (!row || row.t.revokedAt || row.g.revokedAt || !row.u.isActive || Date.parse(row.t.expiresAt) < Date.now()) return null;
  const now = Date.now();
  if (now - (lastTouched.get(row.g.id) ?? 0) > 30_000) {
    lastTouched.set(row.g.id, now);
    db.update(oauthGrants).set({ lastUsedAt: iso(now) }).where(eq(oauthGrants.id, row.g.id)).run();
  }
  return {
    id: row.u.id, accountId: row.u.accountId, role: row.u.role, name: row.u.name, email: row.u.email, source: "api",
    token: { id: row.g.id, scopes: row.g.scopes, workspaceIds: row.g.workspaceIds, dailyBudget: null },
  };
}

/* ------------------------------------------------------------------ connected apps (UI) */

export interface ConnectedApp { id: string; clientId: string; clientName: string; userId: string; userName: string; scopes: TokenScope[]; workspaceIds: string[] | null; createdAt: string; lastUsedAt: string | null }

/** Active grants of the actor (admins with `all`: the whole account). */
export function listGrants(actor: Actor, opts: { all?: boolean } = {}): ConnectedApp[] {
  const all = opts.all && (actor.isSystem || actor.role === "admin");
  return db.select({ g: oauthGrants, clientName: oauthClients.name, userName: users.name }).from(oauthGrants)
    .innerJoin(oauthClients, eq(oauthClients.id, oauthGrants.clientId)).innerJoin(users, eq(users.id, oauthGrants.userId))
    .where(and(isNull(oauthGrants.revokedAt), eq(users.accountId, actor.accountId), all ? undefined : eq(oauthGrants.userId, actor.id)))
    .orderBy(desc(oauthGrants.createdAt)).all()
    .map((r) => ({ id: r.g.id, clientId: r.g.clientId, clientName: r.clientName, userId: r.g.userId, userName: r.userName, scopes: r.g.scopes, workspaceIds: r.g.workspaceIds, createdAt: r.g.createdAt, lastUsedAt: r.g.lastUsedAt }));
}

export function revokeGrant(actor: Actor, id: string): void {
  if (actor.token) throw new ForbiddenError("API tokens cannot revoke OAuth grants");
  const row = db.select({ g: oauthGrants, accountId: users.accountId, clientName: oauthClients.name }).from(oauthGrants)
    .innerJoin(users, eq(users.id, oauthGrants.userId)).innerJoin(oauthClients, eq(oauthClients.id, oauthGrants.clientId))
    .where(eq(oauthGrants.id, id)).get();
  const mayManage = row && row.accountId === actor.accountId && (row.g.userId === actor.id || actor.isSystem || actor.role === "admin");
  if (!row || !mayManage) throw new NotFoundError("OAuth grant");
  revokeGrantTokens(id, true);
  recordAudit(actor, "oauth.revoked", { targetType: "oauth_client", targetId: row.g.clientId, targetName: row.clientName, grantId: id });
}

