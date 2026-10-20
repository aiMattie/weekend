import { beforeEach, describe, expect, it } from "vitest";
import * as automations from "../../src/server/services/automations";
import * as items from "../../src/server/services/items";
import * as updates from "../../src/server/services/updates";
import { autoCtx, newItem, runsOf, settle, type AutoCtx } from "./setup";

let c: AutoCtx;
beforeEach(async () => { c = await autoCtx(); });

const wfInput = (g: AutoCtx) => ({
  boardId: g.boardId, name: "Goedkeuring", trigger: { type: "item_created", config: {} },
  steps: [
    { type: "approval", approverIds: [g.userIds.admin], message: "Akkoord?" },
    { type: "branch", condition: { op: "and", conditions: [{ type: "column_is_empty", config: { columnId: g.peopleId } }] },
      then: [{ type: "action", block: "create_update", config: { text: "leeg" } }],
      else: [{ type: "action", block: "create_update", config: { text: "gevuld" } }] },
    { type: "action", block: "set_status", config: { columnId: g.statusId, labelId: g.doneLabel } },
  ],
});

describe("workflows", () => {
  it("are drafts until published, then run through the same engine", async () => {
    const wf = automations.createWorkflow(c.admin, { boardId: c.boardId, name: "x", definition: { trigger: { type: "item_created", config: {} }, steps: [{ type: "action", block: "create_update", config: { text: "hoi" } }] } });
    expect(wf).toMatchObject({ kind: "workflow", status: "draft", active: false });
    newItem(c);
    await settle();
    expect(runsOf(wf.id)).toHaveLength(0);
    expect(() => automations.toggle(c.admin, wf.id, true)).toThrow(/Publish/);
    const pub = automations.publishWorkflow(c.admin, wf.id);
    expect(pub).toMatchObject({ status: "published", active: true });
    const it1 = newItem(c, "Tweede");
    await settle();
    expect(updates.list(c.admin, it1.id)[0].bodyText).toBe("hoi");
    // editing a published workflow sends it back to draft
    const edited = automations.updateWorkflow(c.admin, wf.id, { steps: [{ type: "action", block: "create_update", config: { text: "nieuw" } }] });
    expect(edited).toMatchObject({ status: "draft", active: false });
  });

  it("an approval step pauses the run; approving continues through the branch", async () => {
    const wf = automations.createWorkflow(c.admin, { ...wfInput(c), definition: wfInput(c) });
    automations.publishWorkflow(c.admin, wf.id);
    const it1 = newItem(c, "Akkoord nodig");
    await settle();
    const run = runsOf(wf.id)[0];
    expect(run.status).toBe("waiting_approval");
    expect(updates.list(c.admin, it1.id)).toHaveLength(0);
    expect(automations.listPendingApprovals(c.admin)).toHaveLength(1);
    await expect(automations.decideRun(c.member, run.id, true)).rejects.toThrow(/not an approver/);
    const done = await automations.decideRun(c.admin, run.id, true);
    expect(done.status).toBe("success");
    expect(updates.list(c.admin, it1.id).map((u) => u.bodyText)).toEqual(["leeg"]);
    expect(items.get(c.admin, it1.id).values[c.statusId]).toEqual({ index: Number(c.doneLabel) });
  });

  it("rejecting stops the run without running the remaining steps", async () => {
    const wf = automations.createWorkflow(c.admin, { ...wfInput(c), definition: wfInput(c) });
    automations.publishWorkflow(c.admin, wf.id);
    const it1 = newItem(c, "Nee");
    await settle();
    const run = runsOf(wf.id)[0];
    const r = await automations.decideRun(c.admin, run.id, false);
    expect(r.status).toBe("rejected");
    expect(items.get(c.admin, it1.id).values[c.statusId]).toBeUndefined();
  });

  it("planWorkflow turns a sentence into a definition draft", () => {
    const p = automations.planWorkflow(c.admin, { boardId: c.boardId, text: "When an item is created, assign Admin Hard then notify Builder" });
    expect(p.definition?.trigger.type).toBe("item_created");
    expect(p.definition?.steps.length).toBeGreaterThanOrEqual(1);
  });
});

describe("permissions and MCP style input", () => {
  it("viewers cannot create, toggle or delete automations", async () => {
    const a = automations.create(c.admin, { boardId: c.boardId, name: "x", trigger: { type: "item_created", config: {} }, actions: [{ type: "archive_item" }] });
    expect(() => automations.create(c.viewer, { boardId: c.boardId, name: "y", trigger: { type: "item_created", config: {} }, actions: [{ type: "archive_item" }] })).toThrow();
    expect(() => automations.toggle(c.viewer, a.id, false)).toThrow();
    expect(() => automations.remove(c.viewer, a.id)).toThrow();
    expect(automations.list(c.viewer, { boardId: c.boardId })).toHaveLength(1);
  });

  it("rejects unknown blocks and invalid config with readable errors", () => {
    expect(() => automations.create(c.admin, { boardId: c.boardId, name: "x", trigger: { type: "nope", config: {} }, actions: [{ type: "archive_item" }] })).toThrow(/Unknown trigger/);
    expect(() => automations.create(c.admin, { boardId: c.boardId, name: "x", trigger: { type: "item_created", config: {} }, actions: [{ type: "move_item_to_group", config: {} }] })).toThrow(/Move item to group/);
    expect(() => automations.create(c.admin, { boardId: c.boardId, name: "x", trigger: { type: "item_created", config: {} }, actions: [] })).toThrow();
  });

  it("toggle, duplicate and delete", () => {
    const a = automations.create(c.admin, { boardId: c.boardId, name: "x", trigger: { type: "item_created", config: {} }, actions: [{ type: "archive_item" }] });
    expect(automations.toggle(c.admin, a.id).active).toBe(false);
    expect(automations.toggle(c.admin, a.id).active).toBe(true);
    const copy = automations.duplicate(c.admin, a.id);
    expect(copy).toMatchObject({ active: false, name: "x (kopie)" });
    automations.remove(c.admin, a.id);
    expect(automations.list(c.admin, { boardId: c.boardId }).map((x) => x.id)).toEqual([copy.id]);
    expect(() => automations.get(c.admin, a.id)).toThrow();
  });
});
