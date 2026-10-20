import { beforeEach, describe, expect, it } from "vitest";
import { platformCtx, type PCtx } from "./helpers";
import * as apiTokens from "../../src/server/services/api-tokens";
import { handleGraphql } from "../../src/server/graphql/server";
import { resetRateLimits } from "../../src/server/platform/rate-limit";
import { resolveBearer } from "../../src/lib/auth/bearer";
import { patchSettings } from "../../src/server/services/account-settings";
import { db } from "../../src/db/client";
import { apiTokens as tokensTable } from "../../src/db/schema/api-tokens";

let c: PCtx;
beforeEach(async () => { c = await platformCtx(); });

const post = (headers: Record<string, string>, query = "{ me { id } }") =>
  handleGraphql(new Request("http://localhost/api/graphql", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ query }) }));

describe("api tokens", () => {
  it("are stored hashed, shown once, and resolve to the owner", () => {
    const { token, row } = apiTokens.create(c.admin, { name: "CI", scopes: ["read"] });
    expect(token).toMatch(/^wkd_[A-Za-z0-9_-]{30,}$/);
    const stored = db.select().from(tokensTable).all().find((t) => t.id === row.id)!;
    expect(stored.tokenHash).not.toContain(token);
    expect(stored.tokenHash).toHaveLength(64);
    expect(stored.tokenPrefix).toBe(token.slice(0, 8));
    expect(JSON.stringify(apiTokens.list(c.admin))).not.toContain(stored.tokenHash);
    const actor = apiTokens.authenticate(token)!;
    expect(actor.id).toBe(c.admin.id);
    expect(actor.token).toMatchObject({ scopes: ["read"], workspaceIds: null });
    expect(apiTokens.list(c.admin)[0].lastUsedAt).toBeTruthy();
  });

  it("accepts the raw token  and Bearer, rejects unknown / revoked / expired tokens", async () => {
    const { token, row } = apiTokens.create(c.admin, { name: "t" });
    expect((await post({ authorization: token })).status).toBe(200);
    expect((await post({ authorization: `Bearer ${token}` })).status).toBe(200);
    const bad = await post({ authorization: "wkd_doesnotexistdoesnotexist" });
    expect(bad.status).toBe(401);
    expect((await bad.json()).error_code).toBe("UserUnauthorizedException");
    expect((await post({})).status).toBe(401);
    apiTokens.revoke(c.admin, row.id);
    expect((await post({ authorization: token })).status).toBe(401);
    expect(await resolveBearer(token)).toBeNull();
    const exp = apiTokens.create(c.admin, { name: "short", expiresInDays: 1 });
    db.update(tokensTable).set({ expiresAt: "2020-01-01T00:00:00.000Z" }).run();
    expect(apiTokens.authenticate(exp.token)).toBeNull();
  });

  it("users only see and revoke their own tokens; admins can see all", () => {
    const mine = apiTokens.create(c.admin, { name: "admin token" });
    const other = apiTokens.create(c.member, { name: "member token" });
    expect(apiTokens.list(c.member).map((t) => t.id)).toEqual([other.row.id]);
    expect(apiTokens.list(c.admin, { all: true }).map((t) => t.id)).toEqual(expect.arrayContaining([mine.row.id, other.row.id]));
    expect(() => apiTokens.revoke(c.member, mine.row.id)).toThrow();
    expect(() => apiTokens.create({ ...c.member, token: { id: "1", scopes: ["write"], workspaceIds: null, dailyBudget: null } }, { name: "x" })).toThrow();
  });

  it("a locked account (panic button) refuses all tokens", async () => {
    const { token } = apiTokens.create(c.admin, { name: "lock test" });
    expect((await post({ authorization: token })).status).toBe(200);
    patchSettings(c.accountId, (st) => { st.security.panic = { lockedAt: new Date().toISOString(), lockedBy: c.admin.id, recoveryHash: "x" }; });
    expect((await post({ authorization: token })).status).toBe(401);
    patchSettings(c.accountId, (st) => { st.security.panic = null; });
    expect((await post({ authorization: token })).status).toBe(200);
  });

  it("read scope blocks mutations, write scope allows them", async () => {
    const ro = c.mkToken(c.admin, { scopes: ["read"] });
    const denied = await c.gql(`mutation { create_item(board_id: ${c.boardId}, item_name: "x") { id } }`, undefined, { token: ro });
    expect(denied.errors?.[0].extensions.code).toBe("UserUnauthorizedException");
    expect(denied.errors?.[0].message).toMatch(/write scope/);
    const read = await c.gql(`{ boards(ids: [${c.boardId}]) { name } }`, undefined, { token: ro });
    expect(read.errors).toBeUndefined();
    const rw = c.mkToken(c.admin, { scopes: ["write"] });
    const ok = await c.gql(`mutation { create_item(board_id: ${c.boardId}, item_name: "x") { id } }`, undefined, { token: rw });
    expect(ok.errors).toBeUndefined();
  });

  it("workspace-scoped tokens only reach their workspaces", async () => {
    const other = Object.values(c.workspaceIds).find((id) => id !== c.workspaceId)!;
    const t = c.mkToken(c.admin, { workspaceIds: [other] });
    const ws = await c.gql(`{ workspaces { id } boards(ids: [${c.boardId}]) { id } }`, undefined, { token: t });
    expect(ws.data.workspaces.map((w: { id: string }) => w.id)).toEqual([other]);
    expect(ws.data.boards).toEqual([]);
    const m = await c.gql(`mutation { create_item(board_id: ${c.boardId}, item_name: "x") { id } }`, undefined, { token: t });
    expect(m.errors?.[0].message).toMatch(/restricted/);
    const it = (await c.gql(`mutation { create_item(board_id: ${c.boardId}, item_name: "y") { id } }`)).data.create_item.id;
    const byItem = await c.gql(`{ items(ids: [${it}]) { id } }`, undefined, { token: t });
    expect(byItem.data.items).toEqual([]);
  });

  it("session users are never restricted by token scope and can use the API with cookie-less actors", async () => {
    const r = await c.gql(`{ me { id } }`);
    expect(r.data.me.id).toBe(c.admin.id);
  });
});

describe("rate limits and complexity", () => {
  it("rejects queries above API_MAX_COMPLEXITY with ComplexityException", async () => {
    process.env.API_MAX_COMPLEXITY = "50";
    try {
      const r = await c.gql(`{ boards(limit: 50) { id items_page(limit: 100) { items { id name } } } }`);
      expect(r.errors?.[0].extensions.code).toBe("ComplexityException");
      expect(r.status).toBe(400);
    } finally { delete process.env.API_MAX_COMPLEXITY; }
  });

  it("enforces the per-token daily budget and reports DAILY_LIMIT_EXCEEDED with Retry-After", async () => {
    const t = c.mkToken(c.admin, { dailyBudget: 1000 });
    const q = `{ boards(limit: 100) { id items_page(limit: 50) { items { id } } } }`; // cost > 5000
    const first = await c.gql(`{ me { id } }`, undefined, { token: t });
    expect(first.errors).toBeUndefined();
    const big = await c.gql(q, undefined, { token: t });
    expect(big.errors?.[0].extensions.code).toBe("DAILY_LIMIT_EXCEEDED");
    expect(big.status).toBe(429);
    expect(big.headers.get("retry-after")).toBeTruthy();
    // usage is tracked per token
    const usage = apiTokens.usageToday(apiTokens.list(c.admin).find((x) => x.name === "test" && x.dailyBudget === 1000)!.id);
    expect(usage.used).toBeGreaterThan(0);
  });

  it("enforces the per-minute budget and request limit, and resets after the window", async () => {
    process.env.API_REQUESTS_PER_MINUTE = "3";
    try {
      const t = c.mkToken(c.admin);
      for (let i = 0; i < 3; i++) expect((await c.gql(`{ me { id } }`, undefined, { token: t })).errors).toBeUndefined();
      const r = await c.gql(`{ me { id } }`, undefined, { token: t });
      expect(r.errors?.[0].extensions.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(r.status).toBe(429);
      resetRateLimits();
      expect((await c.gql(`{ me { id } }`, undefined, { token: t })).errors).toBeUndefined();
    } finally { delete process.env.API_REQUESTS_PER_MINUTE; }
    process.env.API_MINUTE_BUDGET = "60";
    try {
      const t2 = c.mkToken(c.admin);
      const r = await c.gql(`{ boards(limit: 10) { id items_page(limit: 5) { items { id } } } }`, undefined, { token: t2 });
      expect(r.errors?.[0].extensions.code).toBe("COMPLEXITY_BUDGET_EXHAUSTED");
    } finally { delete process.env.API_MINUTE_BUDGET; }
  });

  it("enforces a maximum query depth", async () => {
    process.env.API_MAX_DEPTH = "3";
    try {
      const r = await c.gql(`{ boards(limit: 1) { items_page { items { board { id } } } } }`);
      expect(r.errors?.[0].extensions.code).toBe("ComplexityException");
      expect(r.errors?.[0].message).toMatch(/depth/);
    } finally { delete process.env.API_MAX_DEPTH; }
  });

  it("introspection and get_schema work; mutations/queries land in the audit trail", async () => {
    const r = await c.gql(`{ __schema { queryType { name } mutationType { name } } __type(name: "Item") { fields { name } } }`);
    expect(r.data.__schema.queryType.name).toBe("Query");
    expect(r.data.__type.fields.map((f: { name: string }) => f.name)).toEqual(expect.arrayContaining(["id", "name", "column_values", "subitems", "updates"]));
    await c.gql(`mutation { create_item(board_id: ${c.boardId}, item_name: "audited") { id } }`);
    const calls = apiTokens.listCalls(c.admin, { channel: "graphql" });
    expect(calls.map((x) => x.name)).toContain("mutation:create_item");
  });
});
