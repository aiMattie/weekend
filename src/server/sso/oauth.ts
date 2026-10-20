/**
 * Pure OAuth 2.0 / OpenID Connect helpers for Google and Microsoft sign-in: state / nonce / PKCE (S256), the signed
 * flow cookie, redirect-safe `next`, id_token verification (jose) and the allowed-domain rules.
 * Nothing here touches the database. Tokens, codes and secrets are never logged.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload, type JWTVerifyGetKey, type CryptoKey, type KeyObject, type JWK } from "jose";
import { GOOGLE_ISSUERS, type GoogleEnv } from "./config";

/** Identity providers for single sign-on. Both share the account's SSO policy (domains, auto-provision, enforcement). */
export type SsoProvider = "google" | "microsoft";
export const SSO_PROVIDERS: readonly SsoProvider[] = ["google", "microsoft"];
export const isSsoProvider = (v: unknown): v is SsoProvider => v === "google" || v === "microsoft";

export type SsoErrorCode =
  | "not_configured" | "state_mismatch" | "domain_not_allowed" | "no_account" | "email_not_verified"
  | "account_disabled" | "locked" | "idp_error" | "rate_limited" | "already_linked" | "not_signed_in";
export const SSO_ERROR_CODES: readonly SsoErrorCode[] = [
  "not_configured", "state_mismatch", "domain_not_allowed", "no_account", "email_not_verified",
  "account_disabled", "locked", "idp_error", "rate_limited", "already_linked", "not_signed_in",
];
export const isSsoErrorCode = (v: unknown): v is SsoErrorCode => typeof v === "string" && (SSO_ERROR_CODES as readonly string[]).includes(v);

/** `code` is shown to the user (?error=<code>), `reason` goes to the audit log (no PII, no tokens). */
export class SsoError extends Error {
  constructor(readonly code: SsoErrorCode, readonly reason: string) { super(`${code}: ${reason}`); }
}

/* ------------------------------------------------------------------ random values, PKCE */

export const randomUrlToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");
/** RFC 7636: code_challenge = BASE64URL(SHA256(code_verifier)) */
export const pkceChallenge = (verifier: string): string => createHash("sha256").update(verifier).digest("base64url");
/** RFC 7636: verifier is 43..128 chars of [A-Za-z0-9-._~] */
export const newCodeVerifier = (): string => randomUrlToken(48);
export const isValidCodeVerifier = (v: string): boolean => /^[A-Za-z0-9._~-]{43,128}$/.test(v);

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ------------------------------------------------------------------ open-redirect safe `next` */

/** Only same-origin relative paths survive; everything else becomes "/" (or `fallback`). */
export function sanitizeNext(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 500) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const u = new URL(next, "http://sso.invalid");
    if (u.origin !== "http://sso.invalid" || u.pathname.startsWith("//")) return fallback;
    const decoded = decodeURIComponent(u.pathname); // %2f%2f, %5c and encoded control characters in the path are refused too
    if (decoded.startsWith("//") || /[\u0000-\u001f\u007f\\]/.test(decoded)) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------ signed flow cookie */

export const FLOW_COOKIE = "weekend_google_oauth";
export const MICROSOFT_FLOW_COOKIE = "weekend_microsoft_oauth";
export const flowCookieName = (provider: SsoProvider): string => (provider === "microsoft" ? MICROSOFT_FLOW_COOKIE : FLOW_COOKIE);
export const FLOW_MAX_AGE_SECONDS = 600;
export type FlowMode = "login" | "link" | "test";
/** `provider` is absent in Google flows (backwards compatible) and "microsoft" in Microsoft flows. */
export interface FlowState { state: string; nonce: string; verifier: string; next: string; mode: FlowMode; uid?: string; provider?: SsoProvider }

function flowKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET ?? "dev-only-insecure-session-secret-change-me-0123456789";
  return createHash("sha256").update(`google-oauth-flow:${secret}`).digest();
}

export async function signFlow(flow: FlowState): Promise<string> {
  return new SignJWT({ ...flow }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${FLOW_MAX_AGE_SECONDS}s`).sign(flowKey());
}

export async function verifyFlow(token: string | undefined | null): Promise<FlowState | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, flowKey(), { algorithms: ["HS256"] });
    const p = payload as Partial<FlowState>;
    if (typeof p.state !== "string" || typeof p.nonce !== "string" || typeof p.verifier !== "string" || !isValidCodeVerifier(p.verifier)) return null;
    if (p.mode !== "login" && p.mode !== "link" && p.mode !== "test") return null;
    return { state: p.state, nonce: p.nonce, verifier: p.verifier, next: sanitizeNext(p.next), mode: p.mode, uid: typeof p.uid === "string" ? p.uid : undefined, provider: p.provider === "microsoft" ? "microsoft" : "google" };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ authorization URL */

export function buildAuthUrl(env: Pick<GoogleEnv, "authUrl" | "clientId" | "redirectUri">, f: { state: string; nonce: string; verifier: string; hd?: string }): string {
  const u = new URL(env.authUrl);
  u.searchParams.set("client_id", env.clientId);
  u.searchParams.set("redirect_uri", env.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", f.state);
  u.searchParams.set("nonce", f.nonce);
  u.searchParams.set("code_challenge", pkceChallenge(f.verifier));
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("prompt", "select_account");
  if (f.hd) u.searchParams.set("hd", f.hd);
  return u.toString();
}

/** `hd` hint only when exactly one domain is allowed. */
export const hdHint = (domains: string[]): string | undefined => (domains.length === 1 ? domains[0] : undefined);

/* ------------------------------------------------------------------ id_token */

export interface GoogleClaims { sub: string; email: string; emailVerified: boolean; name: string | null; picture: string | null; hd: string | null }
/**
 * Provider-neutral claims. Microsoft maps onto the same shape: `sub` = "<tid>:<oid>", `hd` = the e-mail domain
 * when the e-mail is verified (see microsoft.ts), so the domain rules below apply unchanged.
 */
export type SsoClaims = GoogleClaims;
export type KeyInput = JWTVerifyGetKey | CryptoKey | KeyObject | JWK | Uint8Array;

const jwksCache = new Map<string, JWTVerifyGetKey>();
/** Remote JWKS (cached per URL by jose, with its own refetch cooldown). */
export function remoteKeys(jwksUrl: string): JWTVerifyGetKey {
  let k = jwksCache.get(jwksUrl);
  if (!k) { k = createRemoteJWKSet(new URL(jwksUrl), { timeoutDuration: 5000 }); jwksCache.set(jwksUrl, k); }
  return k;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * Verify signature (RS256), iss in {https://accounts.google.com, accounts.google.com}, aud = client id, exp and nonce.
 * Does NOT check email_verified or domains (see checkClaims) so callers can audit the reason separately.
 */
export async function verifyIdToken(idToken: string, opts: { clientId: string; nonce: string; keys: KeyInput; now?: Date }): Promise<GoogleClaims> {
  let payload: JWTPayload;
  try {
    const verifyOpts = { algorithms: ["RS256"], issuer: GOOGLE_ISSUERS, audience: opts.clientId, clockTolerance: 30, ...(opts.now ? { currentDate: opts.now } : {}) };
    const r = typeof opts.keys === "function" ? await jwtVerify(idToken, opts.keys, verifyOpts) : await jwtVerify(idToken, opts.keys as CryptoKey, verifyOpts);
    payload = r.payload;
  } catch (e) {
    const code = String((e as { code?: unknown }).code ?? "unknown").replace(/^ERR_/, "").toLowerCase();
    const claim = (e as { claim?: unknown }).claim;
    throw new SsoError("idp_error", typeof claim === "string" ? `id_token_bad_${claim}` : `id_token_${code}`);
  }
  if (typeof payload.nonce !== "string" || !safeEqual(payload.nonce, opts.nonce)) throw new SsoError("idp_error", "id_token_bad_nonce");
  const sub = str(payload.sub);
  const email = str(payload.email);
  if (!sub) throw new SsoError("idp_error", "id_token_no_sub");
  if (!email) throw new SsoError("idp_error", "id_token_no_email");
  return { sub, email: email.trim().toLowerCase(), emailVerified: payload.email_verified === true, name: str(payload.name), picture: str(payload.picture), hd: str(payload.hd)?.toLowerCase() ?? null };
}

/* ------------------------------------------------------------------ domains + claim policy */

export const emailDomain = (email: string): string => email.slice(email.lastIndexOf("@") + 1).toLowerCase();

/** No allowed domains = no restriction. Otherwise the e-mail domain AND (when present) the `hd` claim must be listed; with a restriction `hd` is required. */
export function domainAllowed(claims: Pick<GoogleClaims, "email" | "hd">, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const list = allowed.map((d) => d.toLowerCase());
  return list.includes(emailDomain(claims.email)) && !!claims.hd && list.includes(claims.hd);
}

/** email_verified must be true, then the domain rules. Throws SsoError. */
export function checkClaims(claims: GoogleClaims, allowedDomains: string[]): void {
  if (!claims.emailVerified) throw new SsoError("email_not_verified", "email_not_verified");
  if (!domainAllowed(claims, allowedDomains)) throw new SsoError("domain_not_allowed", claims.hd ? "domain_not_allowed" : "domain_not_allowed_no_hd");
}

/* ------------------------------------------------------------------ token endpoint */

/** Exchange the authorization code (PKCE). Returns the raw id_token; errors carry no Google payload. */
export async function exchangeCode(env: Pick<GoogleEnv, "tokenUrl" | "clientId" | "clientSecret" | "redirectUri"> & { scope?: string }, code: string, verifier: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(env.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: env.redirectUri, client_id: env.clientId, client_secret: env.clientSecret, code_verifier: verifier, ...(env.scope ? { scope: env.scope } : {}) }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new SsoError("idp_error", "token_endpoint_unreachable");
  }
  if (!res.ok) throw new SsoError("idp_error", `token_endpoint_${res.status}`);
  const json = (await res.json().catch(() => null)) as { id_token?: unknown } | null;
  if (!json || typeof json.id_token !== "string" || !json.id_token) throw new SsoError("idp_error", "token_endpoint_no_id_token");
  return json.id_token;
}
