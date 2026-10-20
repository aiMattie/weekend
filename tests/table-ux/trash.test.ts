import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/client";
import { teams } from "../../src/db/schema/core";
import * as activity from "../../src/server/services/activity";
import * as boards from "../../src/server/services/boards";
import * as groups from "../../src/server/services/groups";
import * as items from "../../src/server/services/items";
import * as trash from "../../src/server/services/trash";
import * as updates from "../../src/server/services/updates";
import { freshCtx, type Ctx } from "../helpers";
import { notifications } from "../../src/db/schema/core";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

describe("archive and trash", () => {
  it("lists and restores archived/deleted items, groups and boards", () => {
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Weg" });
    items.remove(c.admin, it1.id);
    const it2 = items.create(c.admin, { boardId: c.boardId, name: "Archief" });
    items.archive(c.admin, it2.id);
    const g = groups.create(c.admin, c.boardId, { title: "Oude groep" });
    items.create(c.admin, { boardId: c.boardId, name: "In groep", groupId: g.id });
    groups.remove(c.admin, g.id);
    const b = boards.create(c.admin, { workspaceId: c.workspaceId, name: "Wegboard" });
    boards.remove(c.admin, b.id);

    const t = trash.list(c.admin, { state: "deleted" });
    expect(t.items.map((i) => i.name).sort()).toEqual(["Weg"]); // item inside the deleted group is restored with the group
    expect(t.groups.map((x) => x.title)).toEqual(["Oude groep"]);
    expect(t.boards.map((x) => x.name)).toEqual(["Wegboard"]);
    expect(trash.list(c.admin, { state: "archived" }).items.map((i) => i.name)).toEqual(["Archief"]);

    trash.restore(c.admin, { kind: "item", id: it1.id });
    trash.restore(c.admin, { kind: "item", id: it2.id });
    trash.restore(c.admin, { kind: "group", id: g.id });
    trash.restore(c.admin, { kind: "board", id: b.id });
    expect(items.list(c.admin, { boardId: c.boardId }).map((i) => i.name).sort()).toEqual(["Archief", "In groep", "Weg"]);
    expect(boards.get(c.admin, b.id).state).toBe("active");
    expect(trash.list(c.admin, { state: "deleted" })).toEqual({ boards: [], groups: [], items: [], workspaces: [] });
  });

  it("restores an item into the first group when its group is gone, and purges permanently", () => {
    const g = groups.create(c.admin, c.boardId, { title: "Tijdelijk" });
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Zwerver", groupId: g.id });
    items.remove(c.admin, it1.id);
    groups.remove(c.admin, g.id);
    trash.restore(c.admin, { kind: "item", id: it1.id });
    expect(items.get(c.admin, it1.id).groupId).toBe(groups.list(c.admin, c.boardId)[0].id);
    items.remove(c.admin, it1.id);
    expect(trash.purge(c.admin, { kind: "item", id: it1.id })).toEqual({ kind: "item", id: it1.id });
    expect(() => items.get(c.admin, it1.id)).toThrow();
    expect(() => trash.purge(c.admin, { kind: "board", id: c.boardId })).toThrow(); // active boards cannot be purged
  });

  it("only lets board owners restore boards", () => {
    const b = boards.create(c.member, { workspaceId: c.workspaceId, name: "Van dev1" });
    boards.remove(c.member, b.id);
    expect(trash.list(c.member, { state: "deleted" }).boards.map((x) => x.id)).toEqual([b.id]);
    expect(trash.list(c.viewer, { state: "deleted" }).boards).toEqual([]);
    expect(() => trash.restore(c.viewer, { kind: "board", id: b.id })).toThrow();
    trash.restore(c.member, { kind: "board", id: b.id });
  });
});

describe("updates: mentions, read marks, activity filters", () => {
  it("notifies mentioned users and the members of mentioned teams", () => {
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Taak" });
    const dev = db.select().from(teams).where(eq(teams.name, "DEV")).get()!;
    const body = `<p><span data-type="mention" data-id="${c.userIds.dev1}" data-label="Builder">@Builder</span> <span data-type="mention" data-id="${dev.id}" data-label="DEV">@DEV</span> kijk even</p>`;
    updates.create(c.admin, { itemId: it1.id, body });
    const who = db.select().from(notifications).all().filter((n) => n.type === "mention").map((n) => n.userId);
    expect(who).toContain(c.userIds.dev1);
    expect(new Set(who).size).toBe(who.length);
    expect(who).not.toContain(c.userIds.admin); // never notify yourself
  });

  it("tracks unread updates and who has seen them", () => {
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Taak" });
    const u = updates.create(c.admin, { itemId: it1.id, body: "<p>Hoi</p>" });
    updates.create(c.member, { itemId: it1.id, body: "<p>Eigen</p>" });
    expect(updates.unreadCounts(c.member, c.boardId)).toEqual({ [it1.id]: 1 });
    expect(updates.unreadCounts(c.admin, c.boardId)).toEqual({ [it1.id]: 1 });
    expect(updates.markSeen(c.member, it1.id)).toBe(2); // own update counts as read too, but only new marks are counted
    expect(updates.markSeen(c.member, it1.id)).toBe(0);
    expect(updates.unreadCounts(c.member, c.boardId)).toEqual({});
    const listed = updates.list(c.admin, it1.id).find((x) => x.id === u.id)!;
    expect(listed.seenBy.map((s) => s.id)).toEqual([c.userIds.dev1]);
  });

  it("filters the item activity log by column and person", () => {
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Taak" });
    items.changeMultipleColumnValues(c.admin, it1.id, { status: "Done" });
    items.changeMultipleColumnValues(c.member, it1.id, { date: "2026-11-02" });
    const all = activity.listForItem(c.admin, it1.id);
    const status = all.find((r) => r.event === "change_column_value" && (r.data as { columnType?: string }).columnType === "status")!;
    expect(activity.listForItem(c.admin, it1.id, { columnId: status.columnId! })).toHaveLength(1);
    expect(activity.listForItem(c.admin, it1.id, { userId: c.userIds.dev1 }).every((r) => r.userId === c.userIds.dev1)).toBe(true);
    expect(activity.listForItem(c.admin, it1.id, { userId: c.userIds.dev1 }).length).toBeGreaterThan(0);
  });
});
