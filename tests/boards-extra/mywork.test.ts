import { beforeEach, describe, expect, it } from "vitest";
import { addDays, bucketFor, extractDueDate, groupIntoSections, todayString, weekStart } from "../../src/modules/boards-extra/mywork/buckets";
import { db } from "../../src/db/client";
import { teams, teamMembers } from "../../src/db/schema/core";
import * as boardsSvc from "../../src/server/services/boards";
import * as items from "../../src/server/services/items";
import * as myWork from "../../src/server/services/my-work";
import { freshCtx, type Ctx } from "../helpers";

// Wednesday 2026-10-07, 14:00 Amsterdam
const NOW = new Date("2026-10-07T12:00:00Z");

describe("bucketFor", () => {
  it("handles the boundaries of the week (Monday based)", () => {
    expect(weekStart("2026-10-07")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // Sunday belongs to the week of Monday 5th
    expect(bucketFor("2026-10-06", NOW)).toBe("overdue");
    expect(bucketFor("2026-10-07", NOW)).toBe("today");
    expect(bucketFor("2026-10-08", NOW)).toBe("this_week");
    expect(bucketFor("2026-10-11", NOW)).toBe("this_week");
    expect(bucketFor("2026-10-12", NOW)).toBe("next_week");
    expect(bucketFor("2026-10-18", NOW)).toBe("next_week");
    expect(bucketFor("2026-10-19", NOW)).toBe("later");
    expect(bucketFor(null, NOW)).toBe("no_date");
    expect(bucketFor("garbage", NOW)).toBe("no_date");
  });

  it("is time zone safe (late evening UTC is already tomorrow in Amsterdam)", () => {
    const lateUtc = new Date("2026-10-07T22:30:00Z"); // 2026-10-08 00:30 Amsterdam (CEST)
    expect(todayString(lateUtc, "Europe/Amsterdam")).toBe("2026-10-08");
    expect(todayString(lateUtc, "UTC")).toBe("2026-10-07");
    expect(bucketFor("2026-10-08", lateUtc, "Europe/Amsterdam")).toBe("today");
    expect(bucketFor("2026-10-08", lateUtc, "UTC")).toBe("this_week");
  });

  it("addDays crosses month and year borders", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("extractDueDate", () => {
  it("reads date, timeline, week and plain values", () => {
    expect(extractDueDate({ date: "2026-10-07", time: "10:00:00" })).toBe("2026-10-07");
    expect(extractDueDate({ from: "2026-10-01", to: "2026-10-09" })).toBe("2026-10-09");
    expect(extractDueDate({ from: "2026-10-01" })).toBe("2026-10-01");
    expect(extractDueDate({ week: { startDate: "2026-10-05", endDate: "2026-10-11" } })).toBe("2026-10-11");
    expect(extractDueDate("2026-10-03T10:00")).toBe("2026-10-03");
    expect(extractDueDate(null)).toBeNull();
    expect(extractDueDate({})).toBeNull();
    expect(extractDueDate(42)).toBeNull();
  });
});

describe("groupIntoSections", () => {
  it("returns all six sections in order and sorts rows by due date", () => {
    const rows = [
      { name: "b", dueDate: "2026-10-30" }, { name: "a", dueDate: "2026-10-01" }, { name: "n", dueDate: null }, { name: "t", dueDate: "2026-10-07" },
      { name: "t2", dueDate: "2026-10-09" }, { name: "x", dueDate: "2026-10-14" },
    ];
    const s = groupIntoSections(rows, NOW);
    expect(s.map((x) => x.bucket)).toEqual(["overdue", "today", "this_week", "next_week", "later", "no_date"]);
    expect(s.map((x) => x.rows.map((r) => r.name))).toEqual([["a"], ["t"], ["t2"], ["x"], ["b"], ["n"]]);
  });
});

describe("myWork.list", () => {
  let c: Ctx;
  beforeEach(async () => { c = await freshCtx(); });

  const mk = (name: string, values: Record<string, unknown>) => items.create(c.admin, { boardId: c.boardId, name, values });

  it("returns my items from all boards, buckets them, hides done by default, and ignores others", () => {
    const board2 = boardsSvc.create(c.sys, { workspaceId: c.workspaceId, name: "Tweede board" });
    const admin = c.userIds.admin;
    const past = mk("Te laat", { people: [admin], date: "2026-10-01" });
    mk("Vandaag", { people: [admin], date: "2026-10-07" });
    mk("Zonder datum", { people: [admin] });
    mk("Gedaan", { people: [admin], date: "2026-10-01", status: "Done" });
    mk("Van Builder", { people: [c.userIds.dev1], date: "2026-10-01" });
    mk("Niemand", { date: "2026-10-01" });
    items.create(c.admin, { boardId: board2.id, name: "Ander board later", values: { people: [admin], date: "2026-12-24" } });

    const r = myWork.list(c.admin, {}, NOW);
    const by = Object.fromEntries(r.sections.map((s) => [s.bucket, s.rows.map((x) => x.name)]));
    expect(by.overdue).toEqual(["Te laat"]);
    expect(by.today).toEqual(["Vandaag"]);
    expect(by.later).toEqual(["Ander board later"]);
    expect(by.no_date).toEqual(["Zonder datum"]);
    expect(r.total).toBe(4);
    expect(r.sections.flatMap((s) => s.rows).find((x) => x.itemId === past.id)?.status?.labels.length).toBeGreaterThan(0);

    const withDone = myWork.list(c.admin, { showDone: true }, NOW);
    expect(withDone.total).toBe(5);
    const done = withDone.sections.flatMap((s) => s.rows).find((x) => x.name === "Gedaan")!;
    expect(done.status?.isDone).toBe(true);

    expect(myWork.list(c.admin, { boardIds: [board2.id] }, NOW).total).toBe(1);
    expect(myWork.list(c.admin, { search: "vandaag" }, NOW).total).toBe(1);
    expect(myWork.list(c.member, {}, NOW).sections.flatMap((s) => s.rows).map((x) => x.name)).toEqual(["Van Builder"]);
  });

  it("includes items assigned to one of my teams and archived/deleted ones are excluded", () => {
    const admin = c.userIds.admin;
    const team = db.insert(teams).values({ accountId: c.accountId, name: "Testteam" }).returning().get();
    db.insert(teamMembers).values({ teamId: team.id, userId: admin }).run();
    mk("Team item", { people: [{ id: team.id, kind: "team" }], date: "2026-10-09" });
    const gone = mk("Weg", { people: [admin] });
    items.remove(c.admin, gone.id);
    expect(myWork.list(c.admin, {}, NOW).sections.flatMap((s) => s.rows).map((x) => x.name)).toEqual(["Team item"]);
    expect(myWork.list(c.admin, { includeTeams: false }, NOW).total).toBe(0);
  });

  it("uses the earliest date-ish column and labels subitems with their parent", () => {
    const admin = c.userIds.admin;
    const parent = mk("Ouder", {});
    const sub = items.create(c.admin, { boardId: c.boardId, parentItemId: parent.id, name: "Kind", values: { people: [admin], date: "2026-10-07" } });
    const r = myWork.list(c.admin, {}, NOW);
    const row = r.sections.flatMap((s) => s.rows).find((x) => x.itemId === sub.id)!;
    expect(row.parentName).toBe("Ouder");
    expect(row.bucket).toBe("today");
  });
});
