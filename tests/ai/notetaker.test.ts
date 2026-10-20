import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLlmClient } from "../../src/server/ai/llm";
import * as docsSvc from "../../src/server/services/docs";
import * as itemsSvc from "../../src/server/services/items";
import * as notetaker from "../../src/server/services/notetaker";
import * as workspaces from "../../src/server/services/workspaces";
import { freshCtx, type Ctx } from "../helpers";
import { ScriptedLlm } from "./mock-llm";

let ctx: Ctx;
beforeEach(async () => { ctx = await freshCtx(); });
afterEach(() => setLlmClient(null));

const TRANSCRIPT = `Aanwezig: Admin, Builder, Planner
We bespraken de migratie van Bravo naar Weekend. Het team is positief over het tempo. De klant wil voor kerst live.
Besluit: we starten de proefmigratie op 2026-11-02.
Besluit: Builder is technisch aanspreekpunt.
Actie: Builder - Proefmigratie voorbereiden (2026-10-30)
Actiepunt: Planner: Planning delen met de klant
- [ ] @Admin Offerte fase 2 versturen`;

describe("notetaker extraction", () => {
  it("falls back to line based extraction without AI (decisions, action items, assignees, dates)", async () => {
    const m = await notetaker.create(ctx.member, { title: "Kick-off Bravo", transcript: TRANSCRIPT, clientName: "Bravo" });
    expect(m.method).toBe("fallback");
    expect(m.attendees).toEqual(["Admin", "Builder", "Planner"]);
    expect(m.decisions).toEqual(["we starten de proefmigratie op 2026-11-02.", "Builder is technisch aanspreekpunt."]);
    expect(m.actionItems.map((a) => [a.text, a.assigneeName, a.due])).toEqual([
      ["Proefmigratie voorbereiden", "Builder", "2026-10-30"],
      ["Planning delen met de klant", "Planner", null],
      ["Offerte fase 2 versturen", "Admin", null],
    ]);
    expect(m.actionItems[0].assigneeId).toBe(ctx.userIds.dev1);
    expect(m.summary).toContain("migratie");
  });

  it("uses Claude when available, validates the JSON and resolves assignees", async () => {
    const llm = new ScriptedLlm([JSON.stringify({
      summary: "Kick-off over de migratie.", decisions: ["Proefmigratie start 2 november"],
      actionItems: [{ text: "Proefmigratie voorbereiden", assignee: "Builder", due: "2026-10-30" }, { text: "Offerte versturen", assignee: "Iemand Onbekend", due: "morgen" }], attendees: ["Admin"],
    })]);
    setLlmClient(llm);
    const m = await notetaker.create(ctx.member, { title: "Kick-off", transcript: TRANSCRIPT });
    expect(m.method).toBe("ai");
    expect(m.summary).toBe("Kick-off over de migratie.");
    expect(m.actionItems[0]).toMatchObject({ assigneeId: ctx.userIds.dev1, due: "2026-10-30", status: "proposed" });
    expect(m.actionItems[1]).toMatchObject({ assigneeId: null, due: null }); // unknown person, invalid date dropped
    expect(llm.calls[0].messages[0].content).toContain("<transcript>");
    // an unusable answer degrades to the fallback instead of failing
    setLlmClient(new ScriptedLlm(["geen json", "nog steeds niet"]));
    expect((await notetaker.create(ctx.member, { title: "Nog een", transcript: TRANSCRIPT })).method).toBe("fallback");
  });

  it("stores the gespreksverslag as a doc in the klant workspace and creates tasks only after confirmation", async () => {
    const klant = workspaces.list(ctx.sys).find((w) => w.name === "Bravo")!;
    const m = await notetaker.create(ctx.member, { title: "Kick-off", transcript: TRANSCRIPT, clientName: "Bravo", workspaceId: klant.id, heldAt: "2026-10-05T10:00:00.000Z" });
    const rep = notetaker.createReport(ctx.member, m.id);
    const doc = docsSvc.read(ctx.sys, { ids: [rep.docId] })[0];
    expect(doc.workspaceId).toBe(klant.id);
    expect(doc.title).toBe("Gespreksverslag Bravo - 2026-10-05: Kick-off");
    expect(doc.markdown).toContain("Proefmigratie voorbereiden");
    expect(doc.markdown).toContain("Besluiten");
    // second call updates the same doc
    expect(notetaker.createReport(ctx.member, m.id).docId).toBe(rep.docId);

    expect(itemsSvc.list(ctx.sys, { boardId: ctx.boardId })).toHaveLength(0); // nothing created yet
    const ids = m.actionItems.map((a) => a.id);
    const r = notetaker.createTasks(ctx.member, m.id, { actionIds: ids.slice(0, 2), boardId: ctx.boardId });
    expect(r.created.map((c) => c.name)).toEqual(["Proefmigratie voorbereiden", "Planning delen met de klant"]);
    const tasks = itemsSvc.list(ctx.sys, { boardId: ctx.boardId });
    expect(tasks).toHaveLength(2);
    expect(JSON.stringify(tasks[0].values)).toContain(ctx.userIds.dev1);
    expect(JSON.stringify(tasks[0].values)).toContain("2026-10-30");
    // idempotent, and subitems via parentItemId
    expect(notetaker.createTasks(ctx.member, m.id, { actionIds: ids.slice(0, 2), boardId: ctx.boardId }).skipped).toHaveLength(2);
    const parent = tasks[0];
    const third = notetaker.createTasks(ctx.member, m.id, { actionIds: [ids[2]], boardId: ctx.boardId, parentItemId: parent.id });
    expect(itemsSvc.listSubitems(ctx.sys, parent.id).map((s) => s.name)).toEqual(["Offerte fase 2 versturen"]);
    expect(third.created).toHaveLength(1);
    expect(notetaker.get(ctx.member, m.id).actionItems.every((a) => a.status === "created")).toBe(true);
  });

  it("needs a workspace for the report, keeps meetings private and feeds the MCP list", async () => {
    const m = await notetaker.create(ctx.member, { title: "Intern", transcript: TRANSCRIPT });
    expect(() => notetaker.createReport(ctx.member, m.id)).toThrow(/klant-workspace/);
    expect(() => notetaker.get(ctx.guest, m.id)).toThrow();
    const colleague = ctx.admin; // admins may see everything
    expect(notetaker.get(colleague, m.id).id).toBe(m.id);
    expect(notetaker.listMeetings(ctx.member, { limit: 5 }).meetings[0]).toMatchObject({ title: "Intern", action_items: expect.any(Array) });
    expect(() => notetaker.createTasks(ctx.admin, m.id, { actionIds: ["x"], boardId: ctx.boardId })).not.toThrow(); // admin may confirm
    notetaker.remove(ctx.member, m.id);
    expect(notetaker.list(ctx.member).meetings).toHaveLength(0);
  });
});
