import { beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { freshCtx, type Ctx } from "../helpers";
import * as oauth from "../../src/server/services/oauth";
import { pkceChallenge } from "../../src/server/sso/oauth";
import { resolveBearer } from "../../src/lib/auth/bearer";
import "../../src/lib/auth/bearer-resolvers";
import { createMcpServer } from "../../src/server/mcp/server";
import { resetRateLimits } from "../../src/server/platform/rate-limit";
import { POST as tokenRoute } from "../../src/app/api/oauth/token/route";
import { POST as registerRoute } from "../../src/app/api/oauth/register/route";
import { POST as revokeRoute } from "../../src/app/api/oauth/revoke/route";
import { GET as asMetadata } from "../../src/app/.well-known/oauth-authorization-server/route";
import { GET as prMetadata } from "../../src/app/.well-known/oauth-protected-resource/[[...path]]/route";
import { POST as mcpRoute } from "../../src/app/api/mcp/route";
import { db } from "../../src/db/client";
import { users } from "../../src/db/schema/core";
import { eq } from "drizzle-orm";

let c: Ctx;
beforeEach(async () => {
  c = await freshCtx();
  process.env.APP_URL = "https://weekend.example.test";
  delete process.env.PUBLIC_URL;
});

const CLAUDE_CB = "https://claude.ai/api/mcp/auth_callback";
const verifier = "v".repeat(20) + "abcdefghijklmnopqrstuvwxyz0123456789";

function register(redirect = CLAUDE_CB, extra: Record<string, unknown> = {}) {
  return oauth.registerClient({ client_name: "Claude", redirect_uris: [redirect], ...extra });
}

function authorizeParams(clientId: string, over: Record<string, string> = {}) {
  return new URLSearchParams({
    client_id: clientId, redirect_uri: CLAUDE_CB, response_type: "code", code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256", state: "xyz", scope: "read write", resource: "https://weekend.example.test/api/mcp", ...over,
  });
}

function codeFor(clientId: string, approve: Record<string, unknown> = { scopes: ["read", "write"] }) {
  const url = new URL(oauth.approve(c.admin, oauth.parseAuthorizeRequest(authorizeParams(clientId)), approve));
  return url.searchParams.get("code")!;
}

const form = (o: Record<string, string>) => new URLSearchParams(o);
const exchange = (clientId: string, code: string, v = verifier) =>
  oauth.exchangeToken(form({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: v, redirect_uri: CLAUDE_CB }), null);

describe("oauth metadata", () => {
  it("advertises the endpoints under the configured issuer", async () => {
    const as = await (await asMetadata()).json();
    expect(as).toMatchObject({
      issuer: "https://weekend.example.test", authorization_endpoint: "https://weekend.example.test/oauth/authorize",
      token_endpoint: "https://weekend.example.test/api/oauth/token", registration_endpoint: "https://weekend.example.test/api/oauth/register",
      code_challenge_methods_supported: ["S256"],
    });
    const pr = await (await prMetadata()).json();
    expect(pr).toMatchObject({ resource: "https://weekend.example.test/api/mcp", authorization_servers: ["https://weekend.example.test"] });
  });

  it("the MCP endpoint points unauthenticated clients at the resource metadata", async () => {
    const res = await mcpRoute(new Request("http://localhost/api/mcp", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain('resource_metadata="https://weekend.example.test/.well-known/oauth-protected-resource/api/mcp"');
  });
});

describe("client registration", () => {
  it("accepts Claude and loopback redirect URIs, refuses others", async () => {
    expect(register().client_id).toMatch(/^mnc_/);
    expect(register("http://localhost:53682/callback").token_endpoint_auth_method).toBe("none");
    expect(() => register("https://evil.example.com/cb")).toThrow(oauth.OAuthError);
    expect(() => register("http://claude.ai/cb")).toThrow(/not allowed/);
    const res = await registerRoute(new Request("http://x/api/oauth/register", { method: "POST", body: JSON.stringify({ redirect_uris: ["https://evil.example.com"] }) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_redirect_uri");
  });

  it("issues a secret to confidential clients and requires it at the token endpoint", () => {
    const reg = register(CLAUDE_CB, { token_endpoint_auth_method: "client_secret_post" });
    expect(reg.client_secret).toBeTruthy();
    const code = codeFor(reg.client_id);
    expect(() => exchange(reg.client_id, code)).toThrow(/Client authentication failed/);
    const ok = oauth.exchangeToken(form({ grant_type: "authorization_code", client_id: reg.client_id, client_secret: reg.client_secret!, code, code_verifier: verifier }), null);
    expect(ok.access_token).toMatch(/^mno_at_/);
  });
});

describe("authorization code flow", () => {
  it("rejects bad requests: unknown client and redirect are fatal, the rest redirect back", () => {
    const { client_id } = register();
    expect(() => oauth.parseAuthorizeRequest(authorizeParams("nope"))).toThrow(oauth.AuthorizeFatalError);
    expect(() => oauth.parseAuthorizeRequest(authorizeParams(client_id, { redirect_uri: "https://claude.ai/other" }))).toThrow(oauth.AuthorizeFatalError);
    expect(() => oauth.parseAuthorizeRequest(authorizeParams(client_id, { code_challenge_method: "plain" }))).toThrow(oauth.OAuthError);
    expect(() => oauth.parseAuthorizeRequest(authorizeParams(client_id, { code_challenge: "" }))).toThrow(/PKCE/);
    expect(() => oauth.parseAuthorizeRequest(authorizeParams(client_id, { resource: "https://other.test/mcp" }))).toThrow(/resource/);
    const back = new URL(oauth.errorRedirect(oauth.resolveClientRedirect(authorizeParams(client_id)), "access_denied"));
    expect(back.origin + back.pathname).toBe(CLAUDE_CB);
    expect(back.searchParams.get("state")).toBe("xyz");
  });

  it("approve -> code -> tokens -> Actor with the granted scopes", async () => {
    const { client_id } = register();
    const url = new URL(oauth.approve(c.admin, oauth.parseAuthorizeRequest(authorizeParams(client_id)), { scopes: ["read"] }));
    expect(url.searchParams.get("state")).toBe("xyz");
    expect(url.searchParams.get("iss")).toBe("https://weekend.example.test");
    const tok = exchange(client_id, url.searchParams.get("code")!);
    expect(tok).toMatchObject({ token_type: "Bearer", expires_in: oauth.ACCESS_TTL_SECONDS, scope: "read" });
    const actor = await resolveBearer(tok.access_token);
    expect(actor?.id).toBe(c.admin.id);
    expect(actor?.token?.scopes).toEqual(["read"]);
    expect(oauth.listGrants(c.admin)).toHaveLength(1);
  });

  it("refuses a wrong PKCE verifier and a replayed code (which also kills its tokens)", async () => {
    const { client_id } = register();
    expect(() => exchange(client_id, codeFor(client_id), "w".repeat(50))).toThrow(/PKCE/);
    const code = codeFor(client_id);
    const tok = exchange(client_id, code);
    expect(() => exchange(client_id, code)).toThrow(/already used/);
    expect(await resolveBearer(tok.access_token)).toBeNull();
  });

  it("refuses a code issued to another client", () => {
    const a = register(), b = register();
    expect(() => exchange(b.client_id, codeFor(a.client_id))).toThrow(/another client/);
  });

  it("does not let the user widen scopes beyond the request", () => {
    const { client_id } = register();
    const req = oauth.parseAuthorizeRequest(authorizeParams(client_id, { scope: "read" }));
    const code = new URL(oauth.approve(c.admin, req, { scopes: ["read", "write"] })).searchParams.get("code")!;
    expect(exchange(client_id, code).scope).toBe("read");
  });

  it("restricts the grant to a workspace", async () => {
    const { client_id } = register();
    const tok = exchange(client_id, codeFor(client_id, { scopes: ["read", "write"], workspaceIds: [c.workspaceId] }));
    expect((await resolveBearer(tok.access_token))?.token?.workspaceIds).toEqual([c.workspaceId]);
  });

  it("token actors cannot approve clients", () => {
    const { client_id } = register();
    const req = oauth.parseAuthorizeRequest(authorizeParams(client_id));
    expect(() => oauth.approve({ ...c.admin, token: { id: "x", scopes: ["read", "write"], workspaceIds: null, dailyBudget: null } }, req, {})).toThrow(/signed-in user/);
  });
});

describe("refresh, revoke, deactivate", () => {
  it("rotates refresh tokens and revokes the grant on refresh token reuse", async () => {
    const { client_id } = register();
    const first = exchange(client_id, codeFor(client_id));
    const second = oauth.exchangeToken(form({ grant_type: "refresh_token", client_id, refresh_token: first.refresh_token }), null);
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(await resolveBearer(second.access_token)).not.toBeNull();
    expect(() => oauth.exchangeToken(form({ grant_type: "refresh_token", client_id, refresh_token: first.refresh_token }), null)).toThrow(/already used/);
    expect(await resolveBearer(second.access_token)).toBeNull();
    expect(oauth.listGrants(c.admin)).toHaveLength(0);
  });

  it("revocation endpoint and Connected apps revoke access", async () => {
    const { client_id } = register();
    const tok = exchange(client_id, codeFor(client_id));
    const res = await revokeRoute(new Request("http://x/api/oauth/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ client_id, token: tok.access_token }).toString() }));
    expect(res.status).toBe(200);
    expect(await resolveBearer(tok.access_token)).toBeNull();

    const tok2 = exchange(client_id, codeFor(client_id));
    const grant = oauth.listGrants(c.admin)[0];
    expect(() => oauth.revokeGrant(c.member, grant.id)).toThrow(/not found/i);
    oauth.revokeGrant(c.admin, grant.id);
    expect(await resolveBearer(tok2.access_token)).toBeNull();
    expect(() => oauth.exchangeToken(form({ grant_type: "refresh_token", client_id, refresh_token: tok2.refresh_token }), null)).toThrow(oauth.OAuthError);
  });

  it("deactivated users lose access", async () => {
    const { client_id } = register();
    const tok = exchange(client_id, codeFor(client_id));
    db.update(users).set({ isActive: false }).where(eq(users.id, c.admin.id)).run();
    expect(await resolveBearer(tok.access_token)).toBeNull();
  });

  it("token route speaks RFC 6749 errors with no-store", async () => {
    const res = await tokenRoute(new Request("http://x/api/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=password&client_id=nope" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).error).toBe("invalid_client");
  });
});

describe("MCP with an OAuth token", () => {
  it("read-only grants cannot call write tools", async () => {
    resetRateLimits();
    const { client_id } = register();
    const tok = exchange(client_id, codeFor(client_id, { scopes: ["read"] }));
    const actor = (await resolveBearer(tok.access_token))!;
    const server = createMcpServer(actor);
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const ctx = await client.callTool({ name: "get_user_context", arguments: {} });
    expect(ctx.isError).toBeFalsy();
    const write = await client.callTool({ name: "create_item", arguments: { boardId: c.boardId, name: "x" } });
    expect(write.isError).toBe(true);
    expect(JSON.stringify(write.content)).toMatch(/write scope/);
    await client.close();
  });
});
