import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/client";
import { userIdentities } from "../../src/db/schema/sso";
import { SESSION_COOKIE } from "../../src/lib/auth/session";
import { linkGoogleToUser, linkSsoToUser, signInWithSso } from "../../src/server/services/google-sso";
import { effective, identityOf, loginOptions, profileView, unlinkIdentity, updateSettings } from "../../src/server/services/sso-settings";
import { callbackSso, startSso } from "../../src/server/sso/flow-routes";
import { CONSUMERS_TENANT_ID, buildMicrosoftAuthUrl, isSingleTenant, microsoftEnv, verifyMicrosoftIdToken } from "../../src/server/sso/microsoft";
import { MICROSOFT_FLOW_COOKIE, SsoError, type SsoClaims } from "../../src/server/sso/oauth";
import { resetRateLimits } from "../../src/server/sso/rate-limit";
import { freshCtx, type Ctx } from "../helpers";

const CLIENT = "ms-client-id";
const TENANT = "11111111-2222-3333-4444-555555555555";
const OTHER_TENANT = "99999999-8888-7777-6666-555555555555";
const NONCE = "nonce-ms";
const ISS = (tid: string) => `https://login.microsoftonline.com/${tid}/v2.0`;

async function keys() {
  const a = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(a.publicKey)), kid: "m1", alg: "RS256", use: "sig" } as JWK;
  return { priv: a.privateKey, jwk, getKey: createLocalJWKSet({ keys: [jwk] }) };
}
type Keys = Awaited<ReturnType<typeof keys>>;
async function token(k: Keys, claims: Record<string, unknown> = {}, o: { iss?: string; aud?: string } = {}) {
  const tid = (claims.tid as string) ?? TENANT;
  return new SignJWT({ tid, oid: "oid-dev1", preferred_username: "dev1@Example.com", name: "Builder", nonce: NONCE, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "m1" }).setSubject("pairwise-sub").setIssuer(o.iss ?? ISS(tid)).setAudience(o.aud ?? CLIENT)
    .setIssuedAt().setExpirationTime("5m").sign(k.priv);
}

describe("Microsoft id_token verification", () => {
  let k: Keys;
  beforeAll(async () => { k = await keys(); });
  const verify = (t: string, tenant = TENANT) => verifyMicrosoftIdToken(t, { clientId: CLIENT, nonce: NONCE, keys: k.getKey, tenant });

  it("single tenant: accepts the token, uses tid:oid as subject and trusts the UPN as verified e-mail", async () => {
    const c = await verify(await token(k));
    expect(c).toEqual({ sub: `${TENANT}:oid-dev1`, email: "dev1@example.com", emailVerified: true, name: "Builder", picture: null, hd: "example.com" });
  });
  it("rejects a token of another tenant, a wrong issuer, audience or nonce", async () => {
    await expect(verify(await token(k, { tid: OTHER_TENANT }))).rejects.toMatchObject({ code: "idp_error", reason: "id_token_wrong_tenant" });
    await expect(verify(await token(k, {}, { iss: "https://evil.example/v2.0" }))).rejects.toMatchObject({ reason: "id_token_bad_iss" });
    await expect(verify(await token(k, {}, { aud: "someone-else" }))).rejects.toMatchObject({ reason: "id_token_bad_aud" });
    await expect(verify(await token(k, { nonce: "other" }))).rejects.toMatchObject({ reason: "id_token_bad_nonce" });
  });
  it("multi-tenant: an e-mail only counts as verified with xms_edov or from personal accounts (nOAuth)", async () => {
    const plain = await verify(await token(k, { email: "boss@example.com" }), "organizations");
    expect(plain).toMatchObject({ email: "boss@example.com", emailVerified: false, hd: null });
    expect(await verify(await token(k, { email: "boss@example.com", xms_edov: true }), "organizations")).toMatchObject({ emailVerified: true, hd: "example.com" });
    expect(await verify(await token(k, { tid: CONSUMERS_TENANT_ID, email: "me@outlook.com" }), "common")).toMatchObject({ emailVerified: true });
    // without an `email` claim the UPN is not trusted in multi-tenant mode
    await expect(verify(await token(k), "organizations")).rejects.toMatchObject({ reason: "id_token_no_email" });
  });
  it("organizations refuses personal accounts, consumers refuses work accounts", async () => {
    await expect(verify(await token(k, { tid: CONSUMERS_TENANT_ID, email: "me@outlook.com" }), "organizations")).rejects.toMatchObject({ reason: "id_token_wrong_tenant" });
    await expect(verify(await token(k, { email: "a@example.com" }), "consumers")).rejects.toMatchObject({ reason: "id_token_wrong_tenant" });
  });
});

describe("Microsoft configuration", () => {
  afterEach(() => { for (const n of ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_TENANT_ID", "MICROSOFT_OAUTH_BASE", "E2E_RESET"]) delete process.env[n]; });

  it("needs client id + secret; endpoints follow the tenant; the mock base only counts with E2E_RESET=1", () => {
    expect(microsoftEnv()).toBeNull();
    Object.assign(process.env, { MICROSOFT_CLIENT_ID: CLIENT, MICROSOFT_CLIENT_SECRET: "s", MICROSOFT_TENANT_ID: TENANT, MICROSOFT_OAUTH_BASE: "http://127.0.0.1:9" });
    const env = microsoftEnv()!;
    expect(env.authUrl).toBe(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`);
    expect(env.jwksUrl).toBe(`https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`);
    expect(isSingleTenant()).toBe(true);
    process.env.E2E_RESET = "1";
    expect(microsoftEnv()!.tokenUrl).toBe("http://127.0.0.1:9/token");
    delete process.env.MICROSOFT_TENANT_ID;
    expect(microsoftEnv()!.tenant).toBe("organizations");
    expect(isSingleTenant()).toBe(false);
  });
  it("builds an authorization URL with PKCE, nonce, query response mode and domain hint", () => {
    const u = new URL(buildMicrosoftAuthUrl({ authUrl: "https://login.microsoftonline.com/x/oauth2/v2.0/authorize", clientId: CLIENT, redirectUri: "https://app.test/api/auth/microsoft/callback", scope: "openid email profile" },
      { state: "st", nonce: "nn", verifier: "v".repeat(43), domainHint: "example.com" }));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ client_id: CLIENT, response_type: "code", response_mode: "query", scope: "openid email profile", state: "st", nonce: "nn", code_challenge_method: "S256", domain_hint: "example.com" });
  });
});

describe("signing in with Microsoft", () => {
  let c: Ctx;
  const ms = (o: Partial<SsoClaims> = {}): SsoClaims => ({ sub: `${TENANT}:oid-dev1`, email: "dev1@example.com", emailVerified: true, name: "Builder", picture: null, hd: "example.com", ...o });
  beforeEach(async () => {
    Object.assign(process.env, { MICROSOFT_CLIENT_ID: CLIENT, MICROSOFT_CLIENT_SECRET: "s", MICROSOFT_TENANT_ID: TENANT });
    c = await freshCtx();
  });
  afterEach(() => { for (const n of ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_TENANT_ID", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) delete process.env[n]; });

  it("shows the Microsoft button and can be switched off by the admin", async () => {
    expect(loginOptions()).toEqual({ google: false, microsoft: true, enforced: false });
    updateSettings(c.admin, { microsoftEnabled: false });
    expect(loginOptions().microsoft).toBe(false);
    await expect(signInWithSso("microsoft", ms())).rejects.toMatchObject({ code: "not_configured" });
  });
  it("matches an existing user by verified e-mail, links the Microsoft identity and signs in", async () => {
    const r = await signInWithSso("microsoft", ms());
    expect(r.user.id).toBe(c.member.id);
    expect(r.via).toBe("email");
    expect(identityOf(c.member.id, "microsoft")?.subject).toBe(`${TENANT}:oid-dev1`);
    expect((await signInWithSso("microsoft", ms())).via).toBe("subject");
  });
  it("never matches or creates a user with an unverified e-mail", async () => {
    await expect(signInWithSso("microsoft", ms({ emailVerified: false, hd: null }))).rejects.toMatchObject({ code: "email_not_verified" });
    expect(db.select().from(userIdentities).all()).toHaveLength(0);
  });
  it("keeps Google and Microsoft identities apart; a user may have one of each", async () => {
    Object.assign(process.env, { GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "gs" });
    linkGoogleToUser(c.member, { sub: "g-dev1", email: "dev1@example.com", emailVerified: true, name: null, picture: null, hd: "example.com" });
    linkSsoToUser("microsoft", c.member, ms());
    expect(identityOf(c.member.id, "google")?.subject).toBe("g-dev1");
    expect(identityOf(c.member.id, "microsoft")?.subject).toBe(`${TENANT}:oid-dev1`);
    // a second, different Microsoft account for the same user is refused
    expect(() => linkSsoToUser("microsoft", c.member, ms({ sub: `${TENANT}:other` }))).toThrow(SsoError);
  });
  it("enforcement works with Microsoft alone and needs the admin's own Microsoft identity", async () => {
    expect(() => updateSettings(c.admin, { enforceSso: true })).toThrow(/Koppel eerst je eigen Google- of Microsoft-account/);
    linkSsoToUser("microsoft", c.admin, ms({ sub: `${TENANT}:oid-admin`, email: "admin@example.com" }));
    expect(updateSettings(c.admin, { enforceSso: true }).enforced).toBe(true);
    expect(effective(c.accountId).enforced).toBe(true);
    expect(loginOptions()).toEqual({ google: false, microsoft: true, enforced: true });
  });
  it("a user without a password can unlink one provider while the other still works, but not the last one", async () => {
    Object.assign(process.env, { GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "gs" });
    const { users } = await import("../../src/db/schema/core");
    const { eq } = await import("drizzle-orm");
    db.update(users).set({ passwordHash: null }).where(eq(users.id, c.member.id)).run();
    linkGoogleToUser(c.member, { sub: "g-dev1", email: "dev1@example.com", emailVerified: true, name: null, picture: null, hd: "example.com" });
    linkSsoToUser("microsoft", c.member, ms());
    expect(profileView(c.member, "microsoft").canUnlink).toBe(true);
    unlinkIdentity(c.member, identityOf(c.member.id, "microsoft")!.id);
    expect(() => unlinkIdentity(c.member, identityOf(c.member.id, "google")!.id)).toThrow(/enige manier/);
  });
});

describe("Microsoft browser flow against a mock identity provider", () => {
  let k: Keys;
  let server: Server;
  let base = "";
  let lastNonce = "";
  let tokenClaims: Record<string, unknown> = {};
  beforeAll(async () => {
    k = await keys();
    server = createServer((req, res) => {
      if (req.url === "/keys") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ keys: [k.jwk] })); return; }
      if (req.url === "/token" && req.method === "POST") {
        let body = "";
        req.on("data", (d) => { body += d; });
        req.on("end", async () => {
          const p = new URLSearchParams(body);
          if (p.get("code") !== "good-code" || !p.get("code_verifier")) { res.statusCode = 400; res.end("{}"); return; }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ id_token: await token(k, { nonce: lastNonce, ...tokenClaims }) }));
        });
        return;
      }
      res.statusCode = 404; res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.close(); });
  beforeEach(async () => {
    Object.assign(process.env, { MICROSOFT_CLIENT_ID: CLIENT, MICROSOFT_CLIENT_SECRET: "s", MICROSOFT_TENANT_ID: TENANT, E2E_RESET: "1", MICROSOFT_OAUTH_BASE: base, APP_URL: "http://localhost:3999" });
    tokenClaims = {};
    resetRateLimits();
    await freshCtx();
  });
  afterEach(() => { for (const n of ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_TENANT_ID", "E2E_RESET", "MICROSOFT_OAUTH_BASE", "APP_URL"]) delete process.env[n]; });

  async function start(next = "/boards") {
    const res = await startSso(new NextRequest(`http://localhost:3999/api/auth/microsoft/start?next=${encodeURIComponent(next)}`), "microsoft");
    const loc = new URL(res.headers.get("location")!);
    lastNonce = loc.searchParams.get("nonce")!;
    const cookie = res.cookies.get(MICROSOFT_FLOW_COOKIE)!.value;
    return { loc, cookie, state: loc.searchParams.get("state")! };
  }
  const callback = (q: string, cookie?: string) =>
    callbackSso(new NextRequest(`http://localhost:3999/api/auth/microsoft/callback?${q}`, { headers: cookie ? { cookie: `${MICROSOFT_FLOW_COOKIE}=${cookie}` } : {} }), "microsoft");

  it("start redirects to the tenant's authorize endpoint; callback exchanges the code and signs in", async () => {
    const { loc, cookie, state } = await start();
    expect(`${loc.origin}${loc.pathname}`).toBe(`${base}/authorize`);
    expect(loc.searchParams.get("redirect_uri")).toBe("http://localhost:3999/api/auth/microsoft/callback");
    const res = await callback(`code=good-code&state=${state}`, cookie);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/boards");
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
    expect(db.select().from(userIdentities).all().map((i) => i.provider)).toEqual(["microsoft"]);
  });
  it("refuses a wrong state, a missing cookie and a token from another tenant", async () => {
    const { cookie, state } = await start();
    expect((await callback(`code=good-code&state=nope`, cookie)).headers.get("location")).toBe("/login?error=state_mismatch&provider=microsoft&next=%2Fboards");
    expect((await callback(`code=good-code&state=${state}`)).headers.get("location")).toBe("/login?error=state_mismatch&provider=microsoft");
    tokenClaims = { tid: OTHER_TENANT };
    const again = await start("/");
    const res = await callback(`code=good-code&state=${again.state}`, again.cookie);
    expect(res.headers.get("location")).toBe("/login?error=idp_error&provider=microsoft");
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });
  it("a Google flow cookie never completes a Microsoft callback", async () => {
    const { state } = await start();
    const res = await callbackSso(new NextRequest(`http://localhost:3999/api/auth/microsoft/callback?code=good-code&state=${state}`, { headers: { cookie: `weekend_google_oauth=x` } }), "microsoft");
    expect(res.headers.get("location")).toContain("error=state_mismatch");
  });
});
