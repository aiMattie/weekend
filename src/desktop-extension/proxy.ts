/**
 * Stdio-to-HTTP proxy for Claude Desktop. Claude Desktop starts this file (packaged as an MCP
 * Bundle, see src/server/mcp/desktop-extension.ts) and speaks MCP over stdin and stdout; every
 * message goes to Weekend's Streamable HTTP endpoint (/api/mcp) and every answer comes back.
 * The proxy runs on the person's own computer, so it reaches a Weekend that only that computer
 * can reach: localhost, or a server behind a VPN. claude.ai's custom connectors cannot, because
 * Anthropic's servers make those calls from the internet.
 *
 * Login: the first request Weekend refuses opens the browser on Weekend's consent page. The page
 * sends the browser back to a listener on 127.0.0.1; the proxy exchanges the code (OAuth 2.1 with
 * PKCE, a client registered on the fly) and keeps the tokens in ~/.weekend/oauth.json, one entry
 * per Weekend, refreshing them from then on.
 *
 * Environment: WEEKEND_URL (the environment, with or without /api/mcp), set by the bundle's
 * manifest. Optional: WEEKEND_TOKEN (a wkd_ API token; skips the browser login),
 * WEEKEND_OAUTH_STORE (another file for the login), WEEKEND_BROWSER=stderr (print the sign-in
 * address instead of opening a browser; used by the tests).
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError, auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage, RequestId } from "@modelcontextprotocol/sdk/types.js";

const LOGIN_TIMEOUT_MS = 5 * 60_000;

function log(message: string): void {
  process.stderr.write(`weekend: ${message}\n`);
}

function fail(message: string): never {
  log(message);
  process.exit(1);
}

function mcpUrl(raw: string): URL {
  try {
    return new URL(raw.replace(/\/+$/, "").replace(/\/api\/mcp$/, "") + "/api/mcp");
  } catch {
    return fail(`WEEKEND_URL is not a URL: ${raw}`);
  }
}

/** Turns transport errors into one line a person can act on. */
function describe(err: unknown, url: URL): string {
  const e = err as { code?: unknown; message?: string; cause?: { code?: string; message?: string } };
  if (err instanceof UnauthorizedError) return `not signed in to Weekend: ${e.message ?? ""}`.trim();
  if (e.code === 401) return "Weekend rejected the login (HTTP 401)";
  if (e.code === 403) return "Weekend refused this request (HTTP 403)";
  if (typeof e.code === "number") return `Weekend answered HTTP ${e.code}: ${e.message ?? ""}`.trim();
  const cause = e.cause?.code ?? e.cause?.message;
  if (cause) return `cannot reach ${url.origin} (${cause}); is the VPN on and the address right?`;
  return e.message ?? String(err);
}

function openBrowser(url: string): void {
  if (process.env.WEEKEND_BROWSER === "stderr") {
    log(`sign in at ${url}`);
    return;
  }
  // rundll32 hands the address to the default browser without cmd.exe parsing its & signs.
  const [cmd, args] =
    process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch (err) {
    log(`cannot open the browser (${(err as Error).message}); sign in at ${url}`);
  }
}

/* ------------------------------------------------------------------ login state, one entry per Weekend */

interface Saved {
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  verifier?: string;
}

class Store {
  constructor(private readonly file: string, private readonly key: string) {}

  private all(): Record<string, Saved> {
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf8")) as Record<string, Saved>;
    } catch {
      return {};
    }
  }

  get(): Saved {
    return this.all()[this.key] ?? {};
  }

  update(change: Partial<Saved>): void {
    const all = this.all();
    all[this.key] = { ...all[this.key], ...change };
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(this.file, JSON.stringify(all, null, 2), { mode: 0o600 });
  }
}

/* ------------------------------------------------------------------ the browser's way back: a listener on 127.0.0.1 */

function page(res: http.ServerResponse, status: number, title: string, nl: string, en: string): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(`<!doctype html><meta charset="utf-8"><title>Weekend</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1 style="font-size:1.3rem">${title}</h1><p>${nl}</p><p lang="en">${en}</p></body>`);
}

class Loopback {
  private server: http.Server | null = null;
  private waiting: { state: string; resolve: (code: string) => void; reject: (err: Error) => void } | null = null;
  port = 0;

  /** Weekend accepts a loopback redirect on any port, so a free port will do. */
  async listen(): Promise<number> {
    if (this.server) return this.port;
    const server = http.createServer((req, res) => this.handle(req, res));
    server.keepAliveTimeout = 1000;
    this.port = await new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve((server.address() as AddressInfo).port);
      });
    });
    server.unref();
    this.server = server;
    return this.port;
  }

  close(): void {
    this.server?.close();
    this.server?.closeAllConnections();
    this.server = null;
  }

  get redirectUrl(): string {
    return `http://127.0.0.1:${this.port}/callback`;
  }

  /** Resolves with the authorization code that comes back with this state. */
  wait(state: string): Promise<string> {
    this.waiting?.reject(new Error("a newer sign-in started"));
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = null;
        reject(new Error("the sign-in was not finished within 5 minutes"));
      }, LOGIN_TIMEOUT_MS);
      this.waiting = {
        state,
        resolve: (code) => { clearTimeout(timer); resolve(code); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      };
    });
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const u = new URL(req.url ?? "/", "http://127.0.0.1");
    if (u.pathname !== "/callback") return page(res, 404, "Not found", "Hier is niets.", "Nothing here.");
    const w = this.waiting;
    if (!w || u.searchParams.get("state") !== w.state) {
      return page(res, 400, "Verlopen aanmelding", "Begin een nieuw gesprek in Claude Desktop om opnieuw te koppelen.", "This sign-in does not belong here. Start a new chat in Claude Desktop to sign in again.");
    }
    this.waiting = null;
    const error = u.searchParams.get("error");
    const code = u.searchParams.get("code");
    if (error || !code) {
      page(res, 200, "Niet gekoppeld", "Je hebt geweigerd, of Weekend heeft de aanmelding afgewezen. Je kunt dit tabblad sluiten.", "You declined, or Weekend refused the sign-in. You can close this tab.");
      w.reject(new Error(u.searchParams.get("error_description") ?? (error === "access_denied" ? "the sign-in was declined" : error) ?? "no code"));
      return;
    }
    page(res, 200, "Gekoppeld", "Weekend is gekoppeld aan Claude Desktop. Je kunt dit tabblad sluiten.", "Weekend is connected to Claude Desktop. You can close this tab.");
    w.resolve(code);
  }
}

class Provider implements OAuthClientProvider {
  private pendingState = "";
  login: Promise<string> | null = null;

  constructor(private readonly store: Store, private readonly loopback: Loopback) {}

  get redirectUrl(): string {
    return this.loopback.redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: `Claude Desktop (${os.hostname()})`,
      redirect_uris: [this.loopback.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  state(): string {
    this.pendingState = crypto.randomBytes(16).toString("base64url");
    return this.pendingState;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.store.get().client;
  }

  saveClientInformation(client: OAuthClientInformationMixed): void {
    this.store.update({ client });
  }

  tokens(): OAuthTokens | undefined {
    return this.store.get().tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.store.update({ tokens });
  }

  codeVerifier(): string {
    const verifier = this.store.get().verifier;
    if (!verifier) throw new Error("no sign-in in progress");
    return verifier;
  }

  saveCodeVerifier(verifier: string): void {
    this.store.update({ verifier });
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): void {
    if (scope === "all") this.store.update({ client: undefined, tokens: undefined, verifier: undefined });
    else if (scope === "client") this.store.update({ client: undefined });
    else if (scope === "tokens") this.store.update({ tokens: undefined });
    else if (scope === "verifier") this.store.update({ verifier: undefined });
  }

  /** The SDK built the consent address; the browser takes it from here. */
  redirectToAuthorization(authorizationUrl: URL): void {
    this.login = this.loopback.wait(this.pendingState);
    this.login.catch(() => {});
    openBrowser(authorizationUrl.href);
  }
}

/* ------------------------------------------------------------------ one sign-in at a time, across processes */

/**
 * Claude Desktop can start the extension several times at once. Without this lock every copy
 * would use the same refresh token (Weekend takes the second use for theft and revokes the
 * login) or open its own browser tab. The holder writes its pid; a lock whose process is gone,
 * or that outlived a sign-in, is stale.
 */
function lockIsStale(file: string): boolean {
  try {
    const age = Date.now() - fs.statSync(file).mtimeMs;
    if (age > LOGIN_TIMEOUT_MS + 60_000) return true;
    const pid = Number(fs.readFileSync(file, "utf8"));
    // An empty file is a holder that has not written its pid yet.
    if (!Number.isInteger(pid) || pid <= 0) return age > 5000;
    process.kill(pid, 0);
    return false;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "ESRCH" || code === "ENOENT";
  }
}

async function withLock<T>(file: string, work: () => Promise<T>): Promise<T> {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + LOGIN_TIMEOUT_MS + 60_000;
  for (;;) {
    try {
      fs.writeFileSync(file, String(process.pid), { flag: "wx", mode: 0o600 });
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      if (lockIsStale(file)) {
        fs.rmSync(file, { force: true });
        continue;
      }
      if (Date.now() > deadline) throw new UnauthorizedError("another sign-in to Weekend did not finish");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  try {
    return await work();
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/* ------------------------------------------------------------------ wiring */

const rawUrl = (process.env.WEEKEND_URL ?? "").trim();
const token = (process.env.WEEKEND_TOKEN ?? "").trim();
if (!rawUrl) fail("WEEKEND_URL is not set");
if (token && !/^wkd_\S+$/.test(token)) fail("WEEKEND_TOKEN does not look like a wkd_ token");
const url = mcpUrl(rawUrl);

const storeFile = process.env.WEEKEND_OAUTH_STORE || path.join(os.homedir(), ".weekend", "oauth.json");
const store = new Store(storeFile, url.origin);
const loopback = new Loopback();
const provider = new Provider(store, loopback);

/** Reads the access token per request, so a login refreshed by another process is picked up. */
const withLogin: FetchLike = (input, init) => {
  const headers = new Headers(init?.headers);
  const access = store.get().tokens?.access_token;
  if (access) headers.set("authorization", `Bearer ${access}`);
  return fetch(input, { ...init, headers });
};

// The proxy handles a refused request itself (forward, recover) instead of leaving it to the
// SDK, which would refresh or open the browser in every process at once.
const upstream = token
  ? new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: `Bearer ${token}` } } })
  : new StreamableHTTPClientTransport(url, { fetch: withLogin });
const stdio = new StdioServerTransport();
const initializeIds = new Set<RequestId>();

/** One recovery at a time; messages that arrive meanwhile wait for it. */
let signingIn: Promise<void> | null = null;

/** Refreshes the login, or signs in through the browser, unless another process just did. */
async function recover(rejected: string | undefined): Promise<void> {
  await withLock(storeFile + ".lock", async () => {
    const current = store.get().tokens?.access_token;
    if (current && current !== rejected) return;
    await loopback.listen();
    try {
      if ((await auth(provider, { serverUrl: url })) === "AUTHORIZED") return;
      const login = provider.login;
      if (!login) throw new UnauthorizedError("the sign-in did not start");
      provider.login = null;
      await auth(provider, { serverUrl: url, authorizationCode: await login });
      log("signed in");
    } finally {
      loopback.close();
    }
  });
}

async function forward(message: JSONRPCMessage): Promise<void> {
  if (signingIn) await signingIn;
  const used = store.get().tokens?.access_token;
  try {
    await upstream.send(message);
  } catch (err) {
    if (token || (err as { code?: unknown }).code !== 401) throw err;
    signingIn ??= recover(used).finally(() => { signingIn = null; });
    await signingIn;
    await upstream.send(message);
  }
}

stdio.onmessage = async (message: JSONRPCMessage) => {
  const request = "method" in message && "id" in message ? message : null;
  if (request && request.method === "initialize") initializeIds.add(request.id);
  try {
    await forward(message);
  } catch (err) {
    const text = describe(err, url);
    log(text);
    if (request) await stdio.send({ jsonrpc: "2.0", id: request.id, error: { code: -32000, message: text } }).catch(() => {});
  }
};

upstream.onmessage = (message: JSONRPCMessage) => {
  // The protocol version negotiated in the initialize result goes on every later request.
  if ("id" in message && "result" in message && initializeIds.delete(message.id)) {
    const version = (message.result as { protocolVersion?: unknown }).protocolVersion;
    if (typeof version === "string") upstream.setProtocolVersion(version);
  }
  stdio.send(message).catch((err: Error) => log(`cannot write to Claude Desktop: ${err.message}`));
};
upstream.onerror = (err: Error) => log(`upstream: ${err.message}`);
stdio.onclose = async () => {
  // Claude Desktop may give up on a slow first sign-in; finishing it still saves the login.
  if (signingIn) await signingIn.catch(() => {});
  upstream.close().catch(() => {});
  process.exit(0);
};

await upstream.start();
await stdio.start();
