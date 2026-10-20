import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { wisprConnections } from "../../src/db/schema/wispr";
import { docs } from "../../src/db/schema/docs";
import { setWisprFetch } from "../../src/server/wispr/client";
import { argsFor, meetingsArray, toDetail, toSummary } from "../../src/server/wispr/normalize";
import * as wispr from "../../src/server/services/wispr";
import * as items from "../../src/server/services/items";
import * as updates from "../../src/server/services/updates";
import * as notetaker from "../../src/server/services/notetaker";
import { freshCtx, type Ctx } from "../helpers";

const MCP = "https://api.wisprflow.ai/connect/mcp";
const AS = "https://mcp-auth.wisprflow.com";

const MEETINGS = [
  { meeting_id: "m1", title: "Klantoverleg Bravo", start_time: "2026-10-06T09:00:00Z", attendees: [{ name: "Admin" }, { name: "Jan", email: "jan@bravo.example" }], summary: "Planning besproken." },
  { meeting_id: "m2", title: "Tandarts", start_time: "2026-10-05T14:00:00Z", attendees: [] },
];

/** Fake Wispr: discovery, DCR, token endpoint and an MCP server that answers over SSE. */
function fakeWispr(log: { calls: { name: string; args: Record<string, unknown> }[]; tokenBodies: URLSearchParams[] }) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...headers } });
    if (url === "https://api.wisprflow.ai/.well-known/oauth-protected-resource") return json({ resource: MCP, authorization_servers: [AS] });
    if (url === `${AS}/.well-known/oauth-authorization-server`) return json({ issuer: AS, authorization_endpoint: `${AS}/oauth2/authorize`, token_endpoint: `${AS}/oauth2/token`, registration_endpoint: `${AS}/oauth2/register` });
    if (url === `${AS}/oauth2/register`) return json({ client_id: "client-123" }, 201);
    if (url === `${AS}/oauth2/token`) {
      const body = new URLSearchParams(String(init?.body));
      log.tokenBodies.push(body);
      return json({ access_token: `at-${log.tokenBodies.length}`, refresh_token: "rt-1", expires_in: 3600 });
    }
    if (url === MCP) {
      const auth = new Headers(init?.headers).get("authorization");
      if (!auth?.startsWith("Bearer at-")) return json({ error: "invalid_token" }, 401);
      const msg = JSON.parse(String(init?.body)) as { id?: number; method: string; params: { name: string; arguments: Record<string, unknown> } };
      if (msg.id === undefined) return new Response(null, { status: 202 });
      let result: unknown = {};
      if (msg.method === "initialize") result = { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "wispr" } };
      if (msg.method === "tools/list") result = { tools: [{ name: "search_meetings", inputSchema: { properties: { query: {}, limit: {} } } }, { name: "get_meeting", inputSchema: { properties: { meeting_id: {}, include_transcript: {} } } }, { name: "get_account_info", inputSchema: {} }] };
      if (msg.method === "tools/call") {
        log.calls.push({ name: msg.params.name, args: msg.params.arguments });
        const payload = msg.params.name === "search_meetings" ? { meetings: MEETINGS }
          : msg.params.name === "get_meeting" ? { meeting: { ...MEETINGS[0], notes: "Actie: Planner stuurt offerte\nBesluit: livegang 1 november" }, transcript: [{ speaker: "Admin", text: "Zullen we starten?" }, { speaker: "Jan", text: "Ja." }] }
          : { name: "Admin Wispr", email: "admin@example.com" };
        result = { content: [{ type: "text", text: JSON.stringify(payload) }] };
      }
      const sse = `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result })}\n\n`;
      return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream", "mcp-session-id": "sess-1" } });
    }
    return json({ error: "not found" }, 404);
  }) as typeof fetch;
}

let c: Ctx;
let log: { calls: { name: string; args: Record<string, unknown> }[]; tokenBodies: URLSearchParams[] };

async function connect(actor = c.admin) {
  const url = new URL(await wispr.startConnect(actor));
  await wispr.finishConnect(actor, { code: "code-1", state: url.searchParams.get("state") });
  return url;
}

beforeEach(async () => {
  c = await freshCtx();
  log = { calls: [], tokenBodies: [] };
  setWisprFetch(fakeWispr(log));
});
afterEach(() => setWisprFetch(null));

describe("wispr normalize", () => {
  it("reads common field variants", () => {
    const [a] = meetingsArray({ results: [{ id: 7, name: "X", started_at: 1_760_000_000, participants: ["A", { display_name: "B" }] }] }).map(toSummary);
    expect(a).toMatchObject({ externalId: "7", title: "X", attendees: ["A", "B"] });
    expect(a!.startedAt).toMatch(/^2025-/);
    const d = toDetail({ notes_markdown: "n", transcript: [{ speaker: "A", text: "hi" }] }, a!);
    expect(d).toMatchObject({ notes: "n", transcript: "A: hi", title: "X" });
  });
  it("only sends declared tool arguments", () => {
    expect(argsFor({ name: "t", inputSchema: { properties: { max_results: {} } } }, { limit: 5, other: 1 }, { limit: ["max_results"] })).toEqual({ max_results: 5 });
  });
});

describe("wispr service", () => {
  it("connects with PKCE, dynamic registration and the resource indicator", async () => {
    const url = await connect();
    expect(url.origin + url.pathname).toBe(`${AS}/oauth2/authorize`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("resource")).toBe(MCP);
    const tb = log.tokenBodies[0];
    expect(tb.get("grant_type")).toBe("authorization_code");
    expect(tb.get("code_verifier")).toBeTruthy();
    expect(tb.get("resource")).toBe(MCP);
    const st = wispr.status(c.admin);
    expect(st).toMatchObject({ connected: true, label: "Admin Wispr" });
    // tokens are sealed at rest
    const row = db.select().from(wisprConnections).where(eq(wisprConnections.userId, c.admin.id)).get()!;
    expect(row.accessToken).not.toContain("at-1");
    expect(row.pendingState).toBeNull();
  });

  it("rejects a wrong state", async () => {
    await wispr.startConnect(c.admin);
    await expect(wispr.finishConnect(c.admin, { code: "x", state: "forged" })).rejects.toThrow(/ongeldig/);
    expect(wispr.status(c.admin).connected).toBe(false);
  });

  it("syncs meetings, keeps decisions and keeps them private per user", async () => {
    await connect();
    expect(await wispr.sync(c.admin)).toEqual({ fetched: 2, added: 2 });
    const tandarts = wispr.list(c.admin).find((m) => m.title === "Tandarts")!;
    wispr.setPersonal(c.admin, tandarts.id, true);
    expect(await wispr.sync(c.admin)).toEqual({ fetched: 2, added: 0 });
    expect(wispr.list(c.admin, { status: "new" }).map((m) => m.title)).toEqual(["Klantoverleg Bravo"]);
    expect(wispr.list(c.admin, { status: "personal" }).map((m) => m.title)).toEqual(["Tandarts"]);
    expect(log.calls.find((x) => x.name === "search_meetings")!.args).toEqual({ limit: 50 });
    // another user cannot see or touch them
    expect(wispr.list(c.member)).toEqual([]);
    expect(() => wispr.setPersonal(c.member, tandarts.id, false)).toThrow();
  });

  it("saves a meeting into a workspace + item: notetaker meeting, report doc and item update", async () => {
    await connect();
    await wispr.sync(c.admin);
    const m = wispr.list(c.admin).find((x) => x.externalId === "m1")!;
    const item = items.create(c.admin, { boardId: c.boardId, name: "Project Bravo" });
    const saved = await wispr.save(c.admin, m.id, { workspaceId: c.workspaceId, itemId: item.id });
    expect(saved).toMatchObject({ status: "saved", workspaceId: c.workspaceId, boardId: c.boardId, itemId: item.id });
    const nm = notetaker.get(c.admin, saved.meetingId!);
    expect(nm.transcript).toContain("Admin: Zullen we starten?");
    expect(nm.actionItems.map((a) => a.text)).toContain("Planner stuurt offerte");
    expect(db.select().from(docs).where(eq(docs.id, saved.docId!)).get()?.workspaceId).toBe(c.workspaceId);
    expect(updates.list(c.admin, item.id)[0].body).toContain("Klantoverleg Bravo");
    expect(() => wispr.setPersonal(c.admin, m.id, true)).toThrow(/al opgeslagen/);
  });

  it("refuses a board from another workspace and blocks guests", async () => {
    await connect();
    await wispr.sync(c.admin);
    const m = wispr.list(c.admin)[0];
    const other = (await import("../../src/server/services/workspaces")).list(c.sys).find((w) => w.id !== c.workspaceId)!;
    await expect(wispr.save(c.admin, m.id, { workspaceId: other.id, boardId: c.boardId })).rejects.toThrow(/workspace/);
    expect(() => wispr.status(c.guest)).toThrow();
  });

  it("refreshes an expiring token", async () => {
    await connect();
    db.update(wisprConnections).set({ expiresAt: new Date(Date.now() + 1000).toISOString() }).run();
    await wispr.sync(c.admin);
    expect(log.tokenBodies.at(-1)!.get("grant_type")).toBe("refresh_token");
  });
});
