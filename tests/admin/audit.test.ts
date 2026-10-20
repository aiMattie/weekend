import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/client";
import { auditLog } from "../../src/db/schema/audit-log";
import { systemActor } from "../../src/lib/actor";
import * as audit from "../../src/server/services/audit";
import * as boards from "../../src/server/services/boards";
import * as workspaces from "../../src/server/services/workspaces";
import * as security from "../../src/server/services/security";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

describe("recordAudit", () => {
  it("writes an entry with actor, target, details, ip and category", () => {
    const id = audit.recordAudit(c.admin, "token.created", { targetType: "token", targetId: "t1", targetName: "CI", ip: "10.0.0.1", scopes: ["read"] });
    expect(id).toBeTruthy();
    const row = audit.list(c.admin).rows.find((r) => r.id === id)!;
    expect(row).toMatchObject({ event: "token.created", category: "security", actorId: c.admin.id, actorName: c.admin.name, targetName: "CI", ip: "10.0.0.1" });
    expect(row.details).toEqual({ scopes: ["read"] });
  });

  it("never stores secrets", () => {
    audit.recordAudit(c.admin, "token.created", { password: "geheim", token: "abc", nested: { apiKey: "x", recoveryCode: "y", tokenPrefix: "mk_12" }, safe: 1 });
    const row = db.select().from(auditLog).get()!;
    expect(JSON.stringify(row)).not.toMatch(/geheim|"abc"|"x"|"y"/);
    expect(row.details).toMatchObject({ password: "[redacted]", token: "[redacted]", nested: { apiKey: "[redacted]", recoveryCode: "[redacted]", tokenPrefix: "mk_12" }, safe: 1 });
  });

  it("works for system actors and anonymous events and never throws", () => {
    expect(audit.recordAudit(systemActor(c.accountId, "mcp"), "mcp.call", { tool: "create_item" })).toBeTruthy();
    expect(audit.recordAudit({ accountId: c.accountId }, "user.login_failed", { attempted: "x@y.nl" })).toBeTruthy();
    expect(audit.recordAudit(null, "x")).toBeNull();
    const rows = audit.list(c.admin).rows;
    expect(rows.find((r) => r.event === "mcp.call")).toMatchObject({ actorId: null, actorName: "System", source: "mcp", category: "api" });
  });

  it("records board deletes from the event bus", () => {
    const b = boards.create(c.admin, { workspaceId: c.workspaceId, name: "Weg ermee" });
    boards.remove(c.admin, b.id);
    const row = audit.list(c.admin, { event: "board.deleted" }).rows[0];
    expect(row).toMatchObject({ targetId: b.id, targetName: "Weg ermee", actorId: c.admin.id, category: "content" });
  });

  it("records workspace deletes", () => {
    const ws = workspaces.create(c.admin, { name: "Tijdelijk" });
    workspaces.remove(c.admin, ws.id);
    expect(audit.list(c.admin, { event: "workspace.deleted" }).rows[0]).toMatchObject({ targetId: ws.id, targetName: "Tijdelijk" });
  });
});

describe("reading the audit log", () => {
  it("needs account:audit", () => {
    expect(() => audit.list(c.member)).toThrow(/Not allowed/);
    expect(() => audit.exportCsv(c.member)).toThrow(/Not allowed/);
  });

  it("filters by text, category, event prefix and date; paginates with a cursor", () => {
    for (let i = 0; i < 5; i++) audit.recordAudit(c.admin, "user.login", { n: i });
    audit.recordAudit(c.admin, "board.deleted", { targetName: "Klanten" });
    audit.recordAudit(c.admin, "role.created", { targetName: "Auditor" });
    expect(audit.list(c.admin, { q: "klanten" }).rows).toHaveLength(1);
    expect(audit.list(c.admin, { category: "content" }).rows.every((r) => r.category === "content")).toBe(true);
    expect(audit.list(c.admin, { event: "user.*" }).total).toBe(5);
    expect(audit.list(c.admin, { event: "user.login" }).total).toBe(5);
    expect(audit.list(c.admin, { from: "2999-01-01" }).rows).toHaveLength(0);
    expect(audit.list(c.admin, { to: new Date().toISOString().slice(0, 10) }).rows.length).toBeGreaterThan(0);
    const p1 = audit.list(c.admin, { event: "user.login", limit: 2 });
    expect(p1.rows).toHaveLength(2);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = audit.list(c.admin, { event: "user.login", limit: 2, cursor: p1.nextCursor! });
    const p3 = audit.list(c.admin, { event: "user.login", limit: 2, cursor: p2.nextCursor! });
    const ids = [...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.id);
    expect(new Set(ids).size).toBe(5);
    expect(p3.nextCursor).toBeNull();
    expect(audit.list(c.admin, { q: "%" }).rows).toHaveLength(0); // wildcard characters are escaped
  });

  it("exports CSV (and records the export)", () => {
    audit.recordAudit(c.admin, "board.deleted", { targetName: "=cmd|' /C calc'!A0" });
    const csv = audit.exportCsv(c.admin, { event: "board.deleted" });
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("time,event,category,actor,actor_email,target_type,target_id,target_name,ip,source,details");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("'=cmd"); // formula injection guard
    expect(audit.list(c.admin, { event: "audit.exported" }).rows).toHaveLength(1);
  });

  it("applies the retention setting", () => {
    audit.recordAudit(c.admin, "user.login");
    db.update(auditLog).set({ createdAt: new Date(Date.now() - 400 * 86400_000).toISOString() }).run();
    audit.recordAudit(c.admin, "user.logout");
    security.update(c.admin, { retentionDays: 30 });
    expect(audit.purgeExpired(c.accountId)).toBe(1);
    const events = audit.list(c.admin).rows.map((r) => r.event);
    expect(events).not.toContain("user.login");
    expect(events).toContain("user.logout");
  });
});

describe("security changes are audited", () => {
  it("records settings changes", () => {
    security.update(c.admin, { twoFactorRequired: true });
    expect(audit.list(c.admin, { event: "security.settings_changed" }).rows).toHaveLength(1);
  });
});
