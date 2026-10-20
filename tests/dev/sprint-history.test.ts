import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { sprintItems, sprints } from "../../src/db/schema/sprints";
import { devColumns } from "../../src/server/services/dev-config";
import { backfillJiraSprintHistory } from "../../src/server/services/migration/jira-sprint-history";
import type { JiraSource } from "../../src/server/services/migration/jira-types";
import * as sprintsSvc from "../../src/server/services/sprints";
import { recordPastSprints } from "../../src/server/services/sprint-sync";
import { freshCtx, type Ctx } from "../helpers";
import { devSetup } from "./helpers";

let ctx: Ctx;
beforeEach(async () => { ctx = await freshCtx(); });

/** Close a sprint the way the Jira import does: state only, rows stay open. */
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

describe("Jira sprint history backfill", () => {
  it("maps every Jira sprint of an issue to its team sprint and records the earlier ones", async () => {
    const { mkTask, sprint, t } = devSetup(ctx);
    const jan = sprint("Jan", "2026-01-05", "2026-02-01");
    const feb = sprint("Feb", "2026-02-02", "2026-03-01");
    const mar = sprint("Mar", "2026-03-02", "2026-03-29");
    closeRaw(jan.id); closeRaw(feb.id);
    const jiraCol = devColumns(t.boards.taken).jira!;
    const a = mkTask("Imported", 3, "Ready", { [jiraCol.key]: "ABC-1" });
    sprintsSvc.assignItem(ctx.sys, a, mar.id);
    const sprintField = "customfield_10020";
    const source = {
      fields: async () => [{ id: sprintField, name: "Sprint", schema: { custom: "com.pyxis.greenhopper.jira:gh-sprint" } }],
      issues: async () => [{ id: "1", key: "ABC-1", fields: { [sprintField]: [
        { id: 1, name: "ABC Sprint 1", state: "closed", startDate: "2026-01-06T09:00:00.000Z" },
        { id: 2, name: "ABC Sprint 2", state: "closed", startDate: "2026-02-03T09:00:00.000Z" },
        { id: 3, name: "ABC Sprint 3", state: "active", startDate: "2026-03-03T09:00:00.000Z" },
        { id: 9, name: "Way back", state: "closed", startDate: "2020-01-01T09:00:00.000Z" },
      ] } }],
    } as unknown as JiraSource;

    const dry = await backfillJiraSprintHistory(source, { tasksBoardId: t.boards.taken, sprintsBoardId: t.boards.sprints, apply: false });
    expect(dry).toMatchObject({ projects: ["ABC"], issues: 1, tasks: 1 });
    expect(db.select().from(sprintItems).where(eq(sprintItems.itemId, a)).all()).toHaveLength(1);

    const r = await backfillJiraSprintHistory(source, { tasksBoardId: t.boards.taken, sprintsBoardId: t.boards.sprints, apply: true });
    expect(r).toMatchObject({ issues: 1, tasks: 1, rows: 2, unmatchedSprints: ["Way back"] });
    expect(sprintsSvc.sprintHistory(ctx.sys, a).sprints.map((x) => [x.name, x.result])).toEqual([["Jan", "carried"], ["Feb", "carried"], ["Mar", "current"]]);
    expect((await backfillJiraSprintHistory(source, { tasksBoardId: t.boards.taken, sprintsBoardId: t.boards.sprints, apply: true })).rows).toBe(0);
  });
});
