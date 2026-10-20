import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { notifications } from "../../src/db/schema/core";
import * as items from "../../src/server/services/items";
import * as automations from "../../src/server/services/automations";
import { autoCtx, makeAutomation, newItem, runsOf, settle, type AutoCtx } from "./setup";

let c: AutoCtx;
beforeEach(async () => { c = await autoCtx(); });

const moveWhenDone = (g: AutoCtx) => ({
  trigger: { type: "status_changes_to", config: { columnId: g.statusId, labelId: g.doneLabel } },
  steps: [{ type: "action", block: "move_item_to_group", config: { groupId: g.doneGroup } }],
});

describe("trigger matching", () => {
  it("status Done moves the item to the group, other statuses do not", async () => {
    const a = makeAutomation(c, moveWhenDone(c));
    const it1 = newItem(c, "A");
    const it2 = newItem(c, "B");
    items.changeColumnValue(c.admin, it1.id, "status", "Working on it");
    await settle();
    expect(items.get(c.admin, it1.id).groupId).toBe(c.todoGroup);
    items.changeColumnValue(c.admin, it1.id, "status", "Done");
    await settle();
    expect(items.get(c.admin, it1.id).groupId).toBe(c.doneGroup);
    expect(items.get(c.admin, it2.id).groupId).toBe(c.todoGroup);
    const runs = runsOf(a.id);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("success");
    expect(runs[0].steps[0].block).toBe("move_item_to_group");
  });

  it("accepts readable names (label text, group title, column key) and resolves them to ids", () => {
    const a = automations.create(c.admin, {
      boardId: c.boardId, name: "named",
      trigger: { type: "status_changes_to", config: { columnId: "status", labelId: "Done" } },
      actions: [{ type: "move_item_to_group", config: { groupId: "Afgerond" } }],
    });
    expect(a.definition.trigger.config).toMatchObject({ columnId: c.statusId, labelId: c.doneLabel });
    expect(a.definition.steps[0]).toMatchObject({ block: "move_item_to_group", config: { groupId: c.doneGroup } });
    expect(() => automations.create(c.admin, { boardId: c.boardId, name: "bad", trigger: { type: "status_changes_to", config: { columnId: "status", labelId: "Nope" } }, actions: [{ type: "archive_item" }] })).toThrow(/Unknown label/);
  });

  it("item_created, subitem_created and person_assigned fire on the right events", async () => {
    const created = makeAutomation(c, { trigger: { type: "item_created", config: {} }, steps: [{ type: "action", block: "set_status", config: { columnId: c.statusId, labelId: c.workingLabel } }] });
    const sub = makeAutomation(c, { trigger: { type: "subitem_created", config: {} }, steps: [{ type: "action", block: "create_update", config: { text: "sub: {item}" } }] });
    const assigned = makeAutomation(c, { trigger: { type: "person_assigned", config: { columnId: c.peopleId } }, steps: [{ type: "action", block: "create_update", config: { text: "assigned {item}" } }] });
    const it1 = newItem(c, "Parent");
    await settle();
    expect(runsOf(created.id)).toHaveLength(1);
    expect(items.get(c.admin, it1.id).values[c.statusId]).toEqual({ index: Number(c.workingLabel) });
    items.create(c.admin, { boardId: c.boardId, parentItemId: it1.id, name: "child" });
    await settle();
    expect(runsOf(sub.id)).toHaveLength(1);
    expect(runsOf(created.id)).toHaveLength(1); // a subitem is not "an item created"
    items.changeColumnValue(c.admin, it1.id, "people", [c.userIds.dev1]);
    await settle();
    expect(runsOf(assigned.id)).toHaveLength(1);
    items.changeColumnValue(c.admin, it1.id, "people", [c.userIds.dev1]); // no new person
    await settle();
    expect(runsOf(assigned.id)).toHaveLength(1);
  });

  it("item_moved_to_group only fires on a real group change", async () => {
    const a = makeAutomation(c, { trigger: { type: "item_moved_to_group", config: { groupId: c.doneGroup } }, steps: [{ type: "action", block: "set_status", config: { columnId: c.statusId, labelId: c.doneLabel } }] });
    const it1 = newItem(c);
    items.move(c.admin, it1.id, { top: true }); // reorder only
    await settle();
    expect(runsOf(a.id)).toHaveLength(0);
    items.move(c.admin, it1.id, { groupId: c.doneGroup });
    await settle();
    expect(runsOf(a.id)).toHaveLength(1);
    expect(items.get(c.admin, it1.id).values[c.statusId]).toEqual({ index: Number(c.doneLabel) });
  });

  it("button_clicked fires through clickButton", async () => {
    const col = (await import("../../src/server/services/columns")).create(c.admin, c.boardId, { title: "Go", type: "text" });
    const a = makeAutomation(c, { trigger: { type: "button_clicked", config: { columnId: col.id } }, steps: [{ type: "action", block: "duplicate_item", config: {} }] });
    const it1 = newItem(c, "Knop");
    automations.clickButton(c.admin, { itemId: it1.id, columnId: col.id });
    await settle();
    expect(runsOf(a.id)[0].status).toBe("success");
    expect(items.list(c.admin, { boardId: c.boardId }).map((i) => i.name)).toContain("Knop (copy)");
  });

  it("an inactive automation does not run", async () => {
    const a = makeAutomation(c, moveWhenDone(c));
    automations.toggle(c.admin, a.id, false);
    const it1 = newItem(c);
    items.changeColumnValue(c.admin, it1.id, "status", "Done");
    await settle();
    expect(runsOf(a.id)).toHaveLength(0);
    automations.toggle(c.admin, a.id, true);
    items.changeColumnValue(c.admin, it1.id, "status", "Stuck");
    items.changeColumnValue(c.admin, it1.id, "status", "Done");
    await settle();
    expect(runsOf(a.id)).toHaveLength(1);
  });
});

describe("conditions", () => {
  const withCond = (g: AutoCtx, conditions: unknown) => ({ ...moveWhenDone(g), conditions });

  it("AND requires all conditions, OR any", async () => {
    const and1 = makeAutomation(c, withCond(c, { op: "and", conditions: [{ type: "column_equals", config: { columnId: c.peopleId, value: c.userIds.dev1 } }, { type: "column_not_empty", config: { columnId: c.dateId } }] }));
    const or1 = makeAutomation(c, { ...withCond(c, { op: "or", conditions: [{ type: "column_equals", config: { columnId: c.peopleId, value: c.userIds.dev1 } }, { type: "column_not_empty", config: { columnId: c.dateId } }] }), steps: [{ type: "action", block: "create_update", config: { text: "or ok" } }] });
    const it1 = newItem(c, "X", { values: { people: [c.userIds.dev1] } });
    items.changeColumnValue(c.admin, it1.id, "status", "Done");
    await settle();
    expect(runsOf(and1.id)).toHaveLength(0); // date empty
    expect(runsOf(or1.id)).toHaveLength(1);
    const it2 = newItem(c, "Y", { values: { people: [c.userIds.dev1], date: "2026-12-01" } });
    items.changeColumnValue(c.admin, it2.id, "status", "Done");
    await settle();
    expect(runsOf(and1.id)).toHaveLength(1);
  });

  it("column_contains and column_is_empty", async () => {
    const a = makeAutomation(c, { ...moveWhenDone(c), conditions: { op: "and", conditions: [{ type: "column_contains", config: { columnId: c.statusId, text: "don" } }, { type: "column_is_empty", config: { columnId: c.dateId } }] } });
    const it1 = newItem(c);
    items.changeColumnValue(c.admin, it1.id, "status", "Done");
    await settle();
    expect(runsOf(a.id)).toHaveLength(1);
  });

  it("branch steps run the then or else path", async () => {
    const a = makeAutomation(c, {
      trigger: { type: "item_created", config: {} },
      steps: [{ type: "branch", condition: { op: "and", conditions: [{ type: "column_not_empty", config: { columnId: c.dateId } }] },
        then: [{ type: "action", block: "create_update", config: { text: "met datum" } }],
        else: [{ type: "action", block: "create_update", config: { text: "zonder datum" } }] }],
    });
    const x = newItem(c, "x", { values: { date: "2026-12-01" } });
    const y = newItem(c, "y");
    await settle();
    expect(runsOf(a.id).filter((r) => r.status === "success")).toHaveLength(2);
    const ups = (await import("../../src/server/services/updates"));
    expect(ups.list(c.admin, x.id)[0].bodyText).toBe("met datum");
    expect(ups.list(c.admin, y.id)[0].bodyText).toBe("zonder datum");
  });
});

describe("loop protection", () => {
  it("an automation never retriggers itself", async () => {
    const a = makeAutomation(c, { trigger: { type: "column_changed", config: {} }, steps: [{ type: "action", block: "set_status", config: { columnId: c.statusId, labelId: c.workingLabel } }] });
    const it1 = newItem(c);
    items.changeColumnValue(c.admin, it1.id, "date", "2026-12-01");
    await settle();
    const runs = runsOf(a.id);
    expect(runs.filter((r) => r.status === "success")).toHaveLength(1);
    const skipped = runs.filter((r) => r.status === "skipped");
    expect(skipped.length).toBeGreaterThanOrEqual(1);
    expect(skipped[0].error).toMatch(/Loop protection/);
  });

  it("a ping-pong between two automations stops (origin chain)", async () => {
    const A = makeAutomation(c, { name: "A", trigger: { type: "status_changes_to", config: { columnId: c.statusId, labelId: c.doneLabel } }, steps: [{ type: "action", block: "set_status", config: { columnId: c.statusId, labelId: c.stuckLabel } }] });
    const B = makeAutomation(c, { name: "B", trigger: { type: "status_changes_to", config: { columnId: c.statusId, labelId: c.stuckLabel } }, steps: [{ type: "action", block: "set_status", config: { columnId: c.statusId, labelId: c.doneLabel } }] });
    const it1 = newItem(c);
    items.changeColumnValue(c.admin, it1.id, "status", "Done");
    await settle();
    const all = [...runsOf(A.id), ...runsOf(B.id)];
    expect(all.length).toBeLessThanOrEqual(5);
    expect(all.some((r) => r.status === "skipped" && /Loop protection/.test(r.error ?? ""))).toBe(true);
    expect(all.filter((r) => r.status === "success").length).toBeGreaterThanOrEqual(2);
  });
});

describe("run limits", () => {
  it("skips runs once the per board hourly limit is reached", async () => {
    process.env.AUTOMATION_BOARD_HOURLY_LIMIT = "2";
    try {
      const a = makeAutomation(c, { trigger: { type: "item_created", config: {} }, steps: [{ type: "action", block: "create_update", config: { text: "hi" } }] });
      for (let i = 0; i < 4; i++) newItem(c, `i${i}`);
      await settle();
      const runs = runsOf(a.id);
      expect(runs.filter((r) => r.status === "success")).toHaveLength(2);
      expect(runs.filter((r) => r.status === "skipped" && /limit/i.test(r.error ?? ""))).toHaveLength(2);
    } finally { delete process.env.AUTOMATION_BOARD_HOURLY_LIMIT; }
  });
});

describe("actions", () => {
  it("notify creates in-app notifications and sends an email", async () => {
    makeAutomation(c, { trigger: { type: "item_created", config: {} }, steps: [{ type: "action", block: "notify", config: { recipients: [c.userIds.dev1], message: "Nieuw: {item} op {board}", email: true } }] });
    newItem(c, "Offerte");
    await settle();
    const n = db.select().from(notifications).where(and(eq(notifications.userId, c.userIds.dev1), eq(notifications.type, "automation"))).all();
    expect(n).toHaveLength(1);
    expect(n[0].title).toBe("Nieuw: Offerte op Test board");
    expect(c.mails).toHaveLength(1);
    expect(c.mails[0].to).toEqual(["dev1@example.com"]);
    expect(c.mails[0].text).toContain("/boards/");
  });

  it("create_item on another board maps columns, assign_person adds, increment and set_date work", async () => {
    const other = (await import("../../src/server/services/boards")).create(c.admin, { workspaceId: c.workspaceId, name: "Other" });
    const ocols = (await import("../../src/server/services/columns")).list(c.admin, other.id);
    const ostatus = ocols.find((x) => x.key === "status")!;
    makeAutomation(c, { trigger: { type: "item_created", config: {} }, steps: [
      { type: "action", block: "create_item", config: { boardId: other.id, name: "Kopie van {item}", mapping: { [ostatus.id]: "Done" } } },
      { type: "action", block: "assign_person", config: { columnId: c.peopleId, userIds: ["@creator", c.userIds.dev1] } },
      { type: "action", block: "set_date", config: { columnId: c.dateId, offsetValue: 3, offsetUnit: "days" } },
    ] });
    const it1 = newItem(c, "Bron");
    await settle();
    const copy = items.list(c.admin, { boardId: other.id })[0];
    expect(copy.name).toBe("Kopie van Bron");
    expect(copy.values[ostatus.id]).toEqual({ index: 1 });
    const src = items.get(c.admin, it1.id);
    expect((src.values[c.peopleId] as { personsAndTeams: { id: string }[] }).personsAndTeams.map((p) => p.id)).toContain(c.userIds.dev1);
    const d = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    expect(src.values[c.dateId]).toEqual({ date: d });
  });

  it("subitems all done sets the parent status (condition + target parent)", async () => {
    const a = makeAutomation(c, { trigger: { type: "subitem_completed", config: {} }, conditions: { op: "and", conditions: [{ type: "all_subitems_done", config: {} }] }, steps: [{ type: "action", block: "set_status", config: { columnId: c.statusId, labelId: c.doneLabel, on: "parent" } }] });
    const p = newItem(c, "Parent");
    const s1 = items.create(c.admin, { boardId: c.boardId, parentItemId: p.id, name: "s1" });
    const s2 = items.create(c.admin, { boardId: c.boardId, parentItemId: p.id, name: "s2" });
    items.changeColumnValue(c.admin, s1.id, "status", "Done");
    await settle();
    expect(runsOf(a.id)).toHaveLength(0);
    items.changeColumnValue(c.admin, s2.id, "status", "Done");
    await settle();
    expect(items.get(c.admin, p.id).values[c.statusId]).toEqual({ index: 1 });
  });

  it("client workspace action fails clearly when the hook is not registered, works when it is", async () => {
    const a = makeAutomation(c, { trigger: { type: "item_created", config: {} }, steps: [{ type: "action", block: "create_client_workspace", config: { name: "{item}" } }] });
    newItem(c, "Klant X");
    await settle();
    const r1 = runsOf(a.id)[0];
    expect(["retrying", "failed"]).toContain(r1.status);
    expect(r1.error).toMatch(/not registered/);
    const { registerAutomationHook } = await import("../../src/server/automations/hooks");
    registerAutomationHook("create_client_workspace", ({ name }) => ({ workspaceId: `ws-${name}` }));
    const { executeRun } = await import("../../src/server/automations/engine");
    const r2 = await executeRun(r1.id);
    expect(r2.status).toBe("success");
    expect(r2.steps.at(-1)?.output).toBe("workspace ws-Klant X");
  });

  it("epic with first tasks creates items on both boards", async () => {
    const B = await import("../../src/server/services/boards");
    const epics = B.create(c.admin, { workspaceId: c.workspaceId, name: "Epics" });
    const tasks = B.create(c.admin, { workspaceId: c.workspaceId, name: "Taken" });
    makeAutomation(c, { trigger: { type: "status_changes_to", config: { columnId: c.statusId, labelId: c.doneLabel } }, steps: [{ type: "action", block: "create_epic_with_tasks", config: { epicBoardId: epics.id, epicName: "Epic {item}", taskBoardId: tasks.id, tasks: ["Kickoff", "Backlog"] } }] });
    const it1 = newItem(c, "Fase 1");
    items.changeColumnValue(c.admin, it1.id, "status", "Done");
    await settle();
    expect(items.list(c.admin, { boardId: epics.id }).map((i) => i.name)).toEqual(["Epic Fase 1"]);
    expect(items.list(c.admin, { boardId: tasks.id }).map((i) => i.name)).toEqual(["Kickoff", "Backlog"]);
  });
});

describe("retries", () => {
  it("a failing action is retried after the backoff and ends failed after the last attempt", async () => {
    const { setWebhookFetch } = await import("../../src/server/services/webhooks");
    const { resumeDueRuns } = await import("../../src/server/automations/engine");
    let calls = 0;
    setWebhookFetch(async () => { calls++; return { status: calls < 3 ? 500 : 200, text: async () => "x" }; });
    try {
      const a = makeAutomation(c, { trigger: { type: "item_created", config: {} }, steps: [{ type: "action", block: "webhook_post", config: { url: "http://127.0.0.1:9/hook" } }] });
      newItem(c);
      await settle();
      let run = runsOf(a.id)[0];
      expect(run.status).toBe("retrying");
      expect(run.attempt).toBe(2);
      await resumeDueRuns(new Date(Date.now() + 2 * 60_000));
      run = runsOf(a.id)[0];
      expect(run.status).toBe("retrying");
      expect(run.attempt).toBe(3);
      await resumeDueRuns(new Date(Date.now() + 10 * 60_000));
      run = runsOf(a.id)[0];
      expect(run.status).toBe("success");
      expect(calls).toBe(3);

      setWebhookFetch(async () => ({ status: 500, text: async () => "no" }));
      const b = makeAutomation(c, { trigger: { type: "item_created", config: {} }, steps: [{ type: "action", block: "webhook_post", config: { url: "http://127.0.0.1:9/hook" } }] });
      newItem(c);
      await settle();
      await resumeDueRuns(new Date(Date.now() + 2 * 60_000));
      await resumeDueRuns(new Date(Date.now() + 10 * 60_000));
      const failed = runsOf(b.id)[0];
      expect(failed.status).toBe("failed");
      expect(failed.error).toMatch(/500/);
    } finally { setWebhookFetch(null); }
  });
});
