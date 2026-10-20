import { beforeEach, describe, expect, it } from "vitest";
import { subscribe, type AppEvent } from "../../src/lib/events";
import { ForbiddenError, ValidationError } from "../../src/lib/errors";
import * as columns from "../../src/server/services/columns";
import * as groups from "../../src/server/services/groups";
import * as items from "../../src/server/services/items";
import * as updates from "../../src/server/services/updates";
import * as activity from "../../src/server/services/activity";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

describe("items service", () => {
  it("creates items in the first group with ordered positions and numeric string ids", () => {
    const a = items.create(c.admin, { boardId: c.boardId, name: "A" });
    const b = items.create(c.admin, { boardId: c.boardId, name: "B" });
    expect(a.id).toMatch(/^\d{10}$/);
    expect(b.position).toBeGreaterThan(a.position);
    expect(items.list(c.admin, { boardId: c.boardId }).map((i) => i.name)).toEqual(["A", "B"]);
  });

  it("inserts before/after/top and reorders via move", () => {
    const a = items.create(c.admin, { boardId: c.boardId, name: "A" });
    const b = items.create(c.admin, { boardId: c.boardId, name: "B" });
    items.create(c.admin, { boardId: c.boardId, name: "Top", top: true });
    items.create(c.admin, { boardId: c.boardId, name: "Mid", afterId: a.id });
    items.move(c.admin, b.id, { beforeId: a.id });
    expect(items.list(c.admin, { boardId: c.boardId }).map((i) => i.name)).toEqual(["Top", "B", "A", "Mid"]);
  });

  it("validates column values by id or key, stores API shapes and logs activity + events", () => {
    const events: AppEvent[] = [];
    const off = subscribe((e) => events.push(e));
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Task" });
    items.changeColumnValue(c.admin, it1.id, "status", "Done");
    items.changeMultipleColumnValues(c.admin, it1.id, { people: [c.userIds.dev1], date: "2026-11-02" });
    off();
    const row = items.get(c.admin, it1.id);
    const cols = columns.list(c.admin, c.boardId);
    const status = cols.find((x) => x.key === "status")!;
    expect(row.values[status.id]).toEqual({ index: 1 });
    expect(row.values[cols.find((x) => x.key === "people")!.id]).toEqual({ personsAndTeams: [{ id: c.userIds.dev1, kind: "person" }] });
    expect(row.values[cols.find((x) => x.key === "date")!.id]).toEqual({ date: "2026-11-02" });
    expect(events.filter((e) => e.type === "column_value.changed")).toHaveLength(3);
    const log = activity.activityForItem(c.admin, it1.id);
    expect(log.some((l) => l.event === "change_column_value" && (l.data as { to?: string }).to === "Done")).toBe(true);
  });

  it("rejects invalid values atomically", () => {
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Task" });
    expect(() => items.changeMultipleColumnValues(c.admin, it1.id, { status: "Done", date: "not-a-date" })).toThrow(ValidationError);
    expect(items.get(c.admin, it1.id).values).toEqual({});
    expect(() => items.changeColumnValue(c.admin, it1.id, "status", "Nope")).toThrow(ValidationError);
  });

  it("clears a value with null and renames through the name column", () => {
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Task", values: { status: "Stuck" } });
    items.changeColumnValue(c.admin, it1.id, "status", null);
    expect(items.get(c.admin, it1.id).values).toEqual({});
    items.changeColumnValue(c.admin, it1.id, "name", "Renamed");
    expect(items.get(c.admin, it1.id).name).toBe("Renamed");
  });

  it("supports subitems with their own columns, counts, duplicate and soft delete/restore", () => {
    const parent = items.create(c.admin, { boardId: c.boardId, name: "Parent" });
    const sub = items.create(c.admin, { boardId: c.boardId, parentItemId: parent.id, name: "Sub", values: { status: "Done" } });
    expect(sub.groupId).toBe(parent.groupId);
    expect(columns.list(c.admin, c.boardId, "subitem").map((x) => x.key)).toContain("status");
    expect(items.get(c.admin, parent.id).subitemCount).toBe(1);
    expect(() => items.create(c.admin, { boardId: c.boardId, parentItemId: sub.id, name: "Deep" })).toThrow(ValidationError);
    const copy = items.duplicate(c.admin, parent.id);
    expect(items.listSubitems(c.admin, copy.id)).toHaveLength(1);
    items.remove(c.admin, parent.id);
    expect(items.list(c.admin, { boardId: c.boardId }).map((i) => i.name)).toEqual(["Parent (copy)"]);
    items.restore(c.admin, parent.id);
    expect(items.list(c.admin, { boardId: c.boardId })).toHaveLength(2);
  });

  it("moves between groups and deleting a group trashes its items", () => {
    const g2 = groups.create(c.admin, c.boardId, { title: "Second" });
    const a = items.create(c.admin, { boardId: c.boardId, name: "A" });
    items.move(c.admin, a.id, { groupId: g2.id });
    expect(items.get(c.admin, a.id).groupId).toBe(g2.id);
    groups.remove(c.admin, g2.id);
    expect(() => items.get(c.admin, a.id)).toThrow();
  });

  it("deleting a column strips the values", () => {
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Task", values: { status: "Done", date: "2026-01-01" } });
    const date = columns.list(c.admin, c.boardId).find((x) => x.key === "date")!;
    columns.remove(c.admin, date.id);
    expect(Object.keys(items.get(c.admin, it1.id).values)).toHaveLength(1);
  });

  it("updates: sanitises html, notifies mentions, nests replies, likes", () => {
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Task" });
    const u = updates.create(c.admin, { itemId: it1.id, body: `<p>Hi <span data-type="mention" data-id="${c.userIds.dev1}">@Builder</span><script>alert(1)</script></p>` });
    expect(u.body).not.toContain("script");
    updates.create(c.member, { itemId: it1.id, body: "<p>Reply</p>", parentUpdateId: u.id });
    expect(updates.toggleLike(c.member, u.id)).toBe(true);
    const list = updates.list(c.admin, it1.id);
    expect(list).toHaveLength(1);
    expect(list[0].replies).toHaveLength(1);
    expect(list[0].likes).toEqual([c.member.id]);
    expect(updates.countsByItem([it1.id])[it1.id]).toBe(2);
  });
});

describe("permissions in services", () => {
  it("viewers cannot write, guests only see boards they were added to", async () => {
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Task" });
    expect(() => items.create(c.viewer, { boardId: c.boardId, name: "X" })).toThrow(ForbiddenError);
    expect(() => items.changeColumnValue(c.viewer, it1.id, "status", "Done")).toThrow(ForbiddenError);
    expect(items.list(c.viewer, { boardId: c.boardId })).toHaveLength(1);
    expect(() => items.list(c.guest, { boardId: c.boardId })).toThrow(ForbiddenError);
    const boards = await import("../../src/server/services/boards");
    boards.setMember(c.admin, c.boardId, c.guest.id, "editor");
    expect(items.list(c.guest, { boardId: c.boardId })).toHaveLength(1);
    expect(() => columns.create(c.guest, c.boardId, { title: "X", type: "text" })).toThrow(ForbiddenError);
  });
});
