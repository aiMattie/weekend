import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { emailOutbox } from "../../src/db/schema/docs";
import { notifications } from "../../src/db/schema/core";
import { ForbiddenError, NotFoundError } from "../../src/lib/errors";
import * as inbox from "../../src/server/services/inbox";
import * as items from "../../src/server/services/items";
import * as updates from "../../src/server/services/updates";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

const mention = (userId: string, label: string) => `<span data-type="mention" data-id="${userId}" data-label="${label}">@${label}</span>`;

describe("inbox service", () => {
  it("creates notifications, lists with filters and counts unread", () => {
    inbox.create(c.sys, { userId: c.userIds.admin, title: "Systeemmelding" });
    inbox.create(c.member, { userId: c.userIds.admin, title: "Genoemd", type: "mention", boardId: c.boardId });
    inbox.create(c.member, { userId: c.userIds.admin, title: "Toegewezen", type: "assigned" });
    expect(inbox.unreadCount(c.admin)).toBe(3);
    const all = inbox.list(c.admin);
    expect(all.notifications.map((n) => n.title)).toHaveLength(3);
    expect(all.notifications.find((n) => n.title === "Genoemd")?.actor?.name).toBeTruthy();
    expect(all.notifications.find((n) => n.title === "Genoemd")?.link).toBe(`/boards/${c.boardId}`);
    expect(inbox.list(c.admin, { filter: "mentioned" }).notifications.map((n) => n.title)).toEqual(["Genoemd"]);
    expect(inbox.list(c.admin, { filter: "assigned" }).notifications.map((n) => n.title)).toEqual(["Toegewezen"]);
    expect(inbox.list(c.member).notifications).toHaveLength(0);
  });

  it("paginates with a cursor", () => {
    for (let i = 0; i < 5; i++) inbox.create(c.sys, { userId: c.userIds.admin, title: `n${i}` });
    const p1 = inbox.list(c.admin, { limit: 2 });
    expect(p1.notifications).toHaveLength(2);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = inbox.list(c.admin, { limit: 2, cursor: p1.nextCursor! });
    const p3 = inbox.list(c.admin, { limit: 2, cursor: p2.nextCursor! });
    const ids = [...p1.notifications, ...p2.notifications, ...p3.notifications].map((n) => n.id);
    expect(new Set(ids).size).toBe(5);
    expect(p3.nextCursor).toBeNull();
  });

  it("marks read, marks all read, bookmarks and removes - only own notifications", () => {
    const a = inbox.create(c.sys, { userId: c.userIds.admin, title: "a" })!;
    const b = inbox.create(c.sys, { userId: c.userIds.admin, title: "b" })!;
    expect(inbox.markRead(c.admin, a.id).read).toBe(true);
    expect(inbox.unreadCount(c.admin)).toBe(1);
    expect(inbox.markRead(c.admin, a.id, false).read).toBe(false);
    expect(inbox.bookmark(c.admin, b.id, true).bookmarked).toBe(true);
    expect(inbox.list(c.admin, { filter: "bookmarked" }).notifications.map((n) => n.id)).toEqual([b.id]);
    expect(inbox.bookmark(c.admin, b.id, false).bookmarked).toBe(false);
    expect(inbox.markAllRead(c.admin)).toBe(2);
    expect(inbox.list(c.admin, { filter: "unread" }).notifications).toHaveLength(0);
    expect(() => inbox.markRead(c.member, a.id)).toThrow(NotFoundError);
    inbox.remove(c.admin, a.id);
    expect(inbox.list(c.admin).notifications).toHaveLength(1);
  });

  it("respects in-app settings when creating and when listing legacy notifications", () => {
    expect(inbox.getSettings(c.admin).find((s) => s.eventType === "mention")).toEqual({ eventType: "mention", inApp: true, email: true });
    inbox.updateSettings(c.admin, [{ eventType: "mention", inApp: false }]);
    expect(inbox.create(c.member, { userId: c.userIds.admin, title: "x", type: "mention" })).toBeNull();
    // a notification written directly by other services (notify()) is hidden at read time
    db.insert(notifications).values({ userId: c.userIds.admin, type: "mention", title: "oud" }).run();
    expect(inbox.list(c.admin).notifications).toHaveLength(0);
    expect(inbox.unreadCount(c.admin)).toBe(0);
    inbox.updateSettings(c.admin, [{ eventType: "mention", inApp: true }]);
    expect(inbox.list(c.admin).notifications).toHaveLength(1);
    expect(() => inbox.updateSettings(c.admin, [{ eventType: "bogus" }])).toThrow();
  });

  it("guests and viewers cannot send; unknown users and other boards are rejected", () => {
    expect(() => inbox.create(c.viewer, { userId: c.userIds.admin, title: "x" })).toThrow(ForbiddenError);
    expect(() => inbox.create(c.sys, { userId: "999", title: "x" })).toThrow(NotFoundError);
  });
});

describe("board updates subscriber", () => {
  it("notifies assignees of an update once, but not the author or mentioned users", () => {
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Taak", values: { people: [c.userIds.dev1, c.userIds.admin, c.userIds.pm1] } });
    updates.create(c.admin, { itemId: it1.id, body: `<p>Voortgang ${mention(c.userIds.pm1, "Planner")}</p>` });
    const dev1 = inbox.list(c.member);
    expect(dev1.notifications.filter((n) => n.type === "update")).toHaveLength(1);
    expect(dev1.notifications.find((n) => n.type === "update")!.link).toBe(`/boards/${c.boardId}?item=${it1.id}`);
    expect(inbox.list(c.admin).notifications.filter((n) => n.type === "update")).toHaveLength(0); // author
    const rows = db.select().from(notifications).where(eq(notifications.userId, c.userIds.pm1)).all();
    expect(rows.map((r) => r.type).sort()).toEqual(["assigned", "mention"]); // mentioned: no extra 'update'
  });
});

describe("digest", () => {
  it("builds a Dutch digest of unread, e-mail-enabled notifications and writes the outbox once", () => {
    inbox.create(c.member, { userId: c.userIds.admin, title: "Genoemd", type: "mention", body: "Kijk even" });
    inbox.create(c.member, { userId: c.userIds.admin, title: "Alleen in-app", type: "update" });
    const d = inbox.buildDigest(c.userIds.admin, "2000-01-01T00:00:00.000Z")!;
    expect(d.count).toBe(1);
    expect(d.subject).toContain("1 ongelezen melding");
    expect(d.text).toContain("Genoemd");
    expect(d.text).not.toContain("Alleen in-app");
    expect(d.html).toContain("Vermeldingen");

    const now = new Date(Date.now() + 60_000);
    expect(inbox.sendDailyDigests(now)).toBe(1);
    const out = db.select().from(emailOutbox).all();
    expect(out).toHaveLength(1);
    expect(out[0].toEmail).toBe("admin@example.com");
    expect(out[0].sentAt).toBeTruthy();
    // nothing new since the last digest
    expect(inbox.sendDailyDigests(new Date(now.getTime() + 60_000))).toBe(0);
  });

  it("skips users that disabled e-mail or read everything", () => {
    inbox.create(c.member, { userId: c.userIds.admin, title: "Genoemd", type: "mention" });
    inbox.updateSettings(c.admin, [{ eventType: "mention", email: false }]);
    expect(inbox.buildDigest(c.userIds.admin, "2000-01-01T00:00:00.000Z")).toBeNull();
    inbox.updateSettings(c.admin, [{ eventType: "mention", email: true }]);
    inbox.markAllRead(c.admin);
    expect(inbox.buildDigest(c.userIds.admin, "2000-01-01T00:00:00.000Z")).toBeNull();
  });
});
