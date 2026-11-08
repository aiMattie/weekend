import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { freshCtx, type Ctx } from "../helpers";
import * as apiTokens from "../../src/server/services/api-tokens";
import * as oauth from "../../src/server/services/oauth";
import "../../src/lib/auth/bearer-resolvers";
import { resetRateLimits } from "../../src/server/platform/rate-limit";
import { BUNDLE_ENTRY, claudeConnectOptions, renderBundle, renderBundleManifest, zip } from "../../src/server/mcp/desktop-extension";
import { GET as downloadRoute } from "../../src/app/api/v1/claude-desktop/route";
import { DELETE as mcpDelete, GET as mcpGet, POST as mcpPost } from "../../src/app/api/mcp/route";
import { POST as registerRoute } from "../../src/app/api/oauth/register/route";
import { POST as tokenRoute } from "../../src/app/api/oauth/token/route";
import { GET as asMetadata } from "../../src/app/.well-known/oauth-authorization-server/route";
import { GET as prMetadata } from "../../src/app/.well-known/oauth-protected-resource/[[...path]]/route";
import { buildProxy } from "../../scripts/build-desktop-extension.mjs";

/** Minimal zip reader (central directory, no zip64) so the test does not trust the writer. */
function readZip(buf: Buffer): Map<string, { method: number; data: Buffer }> {
  const end = buf.length - 22;
  expect(buf.readUInt32LE(end)).toBe(0x06054b50);
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = new Map<string, { method: number; data: Buffer }>();
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    expect(buf.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const body = buf.subarray(start, start + compressed);
    const data = method === 8 ? zlib.inflateRawSync(body) : Buffer.from(body);
    expect(data.length).toBe(size);
    out.set(name, { method, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

describe("desktop extension bundle", () => {
  it("renders a manifest with the address built in and no token", () => {
    const m = renderBundleManifest({ url: "https://jani.example.test/", version: "1.0.0" }) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(m.manifest_version).toBe("0.3");
    expect(m.name).toBe("weekend");
    expect(m.display_name).toBe("Weekend (jani.example.test)");
    expect(m.server.entry_point).toBe(BUNDLE_ENTRY);
    expect(m.server.mcp_config.args).toEqual(["${__dirname}/" + BUNDLE_ENTRY]);
    expect(m.server.mcp_config.env).toEqual({ WEEKEND_URL: "https://jani.example.test/api/mcp", WEEKEND_TOKEN: "" });
    expect(m.user_config).toBeUndefined();
    expect(renderBundleManifest({ url: "http://localhost:3058/api/mcp", version: "1.0.0" })).toMatchObject({ server: { mcp_config: { env: { WEEKEND_URL: "http://localhost:3058/api/mcp" } } } });
    expect(() => renderBundleManifest({ url: "ftp://x", version: "1.0.0" })).toThrow(/bundle url/);
    expect(() => renderBundleManifest({ url: "https://x.y/a b", version: "1.0.0" })).toThrow(/bundle url/);
    expect(() => renderBundleManifest({ url: "https://x.y", version: "latest" })).toThrow(/semver/);
  });

  it("writes a zip that a plain reader can open", () => {
    const text = Buffer.from("hello ".repeat(200), "utf8");
    const noise = crypto.randomBytes(512);
    const entries = readZip(zip([{ name: "a/text.txt", data: text }, { name: "noise.bin", data: noise }], new Date(2026, 10, 2, 12, 0, 0)));
    expect([...entries.keys()]).toEqual(["a/text.txt", "noise.bin"]);
    expect(entries.get("a/text.txt")!.method).toBe(8);
    expect(entries.get("a/text.txt")!.data.equals(text)).toBe(true);
    expect(entries.get("noise.bin")!.method).toBe(0);
    expect(entries.get("noise.bin")!.data.equals(noise)).toBe(true);
    expect(() => zip([{ name: "../x", data: text }])).toThrow(/entry name/);
  });

  it("packs the manifest and the proxy", () => {
    const proxy = Buffer.from("console.log(1)\n");
    const entries = readZip(renderBundle({ url: "http://weekend.internal:3058", version: "1.2.3" }, proxy));
    const manifest = JSON.parse(entries.get("manifest.json")!.data.toString("utf8"));
    expect(manifest.version).toBe("1.2.3");
    expect(manifest.server.mcp_config.env.WEEKEND_URL).toBe("http://weekend.internal:3058/api/mcp");
    expect(entries.get(BUNDLE_ENTRY)!.data.equals(proxy)).toBe(true);
  });
});

describe("desktop extension download and card options", () => {
  let c: Ctx;
  let dir: string;
  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "weekend-desktop-")); });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.DESKTOP_PROXY_FILE;
    delete process.env.OAUTH_REDIRECT_HOSTS;
  });
  beforeEach(async () => {
    c = await freshCtx();
    resetRateLimits();
    process.env.APP_URL = "https://jani.example.test";
    delete process.env.PUBLIC_URL;
    delete process.env.OAUTH_REDIRECT_HOSTS;
  });

  const download = (token: string) =>
    downloadRoute(new NextRequest("http://localhost/api/v1/claude-desktop", { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({}) });

  it("serves the extension for this environment to a signed-in user", async () => {
    const proxy = path.join(dir, "index.mjs");
    fs.writeFileSync(proxy, "console.log('proxy')\n");
    process.env.DESKTOP_PROXY_FILE = proxy;
    const { token } = apiTokens.create(c.member, { name: "desktop-download" });
    const res = await download(token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain("weekend.mcpb");
    const entries = readZip(Buffer.from(await res.arrayBuffer()));
    expect(JSON.parse(entries.get("manifest.json")!.data.toString("utf8")).server.mcp_config.env.WEEKEND_URL).toBe("https://jani.example.test/api/mcp");
    expect(entries.get(BUNDLE_ENTRY)!.data.equals(fs.readFileSync(proxy))).toBe(true);
    expect((await download("wkd_" + "x".repeat(40))).status).toBe(401);
  });

  it("is off, and says so, when the proxy was not built", async () => {
    process.env.DESKTOP_PROXY_FILE = path.join(dir, "missing.mjs");
    expect(claudeConnectOptions().desktop).toBe(false);
    const { token } = apiTokens.create(c.member, { name: "desktop-download" });
    const res = await download(token);
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toMatch(/build:desktop/);
  });

  it("offers claude.ai's connector only while claude.ai may sign in", () => {
    expect(claudeConnectOptions().connector).toBe(true);
    process.env.OAUTH_REDIRECT_HOSTS = "";
    expect(claudeConnectOptions().connector).toBe(false);
    expect(oauth.isAllowedRedirectUri("http://127.0.0.1:43123/callback")).toBe(true);
  });
});

describe("desktop extension proxy", () => {
  let c: Ctx;
  let dir: string;
  let proxyFile: string;
  let server: http.Server;
  let baseUrl: string;

  /** Weekend's MCP and OAuth route handlers behind a plain HTTP server, as the proxy sees them. */
  function handler(pathname: string, method: string): ((req: Request) => Response | Promise<Response>) | null {
    if (pathname === "/api/mcp") return method === "GET" ? mcpGet : method === "DELETE" ? mcpDelete : mcpPost;
    if (pathname.startsWith("/.well-known/oauth-protected-resource")) return () => prMetadata();
    if (pathname === "/.well-known/oauth-authorization-server") return () => asMetadata();
    if (pathname === "/api/oauth/register" && method === "POST") return registerRoute;
    if (pathname === "/api/oauth/token" && method === "POST") return tokenRoute;
    return null;
  }

  beforeAll(async () => {
    c = await freshCtx();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "weekend-proxy-"));
    proxyFile = await buildProxy(path.join(dir, "index.mjs"));
    server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const url = new URL(req.url ?? "/", baseUrl);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
      const method = req.method ?? "GET";
      const body = method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks);
      const route = handler(url.pathname, method);
      const response = route ? await route(new Request(url, { method, headers, body })) : new Response("not found", { status: 404 });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // The OAuth metadata names the issuer, so it must be the address the proxy talks to.
    process.env.APP_URL = baseUrl;
    delete process.env.PUBLIC_URL;
    delete process.env.OAUTH_REDIRECT_HOSTS;
  }, 60_000);
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  beforeEach(() => resetRateLimits());

  /** Starts the proxy as Claude Desktop does; the sign-in address it would open appears on stderr. */
  function start(env: Record<string, string>): { transport: StdioClientTransport; signInUrl: Promise<string> } {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [proxyFile],
      env: { ...getDefaultEnvironment(), WEEKEND_URL: baseUrl, WEEKEND_BROWSER: "stderr", ...env },
      stderr: "pipe",
    });
    const signInUrl = new Promise<string>((resolve) => {
      let seen = "";
      transport.stderr!.on("data", (chunk: Buffer) => {
        seen += chunk.toString("utf8");
        const m = /sign in at (\S+)/.exec(seen);
        if (m) resolve(m[1]);
      });
    });
    return { transport, signInUrl };
  }

  /** What the person does in the browser: open the consent page, Allow, land on 127.0.0.1. */
  async function allow(signInUrl: string): Promise<string> {
    const u = new URL(signInUrl);
    expect(u.origin + u.pathname).toBe(`${baseUrl}/oauth/authorize`);
    const back = new URL(oauth.approve(c.admin, oauth.parseAuthorizeRequest(u.searchParams), { scopes: ["read", "write"] }));
    expect(back.hostname).toBe("127.0.0.1");
    expect(back.pathname).toBe("/callback");
    return (await fetch(back)).text();
  }

  async function workspaceNames(client: Client): Promise<string> {
    const result = await client.callTool({ name: "list_workspaces", arguments: {} });
    expect(result.isError).toBeFalsy();
    return (result.content as { text?: string }[]).map((x) => x.text ?? "").join("\n");
  }

  it("forwards Claude Desktop to Weekend over stdio with an API token", async () => {
    const { token } = apiTokens.create(c.admin, { name: "desktop-proxy", scopes: ["read"] });
    const client = new Client({ name: "desktop-test", version: "0" });
    await client.connect(start({ WEEKEND_TOKEN: token }).transport);
    try {
      expect((await client.listTools()).tools.some((t) => t.name === "list_workspaces")).toBe(true);
      expect(await workspaceNames(client)).toContain("Delivery");
    } finally {
      await client.close();
    }
  });

  it("reports a rejected token as an error instead of hanging", async () => {
    const client = new Client({ name: "desktop-test", version: "0" });
    await expect(client.connect(start({ WEEKEND_TOKEN: "wkd_" + "x".repeat(40) }).transport)).rejects.toThrow(/HTTP 401/);
    await client.close();
  });

  it("signs in through the browser once and keeps the login", async () => {
    const store = path.join(dir, "oauth.json");
    const first = start({ WEEKEND_OAUTH_STORE: store });
    const client = new Client({ name: "desktop-test", version: "0" });
    const connected = client.connect(first.transport);
    expect(await allow(await first.signInUrl)).toContain("Gekoppeld");
    await connected;
    try {
      expect(await workspaceNames(client)).toContain("Delivery");
    } finally {
      await client.close();
    }
    const saved = JSON.parse(fs.readFileSync(store, "utf8")) as Record<string, { tokens?: { access_token?: string } }>;
    expect(saved[baseUrl].tokens?.access_token).toMatch(/^mno_at_/);

    // A new start of Claude Desktop reuses the login: no browser.
    const second = start({ WEEKEND_OAUTH_STORE: store });
    let asked = false;
    void second.signInUrl.then(() => { asked = true; });
    const again = new Client({ name: "desktop-test", version: "0" });
    await again.connect(second.transport);
    try {
      expect((await again.listTools()).tools.length).toBeGreaterThan(0);
      expect(asked).toBe(false);
    } finally {
      await again.close();
    }
  });

  it("signs in once when Claude Desktop starts the extension twice at the same time", async () => {
    const store = path.join(dir, "twice.json");
    const a = start({ WEEKEND_OAUTH_STORE: store });
    const b = start({ WEEKEND_OAUTH_STORE: store });
    const urls: string[] = [];
    void a.signInUrl.then((u) => urls.push(u));
    void b.signInUrl.then((u) => urls.push(u));
    const ca = new Client({ name: "desktop-test", version: "0" });
    const cb = new Client({ name: "desktop-test", version: "0" });
    const connected = Promise.all([ca.connect(a.transport), cb.connect(b.transport)]);
    expect(await allow(await Promise.race([a.signInUrl, b.signInUrl]))).toContain("Gekoppeld");
    await connected;
    try {
      expect(urls.length).toBe(1);
      for (const x of [ca, cb]) expect(await workspaceNames(x)).toContain("Delivery");
    } finally {
      await ca.close();
      await cb.close();
    }

    // Both copies find the access token refused at the next start: one refreshes, the other takes
    // over its result, and Weekend does not see a reused refresh token (which revokes the login).
    const saved = JSON.parse(fs.readFileSync(store, "utf8")) as Record<string, { tokens: { access_token: string } }>;
    saved[baseUrl].tokens.access_token = "mno_at_" + "x".repeat(43);
    fs.writeFileSync(store, JSON.stringify(saved));
    const d = start({ WEEKEND_OAUTH_STORE: store });
    const e = start({ WEEKEND_OAUTH_STORE: store });
    let asked = false;
    void d.signInUrl.then(() => { asked = true; });
    void e.signInUrl.then(() => { asked = true; });
    const cd = new Client({ name: "desktop-test", version: "0" });
    const ce = new Client({ name: "desktop-test", version: "0" });
    await Promise.all([cd.connect(d.transport), ce.connect(e.transport)]);
    try {
      for (const x of [cd, ce]) expect(await workspaceNames(x)).toContain("Delivery");
      expect(asked).toBe(false);
    } finally {
      await cd.close();
      await ce.close();
    }
    expect(oauth.listGrants(c.admin).length).toBeGreaterThan(0);
  });

  it("reports a declined sign-in as an error", async () => {
    const run = start({ WEEKEND_OAUTH_STORE: path.join(dir, "declined.json") });
    const client = new Client({ name: "desktop-test", version: "0" });
    const connected = client.connect(run.transport);
    const u = new URL(await run.signInUrl);
    const back = oauth.errorRedirect(oauth.parseAuthorizeRequest(u.searchParams), "access_denied", "The user denied the request");
    expect(await (await fetch(back)).text()).toContain("Niet gekoppeld");
    await expect(connected).rejects.toThrow(/denied/);
    await client.close();
  });
});
