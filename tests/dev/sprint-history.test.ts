import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { sprints } from "../../src/db/schema/sprints";
import * as sprintsSvc from "../../src/server/services/sprints";
import { recordPastSprints } from "../../src/server/services/sprint-sync";
import { freshCtx, type Ctx } from "../helpers";
import { devSetup } from "./helpers";

let ctx: Ctx;
beforeEach(async () => { ctx = await freshCtx(); });

/** Close a sprint the way an import does: state only, rows stay open. */
const closeRaw = (id: string) => db.update(sprints).set({ state: "completed", completedAt: "2026-01-01T00:00:00.000Z" }).where(eq(sprints.id, id)).run();

describe("sprint history of a task", () => {
  it("records carry-over through the complete dialog and shows it in the history", () => {
    const { mkTask, sprint, t } = devSetup(ctx);
    const s1 = sprint("S1");
    const s2 = sprint("S2");
    const a = mkTask("A");
    sprintsSvc.assignItem(ctx.sys, a, s1.id);
    sprintsSvc.startSprint(ctx.sys, s1.id);
    sprintsSvc.completeSprint(ctx.sys, s1.id, { carryOver: "next", nextSprintId: s2.id });
    const h = sprintsSvc.sprintHistory(ctx.sys, a);
    expect(h.sprints.map((r) => [r.name, r.result])).toEqual([["S1", "carried"], ["S2", "current"]]);
    expect(h.carried).toBe(1);
    expect(sprintsSvc.planning(ctx.sys, t.boards.sprints).pastSprints[a]).toBe(1);
  });

  it("open work left in a completed sprint shows in the backlog and is marked carried once it moves on", () => {
    const { mkTask, sprint, t } = devSetup(ctx);
    const old = sprint("Old");
    const next = sprint("Next");
    const a = mkTask("Left behind");
    const d = mkTask("Finished", 3, "Done");
    sprintsSvc.assignItem(ctx.sys, a, old.id);
    sprintsSvc.assignItem(ctx.sys, d, old.id);
    closeRaw(old.id);

    const p = sprintsSvc.planning(ctx.sys, t.boards.sprints);
    expect(p.backlog.map((x) => x.id)).toContain(a);
    expect(p.backlog.map((x) => x.id)).not.toContain(d);
    expect(sprintsSvc.sprintHistory(ctx.sys, a).sprints.map((r) => r.result)).toEqual(["open"]);

    sprintsSvc.assignItem(ctx.sys, a, next.id);
    expect(sprintsSvc.sprintHistory(ctx.sys, a).sprints.map((r) => [r.name, r.result])).toEqual([["Old", "carried"], ["Next", "current"]]);
    // the done task that stays in the old sprint is untouched
    expect(sprintsSvc.sprintHistory(ctx.sys, d).sprints.map((r) => r.result)).toEqual(["done"]);
  });

  it("recordPastSprints adds completed sprints once and skips live ones", () => {
    const { mkTask, sprint } = devSetup(ctx);
    const s1 = sprint("S1");
    const s2 = sprint("S2");
    const live = sprint("Live");
    closeRaw(s1.id); closeRaw(s2.id);
    const a = mkTask("A");
    sprintsSvc.assignItem(ctx.sys, a, live.id);
    expect(recordPastSprints(a, [s1.id, s2.id, live.id, s1.id])).toBe(2);
    expect(recordPastSprints(a, [s1.id, s2.id])).toBe(0);
    expect(sprintsSvc.sprintHistory(ctx.sys, a).sprints.map((r) => r.result)).toEqual(["carried", "carried", "current"]);
  });
});
