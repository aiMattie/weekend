import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { items } from "../../src/db/schema/core";
import { devColumns } from "../../src/server/services/dev-config";
import { nextEpicStatus, syncEpics } from "../../src/server/services/epic-lifecycle";
import * as itemsSvc from "../../src/server/services/items";
import * as sprintsSvc from "../../src/server/services/sprints";
import { statusLabels } from "../../src/server/columns/labels";
import { freshCtx, type Ctx } from "../helpers";
import { devSetup } from "./helpers";

let ctx: Ctx;
beforeEach(async () => { ctx = await freshCtx(); });

const t = (isDone: boolean, inActiveSprint = false) => ({ isDone, inActiveSprint });

describe("nextEpicStatus", () => {
  it("derives the status from the tasks", () => {
    expect(nextEpicStatus("Gepland", [t(true), t(true)])).toBe("Afgerond");
    expect(nextEpicStatus("Gepland", [t(false, true), t(true)])).toBe("Actief");
    expect(nextEpicStatus("Actief", [t(false), t(true)])).toBe("Gepland");
    expect(nextEpicStatus("Afgerond", [t(false)])).toBe("Gepland");
    expect(nextEpicStatus(null, [t(false)])).toBeNull();
    expect(nextEpicStatus("Gepland", [t(false)])).toBeNull();
    expect(nextEpicStatus("Afgerond", [t(true)])).toBeNull();
  });
  it("leaves parked epics and epics without tasks alone", () => {
    expect(nextEpicStatus("Geparkeerd", [t(true)])).toBeNull();
    expect(nextEpicStatus("Geparkeerd", [t(false, true)])).toBeNull();
    expect(nextEpicStatus("Actief", [])).toBeNull();
  });
});

describe("epic lifecycle on the dev boards", () => {
  const statusOf = (boardId: string, id: string) => {
    const col = devColumns(boardId).status!;
    const it = db.select().from(items).where(eq(items.id, id)).get()!;
    return statusLabels(col.settings).find((l) => l.id === (it.values[col.id] as { index?: number } | undefined)?.index)?.text ?? null;
  };

  it("follows sprint assignment, status changes, sprint completion and re-linking", () => {
    const { t: dev, mkTask, sprint } = devSetup(ctx);
    const epic = itemsSvc.create(ctx.sys, { boardId: dev.boards.epics, name: "Portaal", values: { status: "Gepland" } }).id;
    const other = itemsSvc.create(ctx.sys, { boardId: dev.boards.epics, name: "Later", values: { status: "Gepland" } }).id;
    const rel = (id: string) => ({ linkedPulseIds: [{ linkedPulseId: id }] });
    const a = mkTask("A", 3, "Ready", { epic: rel(epic) });
    const b = mkTask("B", 3, "Ready", { epic: rel(epic) });
    const s1 = sprint("S1");
    sprint("S2");
    sprintsSvc.assignItem(ctx.sys, a, s1.id);
    expect(statusOf(dev.boards.epics, epic)).toBe("Gepland");

    sprintsSvc.startSprint(ctx.sys, s1.id);
    expect(statusOf(dev.boards.epics, epic)).toBe("Actief");

    sprintsSvc.setStatus(ctx.sys, a, "Done");
    expect(statusOf(dev.boards.epics, epic)).toBe("Gepland"); // B still open, not in the sprint

    sprintsSvc.setStatus(ctx.sys, b, "Done");
    expect(statusOf(dev.boards.epics, epic)).toBe("Afgerond");

    sprintsSvc.setStatus(ctx.sys, b, "In progress");
    expect(statusOf(dev.boards.epics, epic)).toBe("Gepland");

    // moving B to another epic recomputes both: the old one is done again
    const cols = devColumns(dev.boards.taken);
    itemsSvc.changeColumnValue(ctx.sys, b, cols.epic!.id, rel(other));
    expect(statusOf(dev.boards.epics, epic)).toBe("Afgerond");
    expect(statusOf(dev.boards.epics, other)).toBe("Gepland");

    sprintsSvc.assignItem(ctx.sys, b, s1.id);
    expect(statusOf(dev.boards.epics, other)).toBe("Actief");
    sprintsSvc.completeSprint(ctx.sys, s1.id, { carryOver: "next" });
    expect(statusOf(dev.boards.epics, other)).toBe("Gepland"); // carried to the planned S2
  });

  it("never touches a parked epic", () => {
    const { t: dev, mkTask } = devSetup(ctx);
    const epic = itemsSvc.create(ctx.sys, { boardId: dev.boards.epics, name: "EBI", values: { status: "Geparkeerd" } }).id;
    const a = mkTask("A", 3, "Ready", { epic: { linkedPulseIds: [{ linkedPulseId: epic }] } });
    sprintsSvc.setStatus(ctx.sys, a, "Done");
    expect(statusOf(dev.boards.epics, epic)).toBe("Geparkeerd");
    expect(syncEpics([epic])).toEqual([]);
  });
});
