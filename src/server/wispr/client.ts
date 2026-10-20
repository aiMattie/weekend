/**
 * Minimal MCP client for the Wispr Flow remote MCP server (module wispr).
 *
 *  - OAuth 2.1 as an MCP client: protected-resource discovery -> authorization-server metadata -> dynamic client
 *    registration (public client, PKCE S256) -> authorization code + refresh token grants. `resource` is sent on
 *    every authorization/token request (RFC 8707).
 *  - Streamable HTTP transport: initialize -> notifications/initialized -> tools/call, JSON or SSE responses.
 *
 * Pure transport: no database. Tokens are passed in and returned; the service seals and stores them.
 * Tests swap the network with `setWisprFetch()`. Never log tokens, codes or verifiers.
 */
import { createHash, randomBytes } from "node:crypto";

export const WISPR_MCP_URL = (): string => process.env.WISPR_MCP_URL || "https://api.wisprflow.ai/connect/mcp";
const PROTOCOL_VERSION = "2025-06-18";
const SCOPE = "openid offline_access email profile";
const TIMEOUT_MS = 30_000;

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
/** Test hook: replace the network. */
export function setWisprFetch(f: Fetch | null): void { fetchImpl = f ?? ((...a) => fetch(...a)); discovered = null; }

export class WisprError extends Error {
  constructor(public code: "not_connected" | "auth_failed" | "upstream" | "tool_error", message: string) { super(message); }
}

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
  } catch {
    throw new WisprError("upstream", "Wispr Flow is niet bereikbaar");
  }
}

async function json<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) throw new WisprError(res.status === 400 || res.status === 401 ? "auth_failed" : "upstream", `${what} mislukt (HTTP ${res.status})`);
  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ OAuth */

export interface AuthServer { authorization_endpoint: string; token_endpoint: string; registration_endpoint?: string; issuer: string }
let discovered: AuthServer | null = null;

export async function discover(): Promise<AuthServer> {
  if (discovered) return discovered;
  const mcp = new URL(WISPR_MCP_URL());
  const prm = await json<{ authorization_servers?: string[] }>(await request(`${mcp.origin}/.well-known/oauth-protected-resource`), "Wispr discovery");
  const issuer = prm.authorization_servers?.[0];
  if (!issuer?.startsWith("https://") && !issuer?.startsWith("http://localhost")) throw new WisprError("upstream", "Wispr discovery gaf geen autorisatieserver");
  const as = await json<AuthServer>(await request(`${issuer.replace(/\/$/, "")}/.well-known/oauth-authorization-server`), "Wispr discovery");
  if (!as.authorization_endpoint || !as.token_endpoint) throw new WisprError("upstream", "Wispr discovery onvolledig");
  discovered = as;
  return as;
}

export async function registerClient(redirectUri: string): Promise<string> {
  const as = await discover();
  if (!as.registration_endpoint) throw new WisprError("upstream", "Wispr ondersteunt geen client-registratie");
  const r = await json<{ client_id?: string }>(await request(as.registration_endpoint, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_name: "Weekend", redirect_uris: [redirectUri], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", scope: SCOPE }),
  }), "Wispr client-registratie");
  if (!r.client_id) throw new WisprError("upstream", "Wispr gaf geen client_id");
  return r.client_id;
}

export const randomState = (): string => randomBytes(24).toString("base64url");
export const newVerifier = (): string => randomBytes(48).toString("base64url");
export const challengeOf = (verifier: string): string => createHash("sha256").update(verifier).digest("base64url");

export async function authorizeUrl(o: { clientId: string; redirectUri: string; state: string; verifier: string }): Promise<string> {
  const as = await discover();
  const u = new URL(as.authorization_endpoint);
  u.search = new URLSearchParams({ response_type: "code", client_id: o.clientId, redirect_uri: o.redirectUri, state: o.state, code_challenge: challengeOf(o.verifier), code_challenge_method: "S256", scope: SCOPE, resource: WISPR_MCP_URL() }).toString();
  return u.toString();
}

export interface Tokens { accessToken: string; refreshToken: string | null; expiresAt: string | null }

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const as = await discover();
  const res = await request(as.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams({ ...params, resource: WISPR_MCP_URL() }).toString() });
  const t = await json<{ access_token?: string; refresh_token?: string; expires_in?: number }>(res, "Wispr token");
  if (!t.access_token) throw new WisprError("auth_failed", "Wispr gaf geen access token");
  return { accessToken: t.access_token, refreshToken: t.refresh_token ?? null, expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null };
}

export const exchangeCode = (o: { clientId: string; redirectUri: string; code: string; verifier: string }): Promise<Tokens> =>
  tokenRequest({ grant_type: "authorization_code", code: o.code, redirect_uri: o.redirectUri, client_id: o.clientId, code_verifier: o.verifier });

export const refresh = (o: { clientId: string; refreshToken: string }): Promise<Tokens> =>
  tokenRequest({ grant_type: "refresh_token", refresh_token: o.refreshToken, client_id: o.clientId });

/* ------------------------------------------------------------------ MCP (streamable HTTP) */

interface RpcResponse { id?: number | string; result?: unknown; error?: { code: number; message: string } }
export interface ToolInfo { name: string; inputSchema?: { properties?: Record<string, unknown>; required?: string[] } }

function readRpc(body: string, contentType: string, id: number): RpcResponse | null {
  if (contentType.includes("text/event-stream")) {
    for (const block of body.split(/\r?\n\r?\n/)) {
      const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
      if (!data) continue;
      try { const m = JSON.parse(data) as RpcResponse; if (m.id === id) return m; } catch { /* keep-alive or partial event */ }
    }
    return null;
  }
  try { const m = JSON.parse(body) as RpcResponse | RpcResponse[]; return (Array.isArray(m) ? m.find((x) => x.id === id) : m) ?? null; } catch { return null; }
}

/** One MCP session over the streamable HTTP transport. */
export class WisprSession {
  private sessionId: string | null = null;
  private nextId = 1;
  private tools: ToolInfo[] | null = null;
  constructor(private accessToken: string) {}

  private async post(payload: object, expectReply: boolean): Promise<RpcResponse | null> {
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${this.accessToken}`, "mcp-protocol-version": PROTOCOL_VERSION };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    const res = await request(WISPR_MCP_URL(), { method: "POST", headers, body: JSON.stringify(payload) });
    if (res.status === 401 || res.status === 403) throw new WisprError("auth_failed", "Wispr Flow-koppeling verlopen, koppel opnieuw");
    if (!res.ok && res.status !== 202) throw new WisprError("upstream", `Wispr Flow gaf HTTP ${res.status}`);
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    if (!expectReply) return null;
    const msg = readRpc(await res.text(), res.headers.get("content-type") ?? "", (payload as { id: number }).id);
    if (!msg) throw new WisprError("upstream", "Onleesbaar antwoord van Wispr Flow");
    if (msg.error) throw new WisprError("tool_error", msg.error.message || "Wispr Flow-fout");
    return msg;
  }

  private async rpc(method: string, params: object = {}): Promise<unknown> {
    return (await this.post({ jsonrpc: "2.0", id: this.nextId++, method, params }, true))?.result;
  }

  async open(): Promise<this> {
    await this.rpc("initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "Weekend", version: "1.0" } });
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, false);
    return this;
  }

  async listTools(): Promise<ToolInfo[]> {
    if (!this.tools) this.tools = ((await this.rpc("tools/list")) as { tools?: ToolInfo[] })?.tools ?? [];
    return this.tools;
  }

  /** Calls a tool and returns structuredContent, else the JSON of the text content, else the text itself. */
  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const r = (await this.rpc("tools/call", { name, arguments: args })) as { isError?: boolean; structuredContent?: unknown; content?: { type: string; text?: string }[] };
    const text = (r?.content ?? []).filter((c) => c.type === "text" && c.text).map((c) => c.text).join("\n");
    if (r?.isError) throw new WisprError("tool_error", text.slice(0, 300) || `Wispr-tool ${name} faalde`);
    if (r?.structuredContent !== undefined) return r.structuredContent;
    try { return JSON.parse(text); } catch { return text; }
  }
}
