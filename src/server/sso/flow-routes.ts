/**
 * The SSO browser flow, shared by Google and Microsoft (route handlers in src/app/api/auth/<provider>/...):
 *
 *   GET /api/auth/<provider>/start?next=/pad&mode=login|link|test
 *     Authorization Code + PKCE (S256) + state + nonce. Everything the callback needs goes into a short-lived
 *     signed httpOnly cookie (one per provider). `mode=link` (profile) and `mode=test` (admin) need a session.
 *   GET /api/auth/<provider>/callback
 *     Verifies state, exchanges the code (PKCE), verifies the id_token and then signs in (login), links the
 *     account to the signed-in user (link) or only reports what would happen (test).
 * Tokens and codes are never logged.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, userToActor } from "@/lib/auth";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { clientIp } from "@/modules/admin/lib/ip";
import { recordAudit } from "@/server/services/audit";
import { auditEarlyFailure, linkSsoToUser, previewSsoLogin, signInWithSso } from "@/server/services/google-sso";
import { effective, primaryAccountId, providerActive } from "@/server/services/sso-settings";
import { googleEnv, isHttpsApp } from "./config";
import { clearFlowCookie, failureUrl, redirectTo, setFlowCookie } from "./http";
import { buildMicrosoftAuthUrl, microsoftEnv, verifyMicrosoftIdToken } from "./microsoft";
import {
  SsoError, buildAuthUrl, exchangeCode, flowCookieName, hdHint, newCodeVerifier, randomUrlToken, remoteKeys, safeEqual,
  sanitizeNext, signFlow, verifyFlow, verifyIdToken, type FlowMode, type FlowState, type SsoClaims, type SsoProvider,
} from "./oauth";
import { rateLimited } from "./rate-limit";

/** What differs per provider: credentials/endpoints, the authorization URL and the id_token checks. */
interface ProviderAdapter {
  /** false while the client id / secret are missing */
  ready(): boolean;
  authUrl(flow: FlowState, domains: string[]): string;
  claims(code: string, flow: FlowState): Promise<SsoClaims>;
}

const adapters: Record<SsoProvider, ProviderAdapter> = {
  google: {
    ready: () => googleEnv() !== null,
    authUrl: (flow, domains) => buildAuthUrl(googleEnv()!, { ...flow, hd: hdHint(domains) }),
    claims: async (code, flow) => {
      const env = googleEnv()!;
      const idToken = await exchangeCode(env, code, flow.verifier);
      return verifyIdToken(idToken, { clientId: env.clientId, nonce: flow.nonce, keys: remoteKeys(env.jwksUrl) });
    },
  },
  microsoft: {
    ready: () => microsoftEnv() !== null,
    authUrl: (flow, domains) => buildMicrosoftAuthUrl(microsoftEnv()!, { ...flow, domainHint: hdHint(domains) }),
    claims: async (code, flow) => {
      const env = microsoftEnv()!;
      const idToken = await exchangeCode(env, code, flow.verifier);
      return verifyMicrosoftIdToken(idToken, { clientId: env.clientId, nonce: flow.nonce, keys: remoteKeys(env.jwksUrl), tenant: env.tenant, issuerBase: env.issuerBase });
    },
  },
};

export async function startSso(req: NextRequest, provider: SsoProvider): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const rawMode = sp.get("mode");
  const mode: FlowMode = rawMode === "link" || rawMode === "test" ? rawMode : "login";
  const next = sanitizeNext(sp.get("next"));
  if (rateLimited(`start:${clientIp(req.headers)}`, 60)) return redirectTo(failureUrl(mode, "rate_limited", next, provider));

  const adapter = adapters[provider];
  const accountId = primaryAccountId();
  const ready = adapter.ready();
  if (!ready || !accountId || !providerActive(effective(accountId), provider)) {
    if (accountId) auditEarlyFailure(new SsoError("not_configured", ready ? "disabled_by_admin" : "env_missing"), { ip: clientIp(req.headers), userAgent: req.headers.get("user-agent") }, mode, provider);
    return redirectTo(failureUrl(mode, "not_configured", next, provider));
  }

  let uid: string | undefined;
  if (mode !== "login") {
    const user = await getCurrentUser();
    if (!user) return redirectTo(`/login?next=${encodeURIComponent(mode === "test" ? "/admin/sso" : "/profile")}`);
    if (mode === "test" && !can(userToActor(user), "account:security")) return redirectTo("/admin/sso");
    uid = user.id;
  }

  const flow: FlowState = { state: randomUrlToken(), nonce: randomUrlToken(), verifier: newCodeVerifier(), next, mode, uid, ...(provider === "google" ? {} : { provider }) };
  const location = adapter.authUrl(flow, effective(accountId).allowedDomains);
  return setFlowCookie(NextResponse.redirect(location, 302), await signFlow(flow), provider);
}

export async function callbackSso(req: NextRequest, provider: SsoProvider): Promise<NextResponse> {
  const ctx = { ip: clientIp(req.headers), userAgent: req.headers.get("user-agent") };
  const raw = await verifyFlow(req.cookies.get(flowCookieName(provider))?.value);
  const flow = raw && (raw.provider ?? "google") === provider ? raw : null; // a cookie of the other provider never counts
  const mode = flow?.mode ?? "login";
  const next = flow?.next ?? "/";
  const fail = (e: SsoError, audit = true) => {
    if (audit) auditEarlyFailure(e, ctx, mode, provider);
    return clearFlowCookie(redirectTo(failureUrl(mode, e.code, next, provider)), provider);
  };

  if (rateLimited(`callback:${ctx.ip}`, 120)) return fail(new SsoError("rate_limited", "rate_limited"), false);
  const adapter = adapters[provider];
  if (!adapter.ready()) return fail(new SsoError("not_configured", "env_missing"));

  const sp = req.nextUrl.searchParams;
  const state = sp.get("state") ?? "";
  if (!flow || !state || !safeEqual(state, flow.state)) return fail(new SsoError("state_mismatch", flow ? "state_mismatch" : "no_flow_cookie"));
  const providerError = sp.get("error");
  if (providerError) return fail(new SsoError("idp_error", `provider_${providerError.replace(/[^a-z_]/gi, "").slice(0, 40).toLowerCase() || "error"}`));
  const code = sp.get("code") ?? "";
  if (!code || code.length > 4096) return fail(new SsoError("idp_error", "no_code"));

  let claims: SsoClaims;
  try {
    claims = await adapter.claims(code, flow);
  } catch (e) {
    return fail(e instanceof SsoError ? e : new SsoError("idp_error", "token_failed"));
  }

  try {
    if (mode === "login") {
      const r = await signInWithSso(provider, claims, ctx);
      const res = clearFlowCookie(redirectTo(next), provider);
      res.cookies.set(SESSION_COOKIE, r.token, { ...sessionCookieOptions(), secure: sessionCookieOptions().secure || isHttpsApp() });
      return res;
    }
    const user = await getCurrentUser();
    if (!user || user.id !== flow.uid) throw new SsoError("not_signed_in", "session_mismatch");
    const actor = userToActor(user);
    if (mode === "link") {
      linkSsoToUser(provider, actor, claims, ctx);
      return clearFlowCookie(redirectTo(`/profile?${provider}=linked`), provider);
    }
    if (!can(actor, "account:security")) throw new SsoError("not_signed_in", "no_permission");
    const preview = previewSsoLogin(provider, actor.accountId, claims);
    recordAudit(actor, "sso.test", { provider, result: preview.outcome, match: preview.match, hd: claims.hd, emailVerified: claims.emailVerified, ip: ctx.ip });
    const ok = `/admin/sso?test=ok&match=${preview.match}&email=${encodeURIComponent(claims.email)}${provider === "google" ? "" : `&provider=${provider}`}`;
    return clearFlowCookie(redirectTo(preview.outcome === "ok" ? ok : failureUrl("test", preview.outcome, "/", provider)), provider);
  } catch (e) {
    // sign-in failures are already audited by signInWithSso; link / test failures are not
    if (!(e instanceof SsoError)) console.error(`[sso] unexpected error during ${provider} callback:`, e instanceof Error ? e.message : "unknown");
    return fail(e instanceof SsoError ? e : new SsoError("idp_error", "unexpected"), mode !== "login" || !(e instanceof SsoError));
  }
}
