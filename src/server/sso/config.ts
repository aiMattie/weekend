/**
 * Google SSO configuration from the environment. Secrets are never returned or logged: callers get
 * booleans ("present") or the values they need to talk to Google (client id / secret stay server side).
 *
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   OAuth client (Google Cloud Console)
 *   APP_URL                                   public base URL, builds the redirect URI (default http://localhost:3058)
 *   GOOGLE_ALLOWED_DOMAINS                    optional comma list (example.com,example.org)
 *   GOOGLE_OAUTH_BASE / GOOGLE_AUTH_URL / GOOGLE_TOKEN_URL / GOOGLE_JWKS_URL
 *                                             endpoint overrides, ONLY honoured when E2E_RESET=1 (mock IdP in e2e)
 *
 * e2e (E2E_RESET=1): POST /api/test/google can set the same values at runtime (setRuntimeOverride).
 */

export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
export const DEFAULT_APP_URL = "http://localhost:3058";
export const CALLBACK_PATH = "/api/auth/google/callback";

export interface RuntimeOverride {
  clientId?: string; clientSecret?: string; appUrl?: string; oauthBase?: string; allowedDomains?: string;
}
const g = globalThis as unknown as { __googleSsoOverride?: RuntimeOverride | null };

const e2e = (): boolean => process.env.E2E_RESET === "1";
/** e2e only: null removes the override. Ignored (no-op) unless E2E_RESET=1. */
export function setRuntimeOverride(o: RuntimeOverride | null): void { if (e2e()) g.__googleSsoOverride = o; }
/** e2e only: merge keys into the current override. */
export function patchRuntimeOverride(o: RuntimeOverride): void { if (e2e()) g.__googleSsoOverride = { ...(g.__googleSsoOverride ?? {}), ...o }; }
const override = (): RuntimeOverride => (e2e() ? g.__googleSsoOverride ?? {} : {});

const clean = (v: string | undefined): string => (v ?? "").trim();
/** runtime override (even an empty string) wins over the environment */
const val = (key: keyof RuntimeOverride, envName: string): string => { const o = override()[key]; return o !== undefined ? clean(o) : clean(process.env[envName]); };

export interface GoogleEndpoints { authUrl: string; tokenUrl: string; jwksUrl: string }
export interface GoogleEnv extends GoogleEndpoints { clientId: string; clientSecret: string; appUrl: string; redirectUri: string }

export function appUrl(): string {
  const raw = val("appUrl", "APP_URL") || DEFAULT_APP_URL;
  return raw.replace(/\/+$/, "");
}

export const redirectUri = (): string => `${appUrl()}${CALLBACK_PATH}`;
export const isHttpsApp = (): boolean => appUrl().startsWith("https://");

export function endpoints(): GoogleEndpoints {
  const base = override().oauthBase !== undefined ? clean(override().oauthBase) : e2e() ? clean(process.env.GOOGLE_OAUTH_BASE) : "";
  const pick = (name: string): string => (e2e() ? clean(process.env[name]) : "");
  if (base || pick("GOOGLE_AUTH_URL") || pick("GOOGLE_TOKEN_URL") || pick("GOOGLE_JWKS_URL")) {
    const b = base.replace(/\/+$/, "");
    return {
      authUrl: pick("GOOGLE_AUTH_URL") || `${b}/auth`,
      tokenUrl: pick("GOOGLE_TOKEN_URL") || `${b}/token`,
      jwksUrl: pick("GOOGLE_JWKS_URL") || `${b}/jwks`,
    };
  }
  return { authUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", jwksUrl: "https://www.googleapis.com/oauth2/v3/certs" };
}

/** Client credentials + endpoints, or null while GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing. */
export function googleEnv(): GoogleEnv | null {
  const clientId = val("clientId", "GOOGLE_CLIENT_ID");
  const clientSecret = val("clientSecret", "GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, appUrl: appUrl(), redirectUri: redirectUri(), ...endpoints() };
}

export const isConfigured = (): boolean => googleEnv() !== null;

/** Lower-case, de-duplicated domains from a comma / space separated string or list ("@" prefix tolerated). */
export function parseDomains(input: string | string[] | undefined | null): string[] {
  const list = Array.isArray(input) ? input : (input ?? "").split(/[\s,;]+/);
  return [...new Set(list.map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter((d) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)))];
}

export const envDomains = (): string[] => parseDomains(val("allowedDomains", "GOOGLE_ALLOWED_DOMAINS"));

/** Which environment variables are present (never their values). */
export function envChecks(): { name: string; present: boolean; required: boolean }[] {
  const has = (n: string, key: keyof RuntimeOverride) => !!val(key, n);
  return [
    { name: "GOOGLE_CLIENT_ID", present: has("GOOGLE_CLIENT_ID", "clientId"), required: true },
    { name: "GOOGLE_CLIENT_SECRET", present: has("GOOGLE_CLIENT_SECRET", "clientSecret"), required: true },
    { name: "APP_URL", present: has("APP_URL", "appUrl"), required: false },
    { name: "GOOGLE_ALLOWED_DOMAINS", present: has("GOOGLE_ALLOWED_DOMAINS", "allowedDomains"), required: false },
  ];
}
