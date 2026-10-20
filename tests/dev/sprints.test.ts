import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { items } from "../../src/db/schema/core";
import { createDevWorkspaceTemplate, ensureDropdownLabel } from "../../src/server/services/dev-template";
import * as itemsSvc from "../../src/server/services/items";
import * as sprintsSvc from "../../src/server/services/sprints";
import { readTask, devColumns, loadEpicInfo } from "../../src/server/services/dev-config";
import { freshCtx, type Ctx } from "../helpers";
import { devSetup } from "./helpers";

let ctx: Ctx;
beforeEach(async () => { ctx = await freshCtx(); });

const sprintOf = (id: string) => {
  const it = db.select().from(items).where(eq(items.id, id)).get()!;
  return readTask(it, devColumns(it.boardId));
};

describe("dev template", () => {
  it("creates the five boards with the template statuses and fields, and is idempotent", () => {
    const a = createDevWorkspaceTemplate(ctx.accountId);
    const b = createDevWorkspaceTemplate(ctx.accountId);
    expect(b).toEqual(a);
    const cols = devColumns(a.boards.taken);
    expect(cols.status!.settings.labels).toHaveLength(7);
    expect((cols.status!.settings.labels as { text: string }[]).map((l) => l.text)).toEqual(["Backlog", "Ready", "In progress", "Review", "Wacht op klant", "Done", "Blocked"]);
    for (const k of ["type", "prioriteit", "estimate", "klant", "epic", "sprint", "assignee", "jira"] as const) expect(cols[k], k).toBeTruthy();
    expect(cols.epic!.type).toBe("board_relation");
    expect((cols.epic!.settings.boardIds as string[])[0]).toBe(a.boards.epics);
  });
  it("can build a demo workspace", () => {
    const r = createDevWorkspaceTemplate(ctx.accountId, { workspaceName: "Dev demo", demo: true });
    const list = sprintsSvc.listSprints(ctx.sys, r.boards.sprints);
    expect(list.map((s) => s.state)).toEqual(["completed", "active", "planned"]);
    const d = sprintsSvc.dashboard(ctx.sys, r.boards.sprints);
    expect(d.sprint?.state).toBe("active");
    expect(d.burndown.length).toBe(12);
    expect(d.velocity.sprints).toHaveLength(1);
    // the roadmap shows open epics by default; none of the demo epics may be closed by the epic lifecycle
    const epicStatuses = [...loadEpicInfo({ boardIds: [r.boards.epics] }).values()].map((e) => e.status);
    expect(epicStatuses).toHaveLength(3);
    expect(epicStatuses.filter((s) => s === "Afgerond" || s === "Geparkeerd")).toEqual([]);
  });
});

describe("sprint lifecycle", () => {
  it("creates sprints with a Monday start and two weeks and an item on the sprints board", () => {
    const { sprint, t } = devSetup(ctx);
    const s = sprint("Sprint 1");
    expect(s.state).toBe("planned");
    expect(new Date(`${s.startsOn}T12:00:00Z`).getUTCDay()).toBe(1);
    expect(s.itemId).toBeTruthy();
    expect(db.select().from(items).where(eq(items.boardId, t.boards.sprints)).all()).toHaveLength(1);
  });

  it("assigning writes the sprint column and the history row; clearing moves back to the backlog", () => {
    const { sprint, mkTask, rows } = devSetup(ctx);
    const s = sprint("Sprint 1");
    const a = mkTask("A");
    sprintsSvc.assignItem(ctx.sys, a, s.id);
    expect(sprintOf(a).sprintId).toBe(s.id);
    expect(rows(s.id)).toHaveLength(1);
    sprintsSvc.assignItem(ctx.sys, a, null);
    expect(sprintOf(a).sprintId).toBeNull();
    expect(rows(s.id)[0].outcome).toBe("removed");
  });

  it("only one sprint can be active; only planned sprints start", () => {
    const { sprint } = devSetup(ctx);
    const s1 = sprint("S1");
    const s2 = sprint("S2");
    sprintsSvc.startSprint(ctx.sys, s1.id);
    expect(() => sprintsSvc.startSprint(ctx.sys, s2.id)).toThrow(/actieve sprint/);
    expect(() => sprintsSvc.startSprint(ctx.sys, s1.id)).toThrow();
    expect(() => sprintsSvc.completeSprint(ctx.sys, s2.id)).toThrow();
  });

  it("complete sprint carries unfinished work to the chosen next sprint and keeps done work", () => {
    const { sprint, mkTask, rows } = devSetup(ctx);
    const s1 = sprint("S1");
    const s2 = sprint("S2");
    const done = mkTask("Done one", 5);
    const wip = mkTask("Still working", 8);
    const ready = mkTask("Not started", 2);
    for (const id of [done, wip, ready]) sprintsSvc.assignItem(ctx.sys, id, s1.id);
    sprintsSvc.startSprint(ctx.sys, s1.id);
    itemsSvc.changeColumnValue(ctx.sys, done, "status", "Done");
    itemsSvc.changeColumnValue(ctx.sys, wip, "status", "In progress");
    const r = sprintsSvc.completeSprint(ctx.sys, s1.id, { carryOver: "next", nextSprintId: s2.id });
    expect(r.sprint.state).toBe("completed");
    expect(r.carried.map((c) => c.id).sort()).toEqual([wip, ready].sort());
    expect(r.done.map((c) => c.id)).toEqual([done]);
    expect(r.result).toMatchObject({ doneCount: 1, donePoints: 5, carriedCount: 2, carriedPoints: 10, carriedTo: "next", nextSprintId: s2.id, committedCount: 3, committedPoints: 15 });
    expect(sprintOf(done).sprintId).toBe(s1.id);
    expect(sprintOf(wip).sprintId).toBe(s2.id);
    expect(sprintOf(ready).sprintId).toBe(s2.id);
    expect(rows(s2.id).filter((x) => !x.removedAt)).toHaveLength(2);
    expect(rows(s2.id).every((x) => !x.addedAfterStart)).toBe(true);
    expect(rows(s1.id).filter((x) => x.outcome === "carried")).toHaveLength(2);
    // work in progress keeps its status
    expect(sprintOf(wip).status).toBe("In progress");
    // the completed sprint is frozen
    expect(() => sprintsSvc.assignItem(ctx.sys, ready, s1.id)).toThrow(/afgeronde/);
  });

  it("complete sprint can send unfinished work back to the backlog", () => {
    const { sprint, mkTask } = devSetup(ctx);
    const s1 = sprint("S1");
    const a = mkTask("A");
    const b = mkTask("B");
    sprintsSvc.assignItem(ctx.sys, a, s1.id);
    sprintsSvc.assignItem(ctx.sys, b, s1.id);
    sprintsSvc.startSprint(ctx.sys, s1.id);
    itemsSvc.changeColumnValue(ctx.sys, a, "status", "Done");
    const r = sprintsSvc.completeSprint(ctx.sys, s1.id, { carryOver: "backlog" });
    expect(r.nextSprint).toBeNull();
    expect(sprintOf(b).sprintId).toBeNull();
    expect(sprintOf(a).sprintId).toBe(s1.id);
    expect(r.result.carriedTo).toBe("backlog");
  });

  it("creates the next sprint automatically when none is planned (Jira style one button)", () => {
    const { sprint, mkTask, t } = devSetup(ctx);
    const s1 = sprint("Sprint 7");
    const a = mkTask("A");
    sprintsSvc.assignItem(ctx.sys, a, s1.id);
    sprintsSvc.startSprint(ctx.sys, s1.id);
    const r = sprintsSvc.completeSprint(ctx.sys, s1.id);
    expect(r.nextSprint?.name).toBe("Sprint 8");
    expect(r.nextSprint?.state).toBe("planned");
    expect(r.nextSprint!.startsOn! > s1.endsOn!).toBe(true);
    expect(sprintOf(a).sprintId).toBe(r.nextSprint!.id);
    expect(sprintsSvc.listSprints(ctx.sys, t.boards.sprints)).toHaveLength(2);
  });

  it("with everything done nothing is carried and no sprint is created", () => {
    const { sprint, mkTask, t } = devSetup(ctx);
    const s1 = sprint("S1");
    const a = mkTask("A");
    sprintsSvc.assignItem(ctx.sys, a, s1.id);
    sprintsSvc.startSprint(ctx.sys, s1.id);
    itemsSvc.changeColumnValue(ctx.sys, a, "status", "Done");
    const r = sprintsSvc.completeSprint(ctx.sys, s1.id);
    expect(r.carried).toHaveLength(0);
    expect(r.nextSprint).toBeNull();
    expect(sprintsSvc.listSprints(ctx.sys, t.boards.sprints)).toHaveLength(1);
  });

  it("tasks added after the start count as scope change", () => {
    const { sprint, mkTask, rows } = devSetup(ctx);
    const s1 = sprint("S1");
    const a = mkTask("A", 5);
    sprintsSvc.assignItem(ctx.sys, a, s1.id);
    sprintsSvc.startSprint(ctx.sys, s1.id);
    const late = mkTask("Late", 3);
    sprintsSvc.assignItem(ctx.sys, late, s1.id);
    expect(rows(s1.id).find((r) => r.itemId === late)!.addedAfterStart).toBe(true);
    const rep = sprintsSvc.summary(ctx.sys, s1.id);
    expect(rep.scope).toMatchObject({ initialCount: 1, initialPoints: 5, addedCount: 1, addedPoints: 3 });
  });

  it("changes made straight through the items service (table, API, importer) are picked up by the hook", () => {
    const { sprint, mkTask, rows } = devSetup(ctx);
    const s1 = sprint("S1");
    const a = mkTask("A", 5, "Ready", { sprint: { sprintId: s1.id } });
    expect(rows(s1.id)).toHaveLength(1);
    sprintsSvc.startSprint(ctx.sys, s1.id);
    itemsSvc.changeColumnValue(ctx.sys, a, "status", "In progress");
    expect(rows(s1.id)[0].startedAt).toBeTruthy();
    itemsSvc.changeColumnValue(ctx.sys, a, "status", "Done");
    expect(rows(s1.id)[0].doneAt).toBeTruthy();
    itemsSvc.changeColumnValue(ctx.sys, a, "status", "Review");
    expect(rows(s1.id)[0].doneAt).toBeNull();
  });

  it("velocity lists completed sprints with committed and completed work", () => {
    const { sprint, mkTask, t } = devSetup(ctx);
    for (const [n, est, doneIt] of [["S1", 5, true], ["S2", 8, true]] as const) {
      const s = sprint(n);
      const a = mkTask(`${n} a`, est);
      const b = mkTask(`${n} b`, 3);
      sprintsSvc.assignItem(ctx.sys, a, s.id);
      sprintsSvc.assignItem(ctx.sys, b, s.id);
      sprintsSvc.startSprint(ctx.sys, s.id);
      if (doneIt) itemsSvc.changeColumnValue(ctx.sys, a, "status", "Done");
      sprintsSvc.completeSprint(ctx.sys, s.id, { carryOver: "backlog" });
    }
    const v = sprintsSvc.velocity(ctx.sys, t.boards.sprints);
    expect(v.sprints.map((p) => [p.name, p.committed, p.completed, p.carried])).toEqual([["S1", 8, 5, 3], ["S2", 11, 8, 3]]);
    expect(v.average).toBe(6.5);
  });

  it("dashboard filters per klant", () => {
    const { sprint, mkTask, t } = devSetup(ctx);
    const s = sprint("S1");
    const a = mkTask("A", 5);
    const b = mkTask("B", 3);
    ensureDropdownLabel(ctx.sys, t.boards.taken, "klant", "Delta");
    ensureDropdownLabel(ctx.sys, t.boards.taken, "klant", "LMS");
    itemsSvc.changeColumnValue(ctx.sys, a, "klant", "Delta");
    itemsSvc.changeColumnValue(ctx.sys, b, "klant", "LMS");
    sprintsSvc.assignItem(ctx.sys, a, s.id);
    sprintsSvc.assignItem(ctx.sys, b, s.id);
    sprintsSvc.startSprint(ctx.sys, s.id);
    const all = sprintsSvc.dashboard(ctx.sys, t.boards.sprints, { sprintId: s.id });
    const delta = sprintsSvc.dashboard(ctx.sys, t.boards.sprints, { sprintId: s.id, klant: "Delta" });
    expect(all.totals!.points).toBe(8);
    expect(delta.totals!.points).toBe(5);
    expect(all.klanten).toEqual(["Delta", "LMS"]);
  });

  it("a task takes the klant of its epic and falls back to its own klant", () => {
    const { sprint, mkTask, t } = devSetup(ctx);
    const s = sprint("S1");
    for (const k of ["Delta", "LMS"]) { ensureDropdownLabel(ctx.sys, t.boards.taken, "klant", k); ensureDropdownLabel(ctx.sys, t.boards.epics, "klant", k); }
    const epic = itemsSvc.create(ctx.sys, { boardId: t.boards.epics, name: "Portaal" }).id;
    itemsSvc.changeColumnValue(ctx.sys, epic, "klant", "Delta");
    const rel = { linkedPulseIds: [{ linkedPulseId: epic }] };
    const linked = mkTask("Linked, other klant", 5, "Ready", { epic: rel });
    itemsSvc.changeColumnValue(ctx.sys, linked, "klant", "LMS");
    const own = mkTask("No epic", 3);
    itemsSvc.changeColumnValue(ctx.sys, own, "klant", "LMS");
    const bare = itemsSvc.create(ctx.sys, { boardId: t.boards.epics, name: "Zonder klant" }).id;
    const viaBare = mkTask("Epic without klant", 2, "Ready", { epic: { linkedPulseIds: [{ linkedPulseId: bare }] } });
    itemsSvc.changeColumnValue(ctx.sys, viaBare, "klant", "LMS");

    expect(sprintOf(linked)).toMatchObject({ klant: "Delta", epicNames: ["Portaal"] });
    expect(sprintOf(own).klant).toBe("LMS");
    expect(sprintOf(viaBare).klant).toBe("LMS");
    for (const id of [linked, own, viaBare]) sprintsSvc.assignItem(ctx.sys, id, s.id);
    sprintsSvc.startSprint(ctx.sys, s.id);
    expect(sprintsSvc.dashboard(ctx.sys, t.boards.sprints, { sprintId: s.id, klant: "Delta" }).totals!.points).toBe(5);
    expect(sprintsSvc.dashboard(ctx.sys, t.boards.sprints, { sprintId: s.id, klant: "LMS" }).totals!.points).toBe(5);
  });
});
