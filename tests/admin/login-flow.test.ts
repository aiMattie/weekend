import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/client";
import { userSecurity } from "../../src/db/schema/audit-log";
import { ipAllowed, isValidEntry, ipMatches, normalizeIp } from "../../src/modules/admin/lib/ip";
import { totpAt } from "../../src/modules/admin/lib/totp";
import { verifySessionClaims } from "../../src/lib/auth/session";
import * as account from "../../src/server/services/account";
import * as audit from "../../src/server/services/audit";
import { authenticate } from "../../src/server/services/login-flow";
import * as profile from "../../src/server/services/profile";
import * as security from "../../src/server/services/security";
import * as sessions from "../../src/server/services/sessions";
import * as twofactor from "../../src/server/services/twofactor";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });
const PW = "pw-for-tests";
const email = (key: string) => `${key}@example.com`;

describe("login flow", () => {
  it("logs in with a server side session and audits it", async () => {
    const r = await authenticate({ email: email("dev1"), password: PW }, { ip: "1.2.3.4", userAgent: "Vitest" });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    const claims = await verifySessionClaims(r.token);
    expect(claims).toMatchObject({ userId: c.member.id, sid: r.sid });
    expect(sessions.isSessionAlive(c.member.id, r.sid, c.accountId)).toBe(true);
    expect(audit.list(c.admin, { event: "user.login" }).rows[0]).toMatchObject({ actorId: c.member.id, ip: "1.2.3.4" });
  });

  it("refuses wrong passwords, unknown users and AI agents, with a generic message", async () => {
    await expect(authenticate({ email: email("dev1"), password: "fout" })).rejects.toThrow(/Onjuiste/);
    await expect(authenticate({ email: "nobody@example.com", password: PW })).rejects.toThrow(/Onjuiste/);
    await expect(authenticate({ email: email("agent1"), password: PW })).rejects.toThrow(/Onjuiste/);
    expect(audit.list(c.admin, { event: "user.login_failed" }).rows).toHaveLength(3);
  });

  it("blocks a user after too many failed attempts", async () => {
    security.update(c.admin, { maxFailedLogins: 3 });
    for (let i = 0; i < 3; i++) await expect(authenticate({ email: email("dev1"), password: "fout" })).rejects.toThrow();
    await expect(authenticate({ email: email("dev1"), password: PW })).rejects.toThrow(/15 minuten/);
    db.update(userSecurity).set({ lockedUntil: new Date(Date.now() - 1000).toISOString() }).where(eq(userSecurity.userId, c.member.id)).run();
    await expect(authenticate({ email: email("dev1"), password: PW })).resolves.toMatchObject({ status: "ok" });
  });

  it("2FA: password first, then a code (or recovery code)", async () => {
    const setup = await twofactor.beginSetup(c.member);
    const { recoveryCodes } = twofactor.confirmSetup(c.member, totpAt(setup.secret));
    const step1 = await authenticate({ email: email("dev1"), password: PW });
    expect(step1.status).toBe("2fa_required");
    if (step1.status !== "2fa_required") return;
    await expect(authenticate({ challenge: step1.challenge, code: "000000" })).rejects.toThrow();
    await expect(authenticate({ challenge: "rommel", code: totpAt(setup.secret, Date.now() + 30_000) })).rejects.toThrow(/verlopen/);
    const ok = await authenticate({ challenge: step1.challenge, code: totpAt(setup.secret, Date.now() + 30_000) });
    expect(ok.status).toBe("ok");
    const viaRecovery = await authenticate({ challenge: step1.challenge, recoveryCode: recoveryCodes[3] });
    expect(viaRecovery.status).toBe("ok");
    await expect(authenticate({ challenge: step1.challenge, recoveryCode: recoveryCodes[3] })).rejects.toThrow();
    expect(audit.list(c.admin, { event: "user.2fa_recovery_used" }).rows).toHaveLength(1);
  });

  it("required 2FA flags users without it", async () => {
    security.update(c.admin, { twoFactorRequired: true });
    const r = await authenticate({ email: email("dev1"), password: PW });
    expect(r.status === "ok" && r.setup2fa).toBe(true);
  });
});

describe("panic button", () => {
  it("locks everybody out except an admin with the recovery code", async () => {
    const dev1 = await authenticate({ email: email("dev1"), password: PW });
    const admin = await authenticate({ email: email("admin"), password: PW });
    if (dev1.status !== "ok" || admin.status !== "ok") throw new Error("login");
    const { recoveryCode } = security.panic(c.admin, admin.sid);
    expect(recoveryCode).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
    // existing sessions are dead, except the admin's recovery session
    expect(sessions.isSessionAlive(c.member.id, dev1.sid, c.accountId)).toBe(false);
    expect(sessions.isSessionAlive(c.admin.id, admin.sid, c.accountId)).toBe(true);
    expect(sessions.isSessionAlive(c.member.id, undefined, c.accountId)).toBe(false); // legacy cookies too
    // new logins fail, also with a correct password
    await expect(authenticate({ email: email("dev1"), password: PW })).rejects.toMatchObject({ status: 423 });
    await expect(authenticate({ email: email("admin"), password: PW })).rejects.toMatchObject({ status: 423 });
    // a member cannot use the code, an admin needs the right one
    await expect(authenticate({ email: email("dev1"), password: PW, panicCode: recoveryCode })).rejects.toMatchObject({ status: 423 });
    await expect(authenticate({ email: email("admin"), password: PW, panicCode: "AAAA-AAAA-AAAA-AAAA" })).rejects.toMatchObject({ status: 423 });
    const rec = await authenticate({ email: email("owner"), password: PW, panicCode: recoveryCode });
    expect(rec.status).toBe("ok");
    if (rec.status === "ok") expect(sessions.isSessionAlive(rec.user.id, rec.sid, c.accountId)).toBe(true);
    expect(security.panicStatus(c.accountId).locked).toBe(true);
    // unlock: everybody can log in again
    security.unlock(c.admin);
    await expect(authenticate({ email: email("dev1"), password: PW })).resolves.toMatchObject({ status: "ok" });
    const events = audit.list(c.admin, { category: "security" }).rows.map((r) => r.event);
    expect(events).toEqual(expect.arrayContaining(["security.panic_activated", "security.panic_released", "user.login_blocked"]));
  });

  it("only users with account:security can press it", () => {
    expect(() => security.panic(c.member)).toThrow(/Not allowed/);
    expect(() => security.unlock(c.member)).toThrow(/Not allowed/);
  });
});

describe("sessions", () => {
  it("lists, revokes one and revokes all others", async () => {
    const a = await authenticate({ email: email("dev1"), password: PW });
    const b = await authenticate({ email: email("dev1"), password: PW });
    const d = await authenticate({ email: email("dev1"), password: PW });
    if (a.status !== "ok" || b.status !== "ok" || d.status !== "ok") throw new Error("login");
    expect(sessions.list(c.member, c.member.id, a.sid).map((s) => s.current)).toContain(true);
    sessions.revoke(c.member, b.sid);
    expect(sessions.isSessionAlive(c.member.id, b.sid, c.accountId)).toBe(false);
    expect(sessions.revokeOthers(c.member, a.sid)).toBe(1);
    expect(sessions.isSessionAlive(c.member.id, a.sid, c.accountId)).toBe(true);
    expect(sessions.isSessionAlive(c.member.id, d.sid, c.accountId)).toBe(false);
    // somebody else's session
    const other = await authenticate({ email: email("dev2"), password: PW });
    if (other.status !== "ok") throw new Error("login");
    expect(() => sessions.revoke(c.member, other.sid)).toThrow(/Not allowed/);
    sessions.revoke(c.admin, other.sid);
    expect(sessions.isSessionAlive(c.viewer.id, other.sid, c.accountId)).toBe(false);
  });

  it("changing the password signs out other sessions and enforces the policy", async () => {
    const a = await authenticate({ email: email("dev1"), password: PW });
    const b = await authenticate({ email: email("dev1"), password: PW });
    if (a.status !== "ok" || b.status !== "ok") throw new Error("login");
    await expect(profile.changePassword(c.member, { current: "fout", next: "Nieuw-wachtwoord-1" }, a.sid)).rejects.toThrow();
    await expect(profile.changePassword(c.member, { current: PW, next: "kort" }, a.sid)).rejects.toThrow(/Minimaal/);
    await profile.changePassword(c.member, { current: PW, next: "Nieuw-wachtwoord-1" }, a.sid);
    expect(sessions.isSessionAlive(c.member.id, a.sid, c.accountId)).toBe(true);
    expect(sessions.isSessionAlive(c.member.id, b.sid, c.accountId)).toBe(false);
    await expect(authenticate({ email: email("dev1"), password: PW })).rejects.toThrow();
    await expect(authenticate({ email: email("dev1"), password: "Nieuw-wachtwoord-1" })).resolves.toMatchObject({ status: "ok" });
  });
});

describe("IP allow-list", () => {
  it("matches exact addresses, IPv4 ranges and loopback variants", () => {
    expect(isValidEntry("10.0.0.0/8")).toBe(true);
    expect(isValidEntry("10.0.0.0/33")).toBe(false);
    expect(isValidEntry("hallo")).toBe(false);
    expect(ipMatches("10.1.2.3", "10.0.0.0/8")).toBe(true);
    expect(ipMatches("11.1.2.3", "10.0.0.0/8")).toBe(false);
    expect(ipMatches("203.0.113.7", "203.0.113.7")).toBe(true);
    expect(ipMatches("203.0.113.8", "203.0.113.7")).toBe(false);
    expect(normalizeIp("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(ipAllowed("::1", ["127.0.0.1"])).toBe(true);
    expect(ipAllowed("1.1.1.1", [])).toBe(true);
    expect(ipAllowed("1.1.1.1", ["2.2.2.2"])).toBe(false);
  });

  it("refuses a list that locks out the admin and validates entries", () => {
    expect(() => security.update(c.admin, { ipAllowlist: ["203.0.113.0/24"] }, { ip: "198.51.100.1" })).toThrow(/lock yourself out/);
    expect(() => security.update(c.admin, { ipAllowlist: ["nope"] }, { ip: "198.51.100.1" })).toThrow(/Invalid IP/);
    expect(security.update(c.admin, { ipAllowlist: ["203.0.113.0/24", "198.51.100.1"] }, { ip: "198.51.100.1" }).ipAllowlist).toHaveLength(2);
  });
});

describe("account settings", () => {
  it("account settings: general, validation and audit", () => {
    const a = account.update(c.admin, { name: "Example BV", weekStart: "sunday", timeZone: "Europe/London" });
    expect(a).toMatchObject({ name: "Example BV", general: { weekStart: "sunday", timeZone: "Europe/London", defaultLocale: "nl" } });
    expect(() => account.update(c.admin, { timeZone: "Mars/Olympus" })).toThrow();
    expect(() => account.update(c.member, { name: "x" })).toThrow(/Not allowed/);
    expect(account.get(c.member).name).toBe("Example BV");
    expect(audit.list(c.admin, { event: "account.settings_changed" }).rows).toHaveLength(1);
  });
});
