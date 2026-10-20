import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/client";
import { eq } from "drizzle-orm";
import { notifications, users } from "../../src/db/schema/core";
import { ValidationError } from "../../src/lib/errors";
import * as items from "../../src/server/services/items";
import * as updates from "../../src/server/services/updates";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

const mentionHtml = (id: string, label: string) => `<p><span data-type="mention" data-id="${id}" data-label="${label}">@${label}</span> hoi</p>`;
const mentionsFor = (userId: string) => db.select().from(notifications).all().filter((n) => n.type === "mention" && n.userId === userId);

describe("notification language", () => {
  it("mention and reply notifications are written in the recipient's language", () => {
    db.update(users).set({ locale: "en" }).where(eq(users.id, c.userIds.pm1)).run();
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Taak" });
    updates.create(c.admin, { itemId: it1.id, body: `${mentionHtml(c.userIds.dev1, "Builder")}${mentionHtml(c.userIds.pm1, "Planner")}` });
    expect(mentionsFor(c.userIds.dev1)[0].title).toBe('Admin User heeft je genoemd bij "Taak"');
    expect(mentionsFor(c.userIds.pm1)[0].title).toBe('Admin User mentioned you on "Taak"');
  });
});

describe("update editing (item panel)", () => {
  it("editing an update notifies only newly mentioned users", () => {
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Taak" });
    const u = updates.create(c.admin, { itemId: it1.id, body: mentionHtml(c.userIds.dev1, "Builder") });
    expect(mentionsFor(c.userIds.dev1)).toHaveLength(1);
    updates.edit(c.admin, u.id, { body: `${mentionHtml(c.userIds.dev1, "Builder")}${mentionHtml(c.userIds.pm1, "Planner")}` });
    expect(mentionsFor(c.userIds.dev1)).toHaveLength(1);
    expect(mentionsFor(c.userIds.pm1)).toHaveLength(1);
    const listed = updates.list(c.admin, it1.id)[0];
    expect(listed.editedAt).toBeTruthy();
    expect(listed.mentions.sort()).toEqual([c.userIds.pm1, c.userIds.dev1].sort());
  });

  it("only the author or an admin may edit/delete; empty updates need withFiles", () => {
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Taak" });
    const u = updates.create(c.member, { itemId: it1.id, body: "<p>Van dev1</p>" });
    expect(() => updates.edit(c.guest, u.id, { body: "<p>x</p>" })).toThrow();
    expect(() => updates.create(c.admin, { itemId: it1.id, body: "<p></p>" })).toThrow(ValidationError);
    const withFile = updates.create(c.admin, { itemId: it1.id, body: "<p></p>", withFiles: true });
    expect(withFile.bodyText).toBe("");
    updates.edit(c.admin, u.id, { body: "<p>Admin mag</p>" });
    updates.remove(c.admin, u.id);
    expect(updates.list(c.admin, it1.id)).toHaveLength(1);
  });

  it("pinned updates come first and replies nest under their parent", () => {
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Taak" });
    const a = updates.create(c.admin, { itemId: it1.id, body: "<p>a</p>" });
    updates.create(c.admin, { itemId: it1.id, body: "<p>b</p>" });
    updates.create(c.member, { itemId: it1.id, body: "<p>antwoord</p>", parentUpdateId: a.id });
    updates.setPinned(c.admin, a.id, true);
    const l = updates.list(c.admin, it1.id);
    expect(l.map((x) => x.id)[0]).toBe(a.id);
    expect(l[0].pinned).toBe(true);
    expect(l[0].replies.map((r) => r.bodyText)).toEqual(["antwoord"]);
  });
});
