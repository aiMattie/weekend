import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/client";
import { users } from "../../src/db/schema/core";
import { userIdentities } from "../../src/db/schema/sso";
import { verifySessionClaims } from "../../src/lib/auth/session";
import { setRuntimeOverride } from "../../src/server/sso/config";
import type { GoogleClaims } from "../../src/server/sso/oauth";
import * as audit from "../../src/server/services/audit";
import { linkGoogleToUser, previewGoogleLogin, signInWithGoogle } from "../../src/server/services/google-sso";
import { authenticate } from "../../src/server/services/login-flow";
import * as security from "../../src/server/services/security";
import { adminView, disableEnforcementFor, effective, identityOf, isPasswordLoginBlocked, loginOptions, profileView, unlinkIdentity, updateSettings } from "../../src/server/services/sso-settings";
import { isSessionAlive } from "../../src/server/services/sessions";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
const PW = "pw-for-tests";
const claims = (o: Partial<GoogleClaims> = {}): GoogleClaims => ({ sub: "g-dev1", email: "dev1@example.com", emailVerified: true, name: "Builder", picture: null, hd: "example.com", ...o });
const events = (name: string) => audit.list(c.admin, { event: name }).rows;

beforeEach(async () => {
  process.env.GOOGLE_CLIENT_ID = "cid";
  process.env.GOOGLE_CLIENT_SECRET = "csecret";
  c = await freshCtx();
});
afterEach(() => { delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET; delete process.env.GOOGLE_ALLOWED_DOMAINS; setRuntimeOverride(null); });

describe("configuration", () => {
  it("is off without client id / secret and on with them", () => {
    expect(loginOptions()).toEqual({ google: true, microsoft: false, enforced: false });
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(loginOptions()).toEqual({ google: false, microsoft: false, enforced: false });
    expect(adminView(c.admin).status).toBe("not_configured");
  });
  it("refuses sign-in while not configured, or when the admin disabled it", async () => {
    updateSettings(c.admin, { enabled: false });
    await expect(signInWithGoogle(claims())).rejects.toMatchObject({ code: "not_configured" });
    expect(loginOptions().google).toBe(false);
  });
  it("merges domains from the environment and the admin setting", () => {
    process.env.GOOGLE_ALLOWED_DOMAINS = "Example.com";
    updateSettings(c.admin, { allowedDomains: ["example.org", "@Example.com"] });
    expect(effective(c.accountId).allowedDomains).toEqual(["example.com", "example.org"]);
    expect(() => updateSettings(c.admin, { allowedDomains: ["geen domein"] })).toThrow(/Ongeldig domein/);
  });
  it("shows the redirect URI of the current APP_URL, never secret values", () => {
    const v = adminView(c.admin);
    expect(v.redirectUris).toEqual([{ label: "current", uri: "http://localhost:3058/api/auth/google/callback" }]);
    expect(JSON.stringify(v)).not.toContain("csecret");
    expect(v.env.find((e) => e.name === "GOOGLE_CLIENT_ID")?.present).toBe(true);
  });
  it("only owners of account:security may change settings", () => {
    expect(() => updateSettings(c.member, { enabled: false })).toThrow();
    expect(() => adminView(c.member)).toThrow();
  });
});

describe("matching, linking, refusing", () => {
  it("matches an existing user by verified e-mail (case-insensitive), links the sub and creates a real session", async () => {
    const r = await signInWithGoogle(claims({ email: "dev1@example.com" }), { ip: "9.9.9.9", userAgent: "Vitest" });
    expect(r.user.id).toBe(c.member.id);
    expect(r.via).toBe("email");
    expect(await verifySessionClaims(r.token)).toMatchObject({ userId: c.member.id, sid: r.sid });
    expect(isSessionAlive(c.member.id, r.sid, c.accountId)).toBe(true);
    expect(identityOf(c.member.id)).toMatchObject({ subject: "g-dev1", provider: "google" });
    expect(db.select().from(users).where(eq(users.id, c.member.id)).get()?.lastLoginAt).toBeTruthy();
    expect(events("sso.identity_linked")).toHaveLength(1);
    expect(events("sso.login_success")[0]).toMatchObject({ actorId: c.member.id, ip: "9.9.9.9" });
    expect(events("user.login")[0].details).toMatchObject({ via: "google" });
  });

  it("matches by subject first, even when the e-mail changed", async () => {
    await signInWithGoogle(claims());
    db.update(users).set({ email: "dev1.nieuw@example.com" }).where(eq(users.id, c.member.id)).run();
    const r = await signInWithGoogle(claims({ email: "dev1.google-nieuw@example.com" }));
    expect(r.via).toBe("subject");
    expect(r.user.id).toBe(c.member.id);
    expect(identityOf(c.member.id)?.email).toBe("dev1.google-nieuw@example.com");
    expect(events("sso.identity_linked")).toHaveLength(1);
  });

  it("does not let another Google account take over a user that is already linked", async () => {
    await signInWithGoogle(claims());
    await expect(signInWithGoogle(claims({ sub: "g-andere-persoon" }))).rejects.toMatchObject({ code: "no_account", reason: "identity_mismatch" });
  });

  it("refuses unknown users by default with a no_account error and audits the reason", async () => {
    await expect(signInWithGoogle(claims({ sub: "g-x", email: "onbekend@example.com" }))).rejects.toMatchObject({ code: "no_account" });
    const f = events("sso.login_failed");
    expect(f).toHaveLength(1);
    expect(f[0].details).toMatchObject({ reason: "unknown_user", result: "no_account", email: "onbekend@example.com" });
    expect(db.select().from(users).where(eq(users.email, "onbekend@example.com")).get()).toBeUndefined();
  });

  it("refuses unverified e-mail addresses and domains that are not allowed", async () => {
    await expect(signInWithGoogle(claims({ emailVerified: false }))).rejects.toMatchObject({ code: "email_not_verified" });
    updateSettings(c.admin, { allowedDomains: ["example.com"] });
    await expect(signInWithGoogle(claims({ hd: "evil.example" }))).rejects.toMatchObject({ code: "domain_not_allowed" });
    await expect(signInWithGoogle(claims({ hd: null }))).rejects.toMatchObject({ code: "domain_not_allowed" });
    await expect(signInWithGoogle(claims({ email: "dev1@gmail.com", hd: null }))).rejects.toMatchObject({ code: "domain_not_allowed" });
    expect(identityOf(c.member.id)).toBeNull();
  });

  it("refuses deactivated users and AI agents", async () => {
    db.update(users).set({ isActive: false }).where(eq(users.id, c.member.id)).run();
    await expect(signInWithGoogle(claims())).rejects.toMatchObject({ code: "account_disabled" });
    await expect(signInWithGoogle(claims({ sub: "g-agent1", email: "agent1@example.com" }))).rejects.toMatchObject({ code: "account_disabled" });
  });

  it("honours the panic lock (no own 2FA needed otherwise) and the IP allow-list", async () => {
    security.update(c.admin, { ipAllowlist: ["10.0.0.0/8"] }, { ip: "10.1.1.1" });
    await expect(signInWithGoogle(claims(), { ip: "203.0.113.5" })).rejects.toMatchObject({ code: "locked", reason: "ip_blocked" });
    await expect(signInWithGoogle(claims(), { ip: "10.2.3.4" })).resolves.toMatchObject({ via: "email" });
    security.panic(c.admin);
    await expect(signInWithGoogle(claims(), { ip: "10.2.3.4" })).rejects.toMatchObject({ code: "locked", reason: "panic_lock" });
  });
});

describe("auto-provisioning", () => {
  const newbie = () => claims({ sub: "g-new", email: "nieuw.persoon@example.com", name: "Nieuw Persoon", picture: "https://lh3.googleusercontent.com/a/x" });

  it("is off by default", async () => {
    updateSettings(c.admin, { allowedDomains: ["example.com"] });
    await expect(signInWithGoogle(newbie())).rejects.toMatchObject({ code: "no_account", reason: "unknown_user" });
  });
  it("cannot be enabled without an allowed domain", () => {
    expect(() => updateSettings(c.admin, { autoProvision: true })).toThrow(/toegestaan domein/);
  });
  it("creates a Member with name and avatar from Google, links the identity and audits it", async () => {
    updateSettings(c.admin, { allowedDomains: ["example.com"], autoProvision: true });
    const r = await signInWithGoogle(newbie());
    expect(r.via).toBe("provisioned");
    expect(r.user).toMatchObject({ name: "Nieuw Persoon", email: "nieuw.persoon@example.com", role: "member", passwordHash: null, photoUrl: "https://lh3.googleusercontent.com/a/x", accountId: c.accountId });
    expect(identityOf(r.user.id)?.subject).toBe("g-new");
    expect(events("sso.user_provisioned")).toHaveLength(1);
    expect(events("sso.login_success")).toHaveLength(1);
    // the second login finds the user by subject and does not create another one
    expect((await signInWithGoogle(newbie())).via).toBe("subject");
  });
  it("does not provision outside the allowed domains", async () => {
    updateSettings(c.admin, { allowedDomains: ["example.com"], autoProvision: true });
    await expect(signInWithGoogle(claims({ sub: "g-ext", email: "extern@evil.example", hd: "evil.example" }))).rejects.toMatchObject({ code: "domain_not_allowed" });
    expect(db.select().from(users).where(eq(users.email, "extern@evil.example")).get()).toBeUndefined();
  });
  it("a provisioned user cannot log in with a password", async () => {
    updateSettings(c.admin, { allowedDomains: ["example.com"], autoProvision: true });
    await signInWithGoogle(newbie());
    await expect(authenticate({ email: "nieuw.persoon@example.com", password: "" })).rejects.toThrow(/Onjuiste/);
  });
});

describe("link / unlink and the test preview", () => {
  it("links from the profile and refuses accounts that belong to someone else", async () => {
    linkGoogleToUser(c.member, claims());
    expect(identityOf(c.member.id)?.subject).toBe("g-dev1");
    expect(() => linkGoogleToUser(c.viewer, claims())).toThrowError(expect.objectContaining({ code: "already_linked" }));
    expect(() => linkGoogleToUser(c.member, claims({ sub: "g-ander" }))).toThrowError(expect.objectContaining({ code: "already_linked" }));
  });
  it("lets a user unlink while a password remains, but not the only way to log in", async () => {
    linkGoogleToUser(c.member, claims());
    expect(profileView(c.member)).toMatchObject({ available: true, canUnlink: true });
    unlinkIdentity(c.member, identityOf(c.member.id)!.id);
    expect(identityOf(c.member.id)).toBeNull();
    expect(events("sso.identity_unlinked")).toHaveLength(1);

    db.update(users).set({ passwordHash: null }).where(eq(users.id, c.member.id)).run();
    linkGoogleToUser(c.member, claims());
    expect(profileView(c.member)).toMatchObject({ canUnlink: false });
    expect(() => unlinkIdentity(c.member, identityOf(c.member.id)!.id)).toThrow(/enige manier/);
    // an admin may remove it for someone else
    unlinkIdentity(c.admin, identityOf(c.member.id)!.id);
    expect(identityOf(c.member.id)).toBeNull();
  });
  it("previews what would happen without side effects", () => {
    expect(previewGoogleLogin(c.accountId, claims())).toEqual({ outcome: "ok", match: "email" });
    expect(previewGoogleLogin(c.accountId, claims({ email: "niemand@example.com", sub: "z" }))).toEqual({ outcome: "no_account", match: "none" });
    expect(previewGoogleLogin(c.accountId, claims({ emailVerified: false })).outcome).toBe("email_not_verified");
    expect(identityOf(c.member.id)).toBeNull();
    expect(db.select().from(userIdentities).all()).toHaveLength(0);
  });
});

describe("enforce SSO and break-glass", () => {
  const link = (a: typeof c.admin) => linkGoogleToUser(a, claims({ sub: "g-admin", email: "admin@example.com" }));

  it("refuses to turn on unless the current admin has a linked Google identity", () => {
    expect(() => updateSettings(c.admin, { enforceSso: true })).toThrow(/Koppel eerst je eigen Google- of Microsoft-account/);
    expect(effective(c.accountId).enforced).toBe(false);
    link(c.admin);
    expect(updateSettings(c.admin, { enforceSso: true }).enforced).toBe(true);
    expect(loginOptions()).toEqual({ google: true, microsoft: false, enforced: true });
  });
  it("refuses to turn on while Google is not configured", () => {
    link(c.admin);
    delete process.env.GOOGLE_CLIENT_ID;
    expect(() => updateSettings(c.admin, { enforceSso: true })).toThrow(/niet geconfigureerd/);
  });
  it("blocks password login for everybody except break-glass admins (also for unknown e-mails)", async () => {
    link(c.admin);
    updateSettings(c.admin, { enforceSso: true });
    await expect(authenticate({ email: "dev1@example.com", password: PW })).rejects.toMatchObject({ status: 403, details: { code: "sso_enforced" } });
    await expect(authenticate({ email: "admin@example.com", password: PW })).rejects.toMatchObject({ status: 403 });
    await expect(authenticate({ email: "niemand@example.com", password: PW })).rejects.toMatchObject({ status: 403 });
    expect(events("user.login_blocked").some((e) => (e.details as { reason?: string }).reason === "sso_enforced")).toBe(true);

    updateSettings(c.admin, { breakGlassUserIds: [c.admin.id] });
    expect(isPasswordLoginBlocked(c.accountId, c.admin.id)).toBe(false);
    await expect(authenticate({ email: "admin@example.com", password: PW })).resolves.toMatchObject({ status: "ok" });
    await expect(authenticate({ email: "dev1@example.com", password: PW })).rejects.toMatchObject({ status: 403 });
    // Google logins still work for everybody
    await expect(signInWithGoogle(claims())).resolves.toMatchObject({ via: "email" });
  });
  it("break-glass is for active admins only", () => {
    expect(() => updateSettings(c.admin, { breakGlassUserIds: [c.member.id] })).toThrow(/beheerders/);
  });
  it("enforcement lapses by itself when the env vars disappear (no lock-out)", async () => {
    link(c.admin);
    updateSettings(c.admin, { enforceSso: true });
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(effective(c.accountId)).toMatchObject({ enforceSso: true, enforced: false });
    await expect(authenticate({ email: "dev1@example.com", password: PW })).resolves.toMatchObject({ status: "ok" });
  });
  it("won't let the last way to log in be unlinked while enforcement blocks the password", () => {
    link(c.admin);
    linkGoogleToUser(c.member, claims());
    updateSettings(c.admin, { enforceSso: true });
    expect(profileView(c.member).canUnlink).toBe(false);
    expect(() => unlinkIdentity(c.member, identityOf(c.member.id)!.id)).toThrow(/enige manier/);
  });
  it("the recovery script turns enforcement off, flags the admin and audits it", async () => {
    link(c.admin);
    updateSettings(c.admin, { enforceSso: true });
    expect(disableEnforcementFor("admin@example.com")).toEqual({ found: true, wasEnforced: true, admin: true });
    expect(effective(c.accountId).enforced).toBe(false);
    expect(adminView(c.admin).settings.breakGlassUserIds).toContain(c.admin.id);
    expect(events("sso.enforcement_disabled")).toHaveLength(1);
    expect(disableEnforcementFor("niemand@example.com").found).toBe(false);
    await expect(authenticate({ email: "dev1@example.com", password: PW })).resolves.toMatchObject({ status: "ok" });
  });
});

describe("audit hygiene", () => {
  it("records settings changes without secrets", () => {
    updateSettings(c.admin, { allowedDomains: ["example.com"], autoProvision: true });
    const e = events("sso.settings_changed")[0];
    expect(e.details).toMatchObject({ changed: ["allowedDomains", "autoProvision"], autoProvision: true });
    expect(JSON.stringify(e)).not.toMatch(/csecret/);
  });
});
