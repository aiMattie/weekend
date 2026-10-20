/**
 * Microsoft sign-in (Microsoft Entra ID / personal Microsoft accounts) over the Microsoft identity platform v2.0
 * (OAuth 2.0 authorization code + PKCE, OpenID Connect id_token). Configuration and token checks only; the
 * flow itself is shared with Google (flow-routes.ts) and the sign-in policy lives in services/google-sso.ts.
 *
 *   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET   app registration (Entra admin center > App registrations)
 *   MICROSOFT_TENANT_ID                             tenant GUID or domain (recommended: your own tenant), or
 *                                                   "organizations" (any work account, default), "common", "consumers"
 *   MICROSOFT_OAUTH_BASE / MICROSOFT_ISSUER_BASE    endpoint overrides, ONLY honoured when E2E_RESET=1 (mock IdP)
 *
 * E-mail trust (the "nOAuth" problem): in a multi-tenant setup anybody can create a tenant and put any e-mail
 * address on a user. So an e-mail is only treated as verified when (a) the app is locked to one tenant, (b) the
 * token comes from the personal-accounts tenant (Microsoft verifies those addresses), or (c) Entra says the
 * e-mail domain is verified (optional claim `xms_edov`). Unverified e-mails can never match or create a user.
 */
import { jwtVerify, type CryptoKey, type JWTPayload } from "jose";
import { appUrl } from "./config";
import { SsoError, emailDomain, pkceChallenge, safeEqual, type KeyInput, type SsoClaims } from "./oauth";

export const MICROSOFT_CALLBACK_PATH = "/api/auth/microsoft/callback";
export const MICROSOFT_LOGIN_BASE = "https://login.microsoftonline.com";
/** Tenant id of personal Microsoft accounts (outlook.com, hotmail.com, ...). */
export const CONSUMERS_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";
const MULTI_TENANT = ["common", "organizations", "consumers"];
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MicrosoftEnv {
  clientId: string; clientSecret: string; tenant: string; redirectUri: string;
  authUrl: string; tokenUrl: string; jwksUrl: string; issuerBase: string; scope: string;
}

const clean = (v: string | undefined): string => (v ?? "").trim();
const e2e = (): boolean => process.env.E2E_RESET === "1";

export const microsoftTenant = (): string => clean(process.env.MICROSOFT_TENANT_ID) || "organizations";
/** true when the app only accepts accounts of one tenant (GUID or verified domain name). */
export const isSingleTenant = (tenant = microsoftTenant()): boolean => !MULTI_TENANT.includes(tenant.toLowerCase());
export const microsoftRedirectUri = (): string => `${appUrl()}${MICROSOFT_CALLBACK_PATH}`;

/** Client credentials + endpoints, or null while MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET are missing. */
export function microsoftEnv(): MicrosoftEnv | null {
  const clientId = clean(process.env.MICROSOFT_CLIENT_ID);
  const clientSecret = clean(process.env.MICROSOFT_CLIENT_SECRET);
  if (!clientId || !clientSecret) return null;
  const tenant = microsoftTenant();
  const mock = e2e() ? clean(process.env.MICROSOFT_OAUTH_BASE).replace(/\/+$/, "") : "";
  const base = mock || `${MICROSOFT_LOGIN_BASE}/${encodeURIComponent(tenant)}`;
  return {
    clientId, clientSecret, tenant, redirectUri: microsoftRedirectUri(),
    authUrl: mock ? `${base}/authorize` : `${base}/oauth2/v2.0/authorize`,
    tokenUrl: mock ? `${base}/token` : `${base}/oauth2/v2.0/token`,
    jwksUrl: mock ? `${base}/keys` : `${base}/discovery/v2.0/keys`,
    issuerBase: (e2e() && clean(process.env.MICROSOFT_ISSUER_BASE)) || MICROSOFT_LOGIN_BASE,
    scope: "openid email profile",
  };
}

export const isMicrosoftConfigured = (): boolean => microsoftEnv() !== null;

/** Which environment variables are present (never their values). */
export function microsoftEnvChecks(): { name: string; present: boolean; required: boolean }[] {
  const has = (n: string) => !!clean(process.env[n]);
  return [
    { name: "MICROSOFT_CLIENT_ID", present: has("MICROSOFT_CLIENT_ID"), required: true },
    { name: "MICROSOFT_CLIENT_SECRET", present: has("MICROSOFT_CLIENT_SECRET"), required: true },
    { name: "MICROSOFT_TENANT_ID", present: has("MICROSOFT_TENANT_ID"), required: false },
  ];
}

export function buildMicrosoftAuthUrl(env: Pick<MicrosoftEnv, "authUrl" | "clientId" | "redirectUri" | "scope">, f: { state: string; nonce: string; verifier: string; domainHint?: string }): string {
  const u = new URL(env.authUrl);
  u.searchParams.set("client_id", env.clientId);
  u.searchParams.set("redirect_uri", env.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("response_mode", "query");
  u.searchParams.set("scope", env.scope);
  u.searchParams.set("state", f.state);
  u.searchParams.set("nonce", f.nonce);
  u.searchParams.set("code_challenge", pkceChallenge(f.verifier));
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("prompt", "select_account");
  if (f.domainHint) u.searchParams.set("domain_hint", f.domainHint);
  return u.toString();
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const looksLikeEmail = (v: string | null): v is string => !!v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/**
 * Verify signature (RS256), aud = client id, exp, nonce, and iss = <issuerBase>/<tid>/v2.0 (the v2.0 issuer
 * carries the tenant of the token). A tenant GUID in MICROSOFT_TENANT_ID must equal `tid`.
 */
export async function verifyMicrosoftIdToken(idToken: string, opts: { clientId: string; nonce: string; keys: KeyInput; tenant: string; issuerBase?: string; now?: Date }): Promise<SsoClaims> {
  let payload: JWTPayload;
  try {
    const verifyOpts = { algorithms: ["RS256"], audience: opts.clientId, clockTolerance: 30, ...(opts.now ? { currentDate: opts.now } : {}) };
    const r = typeof opts.keys === "function" ? await jwtVerify(idToken, opts.keys, verifyOpts) : await jwtVerify(idToken, opts.keys as CryptoKey, verifyOpts);
    payload = r.payload;
  } catch (e) {
    const code = String((e as { code?: unknown }).code ?? "unknown").replace(/^ERR_/, "").toLowerCase();
    const claim = (e as { claim?: unknown }).claim;
    throw new SsoError("idp_error", typeof claim === "string" ? `id_token_bad_${claim}` : `id_token_${code}`);
  }
  const tid = str(payload.tid);
  const oid = str(payload.oid);
  if (!tid || !GUID.test(tid)) throw new SsoError("idp_error", "id_token_no_tid");
  if (payload.iss !== `${(opts.issuerBase ?? MICROSOFT_LOGIN_BASE).replace(/\/+$/, "")}/${tid}/v2.0`) throw new SsoError("idp_error", "id_token_bad_iss");
  const tenant = opts.tenant.toLowerCase();
  if (GUID.test(tenant) && tid.toLowerCase() !== tenant) throw new SsoError("idp_error", "id_token_wrong_tenant");
  if (tenant === "consumers" && tid !== CONSUMERS_TENANT_ID) throw new SsoError("idp_error", "id_token_wrong_tenant");
  if (tenant === "organizations" && tid === CONSUMERS_TENANT_ID) throw new SsoError("idp_error", "id_token_wrong_tenant");
  if (typeof payload.nonce !== "string" || !safeEqual(payload.nonce, opts.nonce)) throw new SsoError("idp_error", "id_token_bad_nonce");
  if (!oid) throw new SsoError("idp_error", "id_token_no_sub");

  const single = isSingleTenant(tenant);
  const upn = str(payload.preferred_username);
  const email = str(payload.email) ?? (single && looksLikeEmail(upn) ? upn : null);
  if (!email) throw new SsoError("idp_error", "id_token_no_email");
  const lower = email.toLowerCase();
  const emailVerified = single || tid === CONSUMERS_TENANT_ID || payload.xms_edov === true || payload.xms_edov === "1" || payload.xms_edov === 1;
  return {
    sub: `${tid}:${oid}`, email: lower, emailVerified, name: str(payload.name), picture: null,
    hd: emailVerified ? emailDomain(lower) : null,
  };
}
