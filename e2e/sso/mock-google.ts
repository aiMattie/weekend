/**
 * Local mock OpenID Connect provider for the Google SSO e2e specs (never the real Google).
 * Endpoints (discovery-less, as the app is configured with them directly):
 *   GET  /auth   auto-approves with the identity set through setNext() and redirects back (code + state), or
 *                with an error when mode is "deny"
 *   POST /token  verifies client id/secret, redirect_uri and PKCE (S256), returns an RS256 signed id_token
 *   GET  /jwks   the public key
 */
import { createHash, generateKeyPairSync, randomBytes, type KeyObject } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, SignJWT } from "jose";

export const MOCK_CLIENT_ID = "mock-client-id.apps.googleusercontent.com";
export const MOCK_CLIENT_SECRET = "mock-client-secret";

export interface MockIdentity {
  sub: string; email: string; name?: string; picture?: string; hd?: string | null; email_verified?: boolean;
  /** failure injection */
  aud?: string; iss?: string; nonce?: string; expired?: boolean; signWithOtherKey?: boolean;
}
interface Pending { identity: MockIdentity; nonce: string; challenge: string; redirectUri: string }
export interface MockGoogle {
  url: string;
  setNext(identity: MockIdentity | "deny"): void;
  /** query of the most recent /auth request */
  lastAuth(): URLSearchParams | null;
  tokenCalls(): number;
  close(): Promise<void>;
}

const body = (req: IncomingMessage): Promise<string> => new Promise((res) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => res(s)); });
const b64 = (buf: Buffer) => buf.toString("base64url");

export async function startMockGoogle(): Promise<MockGoogle> {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...(await exportJWK(pair.publicKey as KeyObject)), kid: "mock-1", alg: "RS256", use: "sig" };
  let next: MockIdentity | "deny" = { sub: "g-default", email: "admin@example.com", hd: "example.com", email_verified: true };
  let last: URLSearchParams | null = null;
  let tokenCalls = 0;
  const codes = new Map<string, Pending>();

  const server: Server = createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://mock");
    if (u.pathname === "/jwks") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ keys: [jwk] })); return; }
    if (u.pathname === "/auth") {
      last = u.searchParams;
      const redirect = u.searchParams.get("redirect_uri") ?? "";
      const state = u.searchParams.get("state") ?? "";
      const dest = new URL(redirect);
      if (next === "deny") { dest.searchParams.set("error", "access_denied"); dest.searchParams.set("state", state); }
      else {
        const code = b64(randomBytes(16));
        codes.set(code, { identity: next, nonce: u.searchParams.get("nonce") ?? "", challenge: u.searchParams.get("code_challenge") ?? "", redirectUri: redirect });
        dest.searchParams.set("code", code);
        dest.searchParams.set("state", state);
      }
      res.statusCode = 302; res.setHeader("Location", dest.toString()); res.end(); return;
    }
    if (u.pathname === "/token" && req.method === "POST") {
      tokenCalls++;
      const form = new URLSearchParams(await body(req));
      const fail = (error: string) => { res.statusCode = 400; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error })); };
      const p = codes.get(form.get("code") ?? "");
      if (!p || form.get("grant_type") !== "authorization_code") return fail("invalid_grant");
      codes.delete(form.get("code") ?? "");
      if (form.get("client_id") !== MOCK_CLIENT_ID || form.get("client_secret") !== MOCK_CLIENT_SECRET) return fail("invalid_client");
      if (form.get("redirect_uri") !== p.redirectUri) return fail("redirect_uri_mismatch");
      if (b64(createHash("sha256").update(form.get("code_verifier") ?? "").digest()) !== p.challenge) return fail("invalid_grant");
      const i = p.identity;
      const jwt = new SignJWT({ email: i.email, email_verified: i.email_verified ?? true, name: i.name, picture: i.picture, ...(i.hd === null ? {} : { hd: i.hd ?? "example.com" }), nonce: i.nonce ?? p.nonce })
        .setProtectedHeader({ alg: "RS256", kid: "mock-1" }).setSubject(i.sub).setIssuer(i.iss ?? "https://accounts.google.com").setAudience(i.aud ?? MOCK_CLIENT_ID)
        .setIssuedAt().setExpirationTime(i.expired ? Math.floor(Date.now() / 1000) - 3600 : "5m");
      const idToken = await jwt.sign((i.signWithOtherKey ? other : pair).privateKey);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ access_token: "mock-access", token_type: "Bearer", expires_in: 3600, id_token: idToken }));
      return;
    }
    res.statusCode = 404; res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    setNext: (i) => { next = i; },
    lastAuth: () => last,
    tokenCalls: () => tokenCalls,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}
