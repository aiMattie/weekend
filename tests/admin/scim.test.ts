import { beforeEach, describe, expect, it } from "vitest";
import * as audit from "../../src/server/services/audit";
import * as scim from "../../src/server/services/scim";
import * as security from "../../src/server/services/security";
import { authenticate } from "../../src/server/services/login-flow";
import * as sessions from "../../src/server/services/sessions";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

const USER = "urn:ietf:params:scim:schemas:core:2.0:User";

describe("SCIM token", () => {
  it("is created once, stored hashed and authenticates only itself", () => {
    expect(security.authenticateScim("scim_nope")).toBeNull();
    const { token, prefix } = security.createScimToken(c.admin);
    expect(token).toMatch(/^scim_/);
    expect(security.get(c.admin).scimPrefix).toBe(prefix);
    expect(JSON.stringify(security.get(c.admin))).not.toContain(token);
    expect(security.authenticateScim(token)).toBe(c.accountId);
    expect(security.authenticateScim(`${token}x`)).toBeNull();
    expect(security.authenticateScim("Bearer " + token)).toBeNull();
    const rotated = security.createScimToken(c.admin);
    expect(security.authenticateScim(token)).toBeNull();
    expect(security.authenticateScim(rotated.token)).toBe(c.accountId);
    security.revokeScimToken(c.admin);
    expect(security.authenticateScim(rotated.token)).toBeNull();
    expect(() => security.createScimToken(c.member)).toThrow(/Not allowed/);
    expect(audit.list(c.admin, { event: "token.created" }).rows[0].details).toMatchObject({ kind: "scim" });
    expect(JSON.stringify(audit.list(c.admin).rows)).not.toContain(rotated.token);
  });
});

describe("SCIM /Users payloads", () => {
  it("lists users as a ListResponse (AI agents excluded) and filters by userName", () => {
    const list = scim.list(c.accountId, {}, "http://x");
    expect(list.schemas).toEqual(["urn:ietf:params:scim:api:messages:2.0:ListResponse"]);
    expect(list.totalResults).toBe(10);
    expect(list.itemsPerPage).toBe(10);
    expect(list.startIndex).toBe(1);
    const admin = list.Resources.find((u) => u.userName === "admin@example.com")!;
    expect(admin).toMatchObject({
      schemas: [USER], displayName: "Admin User", active: true, title: "Projectmanager",
      name: { formatted: "Admin User", givenName: "Admin", familyName: "User" },
      emails: [{ value: "admin@example.com", primary: true, type: "work" }],
      meta: { resourceType: "User", location: `http://x/api/scim/v2/Users/${admin.id}` },
    });
    expect(scim.list(c.accountId, { filter: 'userName eq "dev1@example.com"' }).Resources).toHaveLength(1);
    expect(scim.list(c.accountId, { filter: 'userName eq "niemand@x.nl"' })).toMatchObject({ totalResults: 0, Resources: [] });
    expect(scim.list(c.accountId, { startIndex: "3", count: "2" })).toMatchObject({ startIndex: 3, itemsPerPage: 2, totalResults: 10 });
    expect(() => scim.list(c.accountId, { filter: "emails co gmail" })).toThrow(/filters/);
  });

  it("creates users (201 payload), rejects duplicates and bad input", () => {
    const u = scim.create(c.accountId, { schemas: [USER], userName: "Nieuw@Voorbeeld.nl", name: { givenName: "Nora", familyName: "Test" }, active: true }, "http://x");
    expect(u).toMatchObject({ schemas: [USER], userName: "nieuw@voorbeeld.nl", displayName: "Nora Test", active: true });
    expect(typeof u.id).toBe("string");
    expect(() => scim.create(c.accountId, { userName: "nieuw@voorbeeld.nl" })).toThrow(expect.objectContaining({ status: 409, scimType: "uniqueness" }));
    expect(() => scim.create(c.accountId, { userName: "geen-mail" })).toThrow(expect.objectContaining({ status: 400 }));
    expect(scim.get(c.accountId, u.id as string)).toMatchObject({ userName: "nieuw@voorbeeld.nl" });
    expect(() => scim.get(c.accountId, "999")).toThrow(expect.objectContaining({ status: 404 }));
    expect(scim.errorBody(404, "x")).toEqual({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: "404", detail: "x" });
  });

  it("patches (with and without path, Okta and Entra styles) and deactivates", async () => {
    const id = c.member.id;
    expect(scim.patch(c.accountId, id, { schemas: [scim.SCIM_PATCH], Operations: [{ op: "replace", path: "title", value: "Lead" }] })).toMatchObject({ title: "Lead" });
    expect(scim.patch(c.accountId, id, { Operations: [{ op: "Replace", value: { displayName: "Builder Nieuw", active: true } }] })).toMatchObject({ displayName: "Builder Nieuw" });
    expect(scim.patch(c.accountId, id, { Operations: [{ op: "replace", path: "name.givenName", value: "Wong" }] })).toMatchObject({ displayName: "Wong" });
    const login = await authenticate({ email: "dev1@example.com", password: "pw-for-tests" });
    if (login.status !== "ok") throw new Error("login");
    expect(scim.patch(c.accountId, id, { Operations: [{ op: "replace", path: "active", value: false }] })).toMatchObject({ active: false });
    expect(sessions.isSessionAlive(id, login.sid, c.accountId)).toBe(false); // deactivation ends sessions
    expect(() => scim.patch(c.accountId, id, { Operations: [] })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => scim.patch(c.accountId, id, { Operations: [{ op: "move" }] })).toThrow(/Unsupported/);
    expect(scim.replace(c.accountId, id, { active: true, title: "Terug" })).toMatchObject({ active: true, title: "Terug" });
    scim.deactivate(c.accountId, c.viewer.id);
    expect(scim.get(c.accountId, c.viewer.id).active).toBe(false);
    const events = audit.list(c.admin, { event: "scim.*" }).rows.map((r) => r.event);
    expect(events).toEqual(expect.arrayContaining(["scim.user_deactivated", "scim.user_updated"]));
    expect(audit.list(c.admin, { event: "scim.user_deactivated" }).rows[0].source).toBe("scim");
  });
});
