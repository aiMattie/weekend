import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type JWK } from "jose";
import { describe, expect, it } from "vitest";
import { buildAuthUrl, checkClaims, domainAllowed, exchangeCode, hdHint, isValidCodeVerifier, newCodeVerifier, pkceChallenge, randomUrlToken, sanitizeNext, signFlow, SsoError, verifyFlow, verifyIdToken } from "../../src/server/sso/oauth";
import { parseDomains } from "../../src/server/sso/config";
import { rateLimited, resetRateLimits } from "../../src/server/sso/rate-limit";

const CLIENT = "client-123.apps.googleusercontent.com";
const NONCE = "nonce-abc";

async function keys() {
  const a = await generateKeyPair("RS256");
  const b = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(a.publicKey)), kid: "k1", alg: "RS256", use: "sig" } as JWK;
  return { priv: a.privateKey, other: b.privateKey, getKey: createLocalJWKSet({ keys: [jwk] }) };
}
interface Over { claims?: Record<string, unknown>; iss?: string; aud?: string; exp?: string | number; key?: "other" }
async function token(k: Awaited<ReturnType<typeof keys>>, o: Over = {}) {
  const jwt = new SignJWT({ email: "dev1@Example.com", email_verified: true, name: "Builder", hd: "example.com", nonce: NONCE, ...o.claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" }).setSubject("sub-1").setIssuer(o.iss ?? "https://accounts.google.com").setAudience(o.aud ?? CLIENT)
    .setIssuedAt().setExpirationTime(o.exp ?? "5m");
  return jwt.sign(o.key === "other" ? k.other : k.priv);
}

describe("PKCE, state and nonce helpers", () => {
  it("matches the RFC 7636 test vector", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("creates valid, unique verifiers and url-safe random tokens", () => {
    const v = newCodeVerifier();
    expect(isValidCodeVerifier(v)).toBe(true);
    expect(isValidCodeVerifier("kort")).toBe(false);
    expect(new Set([randomUrlToken(), randomUrlToken(), randomUrlToken()]).size).toBe(3);
    expect(randomUrlToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("builds the authorization URL (S256, state, nonce, select_account, hd only for exactly one domain)", () => {
    const f = { state: "s", nonce: "n", verifier: newCodeVerifier(), hd: hdHint(["example.com"]) };
    const u = new URL(buildAuthUrl({ authUrl: "https://accounts.google.com/o/oauth2/v2/auth", clientId: CLIENT, redirectUri: "https://weekend.example.com/api/auth/google/callback" }, f));
    expect(u.searchParams.get("scope")).toBe("openid email profile");
    expect(u.searchParams.get("prompt")).toBe("select_account");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBe(pkceChallenge(f.verifier));
    expect(u.searchParams.get("redirect_uri")).toBe("https://weekend.example.com/api/auth/google/callback");
    expect(u.searchParams.get("hd")).toBe("example.com");
    expect(u.searchParams.get("state")).toBe("s");
    expect(u.searchParams.get("nonce")).toBe("n");
    expect(hdHint(["a.nl", "b.nl"])).toBeUndefined();
    expect(hdHint([])).toBeUndefined();
  });
});

describe("flow cookie", () => {
  const flow = { state: "st", nonce: "no", verifier: newCodeVerifier(), next: "/boards/1?x=2", mode: "login" as const };
  it("round-trips and rejects tampering", async () => {
    const t = await signFlow(flow);
    expect(await verifyFlow(t)).toMatchObject(flow);
    expect(await verifyFlow(t.slice(0, -2) + "xx")).toBeNull();
    expect(await verifyFlow("rommel")).toBeNull();
    expect(await verifyFlow(undefined)).toBeNull();
  });
  it("re-sanitizes next when reading", async () => {
    const t = await signFlow({ ...flow, next: "//evil.example" });
    expect((await verifyFlow(t))?.next).toBe("/");
  });
});

describe("open redirect: sanitizeNext", () => {
  it.each(["/", "/boards/12", "/boards/12?item=3#x", "/admin/sso"])("keeps %s", (n) => expect(sanitizeNext(n)).toBe(n));
  it.each([
    "//evil.example", "https://evil.example", "http://evil.example/x", "/\\evil.example", "\\\\evil.example", "javascript:alert(1)", "evil.example", "",
    "/%0d%0aSet-Cookie:x=1", "/%2f%2fevil.example", "/%5Cevil.example", "/a\nb", "///evil.example", "/" + "a".repeat(600),
  ])("rejects %j", (n) => expect(sanitizeNext(n)).toBe("/"));
  it("rejects non-strings and honours the fallback", () => {
    expect(sanitizeNext(undefined)).toBe("/");
    expect(sanitizeNext(null)).toBe("/");
    expect(sanitizeNext(42)).toBe("/");
    expect(sanitizeNext("//x", "/home")).toBe("/home");
  });
});

describe("id_token validation matrix", () => {
  const verify = (t: string, k: Awaited<ReturnType<typeof keys>>, o: { nonce?: string; clientId?: string; now?: Date } = {}) =>
    verifyIdToken(t, { clientId: o.clientId ?? CLIENT, nonce: o.nonce ?? NONCE, keys: k.getKey, now: o.now });
  const reason = async (p: Promise<unknown>) => { try { await p; return "no error"; } catch (e) { return e instanceof SsoError ? `${e.code}/${e.reason}` : String(e); } };

  it("accepts a valid token and normalises the claims", async () => {
    const k = await keys();
    expect(await verify(await token(k), k)).toEqual({ sub: "sub-1", email: "dev1@example.com", emailVerified: true, name: "Builder", picture: null, hd: "example.com" });
  });
  it("accepts both issuer spellings", async () => {
    const k = await keys();
    await expect(verify(await token(k, { iss: "accounts.google.com" }), k)).resolves.toMatchObject({ sub: "sub-1" });
  });
  it("rejects a bad signature", async () => {
    const k = await keys();
    expect(await reason(verify(await token(k, { key: "other" }), k))).toMatch(/^idp_error\/id_token_jws_signature_verification_failed/);
  });
  it("rejects a wrong audience", async () => {
    const k = await keys();
    expect(await reason(verify(await token(k, { aud: "andere-client" }), k))).toBe("idp_error/id_token_bad_aud");
    expect(await reason(verify(await token(k), k, { clientId: "nog-een-client" }))).toBe("idp_error/id_token_bad_aud");
  });
  it("rejects a wrong issuer", async () => {
    const k = await keys();
    expect(await reason(verify(await token(k, { iss: "https://evil.example" }), k))).toBe("idp_error/id_token_bad_iss");
  });
  it("rejects an expired token", async () => {
    const k = await keys();
    const t = await token(k, { exp: Math.floor(Date.now() / 1000) - 3600 });
    expect(await reason(verify(t, k))).toBe("idp_error/id_token_bad_exp");
  });
  it("rejects a wrong or missing nonce", async () => {
    const k = await keys();
    expect(await reason(verify(await token(k), k, { nonce: "iets-anders" }))).toBe("idp_error/id_token_bad_nonce");
    expect(await reason(verify(await token(k, { claims: { nonce: undefined } }), k))).toBe("idp_error/id_token_bad_nonce");
  });
  it("rejects a token signed with an unsupported algorithm (alg none / HS256)", async () => {
    const k = await keys();
    const hs = await new SignJWT({ email: "a@b.nl", nonce: NONCE }).setProtectedHeader({ alg: "HS256" }).setSubject("s").setIssuer("https://accounts.google.com").setAudience(CLIENT).setExpirationTime("5m").sign(new TextEncoder().encode("secret-secret-secret-secret-secret-12"));
    expect(await reason(verify(hs, k))).toMatch(/^idp_error\//);
    expect(await reason(verify("eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.", k))).toMatch(/^idp_error\//);
  });
  it("requires sub and email", async () => {
    const k = await keys();
    expect(await reason(verify(await token(k, { claims: { email: undefined } }), k))).toBe("idp_error/id_token_no_email");
  });
});

describe("claims policy: email_verified and domains", () => {
  const claims = (o: Partial<{ email: string; hd: string | null; emailVerified: boolean }> = {}) => ({ sub: "s", email: "dev1@example.com", emailVerified: true, name: null, picture: null, hd: "example.com", ...o });
  const code = (c: ReturnType<typeof claims>, d: string[]) => { try { checkClaims(c, d); return "ok"; } catch (e) { return (e as SsoError).code; } };

  it("requires email_verified === true", () => {
    expect(code(claims({ emailVerified: false }), [])).toBe("email_not_verified");
    expect(code(claims(), [])).toBe("ok");
  });
  it("without allowed domains there is no restriction", () => {
    expect(code(claims({ email: "iemand@gmail.com", hd: null }), [])).toBe("ok");
  });
  it("with allowed domains both the e-mail domain and hd must be listed", () => {
    expect(code(claims(), ["example.com"])).toBe("ok");
    expect(code(claims({ email: "x@example.org", hd: "example.org" }), ["example.com", "example.org"])).toBe("ok");
    expect(code(claims({ email: "x@example.org", hd: "example.com" }), ["example.com", "example.org"])).toBe("ok"); // alias domain of the same Workspace
    expect(code(claims({ email: "x@evil.example", hd: "example.com" }), ["example.com"])).toBe("domain_not_allowed"); // wrong e-mail domain
    expect(code(claims({ hd: "evil.example" }), ["example.com"])).toBe("domain_not_allowed"); // wrong hd
    expect(code(claims({ hd: null }), ["example.com"])).toBe("domain_not_allowed"); // consumer account with a company address: no hd
    expect(domainAllowed({ email: "x@EXAMPLE.COM", hd: "example.com" }, ["Example.com"])).toBe(true);
  });
  it("parses domain lists", () => {
    expect(parseDomains("Example.com, @example.org;example.com nope /x")).toEqual(["example.com", "example.org"]);
    expect(parseDomains(undefined)).toEqual([]);
  });
});

describe("token endpoint", () => {
  const env = { tokenUrl: "http://idp.test/token", clientId: CLIENT, clientSecret: "geheim", redirectUri: "http://localhost:3058/api/auth/google/callback" };
  it("posts the code with the PKCE verifier and returns the id_token", async () => {
    let seen: URLSearchParams | null = null;
    const f = (async (_u: unknown, init?: RequestInit) => { seen = new URLSearchParams(String(init?.body)); return Response.json({ id_token: "abc.def.ghi", access_token: "x" }); }) as typeof fetch;
    expect(await exchangeCode(env, "the-code", "v".repeat(50), f)).toBe("abc.def.ghi");
    expect(seen!.get("grant_type")).toBe("authorization_code");
    expect(seen!.get("code_verifier")).toBe("v".repeat(50));
    expect(seen!.get("redirect_uri")).toBe(env.redirectUri);
  });
  it("maps failures to idp_error without leaking the response", async () => {
    const bad = (async () => new Response("invalid_grant secret-details", { status: 400 })) as typeof fetch;
    await expect(exchangeCode(env, "c", "v".repeat(50), bad)).rejects.toMatchObject({ code: "idp_error", reason: "token_endpoint_400" });
    const none = (async () => Response.json({})) as typeof fetch;
    await expect(exchangeCode(env, "c", "v".repeat(50), none)).rejects.toMatchObject({ reason: "token_endpoint_no_id_token" });
    const down = (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch;
    await expect(exchangeCode(env, "c", "v".repeat(50), down)).rejects.toMatchObject({ reason: "token_endpoint_unreachable" });
  });
});

describe("rate limit", () => {
  it("allows up to the limit per key and window", () => {
    resetRateLimits();
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimited("ip1", 3, 60_000, t)).toBe(false);
    expect(rateLimited("ip1", 3, 60_000, t)).toBe(true);
    expect(rateLimited("ip2", 3, 60_000, t)).toBe(false);
    expect(rateLimited("ip1", 3, 60_000, t + 61_000)).toBe(false);
  });
});
