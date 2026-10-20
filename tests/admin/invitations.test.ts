import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/client";
import { auditLog, invitations } from "../../src/db/schema/audit-log";
import { users } from "../../src/db/schema/core";
import { can } from "../../src/lib/permissions";
import * as audit from "../../src/server/services/audit";
import * as members from "../../src/server/services/members";
import * as permissions from "../../src/server/services/permissions";
import * as account from "../../src/server/services/account";
import * as security from "../../src/server/services/security";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

const tokenOf = (link: string) => link.split("/").pop()!;

describe("invitations", () => {
  it("invites by e-mail and the invited person accepts with a password", async () => {
    const inv = members.invite(c.admin, { email: "Nieuw@Voorbeeld.nl", name: "Nieuwe Collega", role: "member" }, { origin: "http://x" });
    expect(inv.link).toMatch(/^http:\/\/x\/accept-invite\/.{20,}/);
    expect(inv.email).toBe("nieuw@voorbeeld.nl");
    expect(JSON.stringify(inv)).not.toContain("tokenHash");
    expect(members.getInvitationByToken(tokenOf(inv.link))).toMatchObject({ email: "nieuw@voorbeeld.nl", state: "pending", role: "member" });
    const r = await members.acceptInvitation(tokenOf(inv.link), { password: "Geheim-12345" });
    expect(r.user).toMatchObject({ email: "nieuw@voorbeeld.nl", role: "member", name: "Nieuwe Collega", isActive: true });
    expect(r.token.split(".")).toHaveLength(3);
    expect(members.getInvitationByToken(tokenOf(inv.link))?.state).toBe("accepted");
    // a token works once
    await expect(members.acceptInvitation(tokenOf(inv.link), { password: "Geheim-12345" })).rejects.toThrow();
    // an outbox mail was written
    expect(audit.list(c.admin, { event: "invitation.accepted" }).rows).toHaveLength(1);
  });

  it("only users with account:invite may invite; admins only can grant admin", () => {
    expect(() => members.invite(c.member, { email: "a@b.nl" })).toThrow(/Not allowed/);
    expect(can(c.member, "account:invite")).toBe(false);
    expect(() => members.invite(c.admin, { email: "geen-mail" })).toThrow();
  });

  it("rejects duplicate users, revoked and expired invitations, and weak passwords", async () => {
    expect(() => members.invite(c.admin, { email: "dev1@example.com" })).toThrow(/already exists/);
    const a = members.invite(c.admin, { email: "a@voorbeeld.nl" });
    members.revokeInvitation(c.admin, a.id);
    await expect(members.acceptInvitation(tokenOf(a.link), { password: "Geheim-12345" })).rejects.toThrow();
    expect(members.getInvitationByToken(tokenOf(a.link))?.state).toBe("revoked");

    const b = members.invite(c.admin, { email: "b@voorbeeld.nl" });
    db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(invitations.id, b.id)).run();
    expect(members.getInvitationByToken(tokenOf(b.link))?.state).toBe("expired");
    await expect(members.acceptInvitation(tokenOf(b.link), { password: "Geheim-12345" })).rejects.toThrow();

    security.update(c.admin, { passwordPolicy: { minLength: 12, requireNumber: true } });
    const d = members.invite(c.admin, { email: "d@voorbeeld.nl" });
    await expect(members.acceptInvitation(tokenOf(d.link), { password: "kort" })).rejects.toThrow(/Minimaal/);
    await expect(members.acceptInvitation(tokenOf(d.link), { password: "lang-genoeg-wachtwoord" })).rejects.toThrow(/cijfer/);
    await expect(members.acceptInvitation(tokenOf(d.link), { password: "lang-genoeg-wachtwoord-1" })).resolves.toBeTruthy();
  });

  it("re-inviting replaces the previous link; resend gives a new token", () => {
    const a = members.invite(c.admin, { email: "x@voorbeeld.nl" });
    const b = members.resendInvitation(c.admin, a.id);
    expect(tokenOf(a.link)).not.toBe(tokenOf(b.link));
    expect(members.getInvitationByToken(tokenOf(a.link))?.state).toBe("revoked");
    expect(members.listInvitations(c.admin, { status: "pending" })).toHaveLength(1);
  });

  it("guest invitations create a guest with board access", async () => {
    const inv = members.invite(c.admin, { email: "gast@extern.nl", role: "guest", boardIds: [c.boardId], boardRole: "viewer" });
    const r = await members.acceptInvitation(tokenOf(inv.link), { name: "Gast", password: "Geheim-12345" });
    expect(r.user.role).toBe("guest");
    const guest = { id: r.user.id, accountId: r.user.accountId, role: "guest" as const };
    expect(can(guest, "board:view", { boardId: c.boardId })).toBe(true);
    expect(can(guest, "board:edit_items", { boardId: c.boardId })).toBe(false);
  });

  it("CSV import creates invitations and reports skipped rows", () => {
    const res = members.importCsv(c.admin, "naam;email;rol\nAnna;anna@voorbeeld.nl;member\nBert;bert@voorbeeld.nl;viewer\nDubbel;anna@voorbeeld.nl;member\nFout;geen-mail;member\nWing;dev1@example.com;member\nCor;cor@voorbeeld.nl;baas\n");
    expect(res.created.map((i) => i.email)).toEqual(["anna@voorbeeld.nl", "bert@voorbeeld.nl"]);
    expect(res.skipped.map((s) => s.reason)).toEqual(["duplicate in file", expect.stringMatching(/email/), expect.stringMatching(/already exists/), expect.stringMatching(/unknown role/)]);
    expect(() => members.importCsv(c.admin, "naam,voornaam\nx,y")).toThrow(/email/);
  });
});

describe("roles and users", () => {
  it("changes roles with audit trail and keeps at least one admin", () => {
    const m = members.setRole(c.admin, c.member.id, { role: "viewer" });
    expect(m.role).toBe("viewer");
    const entry = audit.list(c.admin, { event: "user.role_changed" }).rows[0];
    expect(entry).toMatchObject({ actorId: c.admin.id, targetId: c.member.id, category: "permission" });
    expect(entry.details).toMatchObject({ from: "member", to: "viewer" });
    members.setRole(c.admin, c.userIds.owner, { role: "member" });
    expect(() => members.setRole(c.admin, c.admin.id, { role: "member" })).toThrow(/at least one admin/);
  });

  it("a role change takes effect for the same user immediately", () => {
    const board = c.boardId;
    expect(can({ ...c.member, role: "member" }, "board:edit_items", { boardId: board })).toBe(true);
    members.setRole(c.admin, c.member.id, { role: "viewer" });
    const now = db.select().from(users).where(eq(users.id, c.member.id)).get()!;
    expect(can({ id: now.id, accountId: now.accountId, role: now.role }, "board:edit_items", { boardId: board })).toBe(false);
  });

  it("custom roles carry a capability matrix that can() obeys", () => {
    const role = permissions.createRole(c.admin, { name: "Auditor", baseRole: "member", capabilities: { "account:audit": true, "workspace:create": false } });
    members.setRole(c.admin, c.member.id, { role: "member", customRoleId: role.id });
    expect(can(c.member, "account:audit")).toBe(true);
    expect(audit.list(c.member).rows.length).toBeGreaterThan(0);
    expect(can(c.member, "workspace:create")).toBe(false);
    expect(can(c.member, "account:manage")).toBe(false);
    expect(() => permissions.createRole(c.admin, { name: "X", capabilities: { "nope:nope": true } })).toThrow();
    expect(() => permissions.createRole(c.member, { name: "Y" })).toThrow();
    permissions.deleteRole(c.admin, role.id);
    expect(can(c.member, "account:audit")).toBe(false);
  });

  it("deactivated users disappear from active lists; yourself cannot be deactivated", () => {
    members.setActive(c.admin, c.member.id, false);
    expect(members.list(c.admin).find((u) => u.id === c.member.id)?.isActive).toBe(false);
    expect(() => members.setActive(c.admin, c.admin.id, false)).toThrow(/yourself/);
    members.setActive(c.admin, c.member.id, true);
    expect(members.list(c.admin).find((u) => u.id === c.member.id)?.isActive).toBe(true);
    expect(audit.list(c.admin, { event: "user.deactivated" }).rows).toHaveLength(1);
  });
});

describe("audit entries exist for invitations", () => {
  it("writes invitation.created", () => {
    members.invite(c.admin, { email: "log@voorbeeld.nl" });
    const rows = db.select().from(auditLog).where(eq(auditLog.event, "invitation.created")).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].targetName).toBe("log@voorbeeld.nl");
  });
});
