import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { auditLog } from "../../src/db/schema/audit-log";
import { agentRuns } from "../../src/db/schema/ai";
import { notifications, updates, users } from "../../src/db/schema/core";
import { can } from "../../src/lib/permissions";
import { agentActor } from "../../src/server/ai/agent-runner";
import { dueKey } from "../../src/server/ai/agent-engine";
import { setLlmClient } from "../../src/server/ai/llm";
import * as agents from "../../src/server/services/agents";
import * as ai from "../../src/server/services/ai";
import * as boardsSvc from "../../src/server/services/boards";
import * as columnsSvc from "../../src/server/services/columns";
import * as itemsSvc from "../../src/server/services/items";
import * as updatesSvc from "../../src/server/services/updates";
import { freshCtx, type Ctx } from "../helpers";
import { call, ScriptedLlm, say } from "./mock-llm";

let ctx: Ctx;
let boardB: string;
let boardC: string;
beforeEach(async () => {
  ctx = await freshCtx();
  boardB = boardsSvc.create(ctx.sys, { workspaceId: ctx.workspaceId, name: "Board B" }).id;
  boardC = boardsSvc.create(ctx.sys, { workspaceId: ctx.workspaceId, name: "Board C" }).id;
});
afterEach(() => setLlmClient(null));

const mk = (extra: Record<string, unknown> = {}) => agents.create(ctx.member, { name: "Testagent", instructions: "doe iets", status: "active", ...extra });
const grant = (id: string, boardId: string, access: "read" | "write") => agents.addKnowledge(ctx.member, id, { kind: "board", refId: boardId, access });

describe("agent management", () => {
  it("creates an AI identity user, lets owners manage and links Scout", () => {
    const a = mk();
    expect(a.userId).toBeTruthy();
    expect(db.select().from(users).where(eq(users.id, a.userId!)).get()).toMatchObject({ isAiAgent: true, name: "Testagent" });
    expect(a.triggers.map((t) => t.type)).toEqual(["manual"]);
    expect(() => agents.update(ctx.admin, a.id, { name: "Hernoemd" })).not.toThrow(); // admin may
    expect(() => agents.update(ctx.viewer, a.id, { name: "x" })).toThrow();
    const other = agents.create(ctx.admin, { name: "Van admin" });
    expect(() => agents.update(ctx.member, other.id, { name: "mijn" })).toThrow(/eigenaar/);
    const agent1 = agents.identities(ctx.member).find((i) => i.name === "Scout")!;
    const linked = agents.update(ctx.member, a.id, { userId: agent1.id });
    expect(linked.userId).toBe(agent1.id);
    expect(db.select().from(users).where(eq(users.name, "Hernoemd")).get()?.isActive).toBe(false); // old own identity retired
    expect(() => agents.update(ctx.member, a.id, { userId: ctx.userIds.dev1 })).toThrow(/AI-gebruiker/);
    agents.remove(ctx.member, a.id);
    expect(agents.list(ctx.member).some((x) => x.id === a.id)).toBe(false);
  });

  it("never lets someone grant more than they can do themselves", () => {
    const priv = boardsSvc.create(ctx.admin, { workspaceId: ctx.workspaceId, name: "Geheim", visibility: "private" });
    const a = mk();
    expect(() => grant(a.id, priv.id, "read")).toThrow();
    expect(grant(a.id, boardB, "write").access).toBe("write");
    expect(agents.get(ctx.member, a.id).knowledge[0].name).toBe("Board B");
  });
});

describe("permission-limited agent actor", () => {
  it("only sees and edits granted boards, never account or workspace admin actions", async () => {
    const a = mk();
    grant(a.id, ctx.boardId, "write");
    grant(a.id, boardB, "read");
    const actor = agentActor(db.select().from((await import("../../src/db/schema/ai")).agents).where(eq((await import("../../src/db/schema/ai")).agents.id, a.id)).get()!);
    expect(actor.source).toBe("agent");
    expect(can(actor, "board:view", { boardId: ctx.boardId })).toBe(true);
    expect(can(actor, "board:edit_items", { boardId: ctx.boardId })).toBe(true);
    expect(can(actor, "board:view", { boardId: boardB })).toBe(true);
    expect(can(actor, "board:edit_items", { boardId: boardB })).toBe(false);
    expect(can(actor, "board:comment", { boardId: boardB })).toBe(false);
    expect(can(actor, "board:view", { boardId: boardC })).toBe(false);
    expect(can(actor, "board:edit_structure", { boardId: ctx.boardId })).toBe(false);
    expect(can(actor, "board:delete", { boardId: ctx.boardId })).toBe(false);
    expect(can(actor, "account:manage")).toBe(false);
    expect(can(actor, "workspace:create_board", { workspaceId: ctx.workspaceId })).toBe(false);
    expect(boardsSvc.list(actor).map((b) => b.id).sort()).toEqual([ctx.boardId, boardB].sort());
    expect(() => itemsSvc.create(actor, { boardId: boardB, name: "nee" })).toThrow();
    expect(() => itemsSvc.create(actor, { boardId: boardC, name: "nee" })).toThrow();
    expect(itemsSvc.create(actor, { boardId: ctx.boardId, name: "ja" }).creatorId).toBe(a.userId);
  });

  it("an agent run reports denied tool calls and writes only where allowed", async () => {
    const a = mk();
    grant(a.id, ctx.boardId, "write");
    grant(a.id, boardB, "read");
    const llm = new ScriptedLlm([
      [call("create_item", { boardId: ctx.boardId, name: "Door agent" }), call("create_item", { boardId: boardB, name: "Mag niet (read)" }), call("get_board", { boardId: boardC })],
      [say("Klaar: 1 item gemaakt, 2 acties geweigerd.")],
    ]);
    setLlmClient(llm);
    const run = await agents.run(ctx.member, a.id, { input: "maak items" });
    expect(run.status).toBe("success");
    expect(run.toolCalls.map((t) => [t.name, !!t.error])).toEqual([["create_item", false], ["create_item", true], ["get_board", true]]);
    expect(run.toolCalls[1].output).toContain("Niet toegestaan");
    expect(itemsSvc.list(ctx.sys, { boardId: ctx.boardId }).map((i) => i.name)).toContain("Door agent");
    expect(itemsSvc.list(ctx.sys, { boardId: boardB })).toHaveLength(0);
    expect(run.credits).toBeGreaterThan(0);
    expect(run.transcript.length).toBeGreaterThan(2);
    // the user input reached the model as delimited data, and tool results as data
    expect(JSON.stringify(llm.calls[0].messages)).toContain("<invoer>maak items</invoer>");
    expect(JSON.stringify(llm.calls[1].messages)).toContain("tool_data");
  });

  it("skill allow-lists remove write tools the agent was not given", async () => {
    const a = mk();
    grant(a.id, ctx.boardId, "write");
    agents.addSkill(ctx.member, a.id, { name: "Alleen lezen", instruction: "lees", tools: ["get_board"] });
    expect(() => agents.addSkill(ctx.member, a.id, { name: "x", tools: ["bestaat_niet"] })).toThrow(/Onbekende tools/);
    const llm = new ScriptedLlm([[call("create_item", { boardId: ctx.boardId, name: "Verboden" })], [say("ok")]]);
    setLlmClient(llm);
    const run = await agents.run(ctx.member, a.id);
    expect(run.toolCalls[0].error).toBe(true);
    expect(run.toolCalls[0].output).toContain("niet beschikbaar");
    expect(llm.calls[0].tools!.map((t) => t.name)).not.toContain("create_item");
    expect(itemsSvc.list(ctx.sys, { boardId: ctx.boardId })).toHaveLength(0);
  });
});

describe("triggers", () => {
  it("item_created runs the agent, which writes as its own identity", async () => {
    const a = mk();
    grant(a.id, ctx.boardId, "write");
    agents.addTrigger(ctx.member, a.id, { type: "item_created", config: { boardId: ctx.boardId } });
    setLlmClient(new ScriptedLlm((req, n) => (n === 0 ? [call("create_update", { itemId: /item (\d+)/.exec(JSON.stringify(req.messages))![1], text: "Score: 80/100" })] : [say("gescoord")])));
    const it = itemsSvc.create(ctx.member, { boardId: ctx.boardId, name: "Nieuwe lead" });
    await agents.drainAgents();
    const runs = db.select().from(agentRuns).where(eq(agentRuns.agentId, a.id)).all();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "success", triggerType: "item_created" });
    const up = db.select().from(updates).where(eq(updates.itemId, it.id)).all();
    expect(up).toHaveLength(1);
    expect(up[0].userId).toBe(a.userId);
    // other boards, and subitems, do not trigger it
    itemsSvc.create(ctx.member, { boardId: boardB, name: "Elders" });
    itemsSvc.create(ctx.member, { boardId: ctx.boardId, name: "Sub", parentItemId: it.id });
    await agents.drainAgents();
    expect(db.select().from(agentRuns).where(eq(agentRuns.agentId, a.id)).all()).toHaveLength(1);
    // paused agents do not run
    agents.update(ctx.member, a.id, { status: "paused" });
    itemsSvc.create(ctx.member, { boardId: ctx.boardId, name: "Nog een" });
    await agents.drainAgents();
    expect(db.select().from(agentRuns).where(eq(agentRuns.agentId, a.id)).all()).toHaveLength(1);
  });

  it("column_changed matches the label, mention matches the agent identity", async () => {
    const a = mk();
    grant(a.id, ctx.boardId, "write");
    agents.addTrigger(ctx.member, a.id, { type: "column_changed", config: { boardId: ctx.boardId, labelText: "Stuck" } });
    agents.addTrigger(ctx.member, a.id, { type: "mention", config: {} });
    setLlmClient(new ScriptedLlm(["ok"]));
    const it = itemsSvc.create(ctx.member, { boardId: ctx.boardId, name: "Taak" });
    itemsSvc.changeColumnValue(ctx.member, it.id, "status", "Working on it");
    await agents.drainAgents();
    expect(db.select().from(agentRuns).all()).toHaveLength(0);
    itemsSvc.changeColumnValue(ctx.member, it.id, "status", "Stuck");
    await agents.drainAgents();
    expect(db.select().from(agentRuns).all().map((r) => r.triggerType)).toEqual(["column_changed"]);
    updatesSvc.create(ctx.member, { itemId: it.id, body: `<p><span data-type="mention" data-id="${a.userId}">@Testagent</span> vat samen</p>` });
    await agents.drainAgents();
    expect(db.select().from(agentRuns).all().map((r) => r.triggerType).sort()).toEqual(["column_changed", "mention"]);
  });

  it("schedule triggers fire once per day on the right weekday, and not retroactively when created", async () => {
    const a = mk();
    const t = agents.addTrigger(ctx.member, a.id, { type: "schedule", config: { every: "weekday", time: "07:30" } });
    const mondayLate = new Date("2026-10-05T10:00:00Z"); // Monday 12:00 Amsterdam
    expect(dueKey(t.config, new Date("2026-10-05T04:00:00Z"))).toBeNull(); // 06:00 local: too early
    expect(dueKey(t.config, mondayLate)).toBe("2026-10-05T07:30");
    expect(dueKey(t.config, new Date("2026-10-10T10:00:00Z"))).toBeNull(); // saturday
    expect(dueKey({ every: "week", weekday: 5, time: "16:00" }, new Date("2026-10-09T15:00:00Z"))).toBe("2026-10-09T16:00");
    const eng = await import("../../src/server/ai/agent-engine");
    setLlmClient(new ScriptedLlm(["ok"]));
    db.update((await import("../../src/db/schema/ai")).agentTriggers).set({ lastFiredKey: null }).where(eq((await import("../../src/db/schema/ai")).agentTriggers.id, t.id)).run();
    expect(await eng.tickSchedules(mondayLate)).toHaveLength(1);
    expect(await eng.tickSchedules(mondayLate)).toHaveLength(0);
    expect(await eng.tickSchedules(new Date("2026-10-06T10:00:00Z"))).toHaveLength(1);
    expect(eng.initialFiredKey(t.config, mondayLate)).toBe("2026-10-05T07:30");
  });
});

describe("loop protection and budget caps", () => {
  it("stops an agent ping-pong: an agent already in the chain is skipped", async () => {
    const a = mk({ name: "Agent A" });
    const b = mk({ name: "Agent B" });
    for (const x of [a, b]) grant(x.id, ctx.boardId, "write");
    agents.addTrigger(ctx.member, a.id, { type: "column_changed", config: { boardId: ctx.boardId, labelText: "Working on it" } });
    agents.addTrigger(ctx.member, b.id, { type: "column_changed", config: { boardId: ctx.boardId, labelText: "Stuck" } });
    const it = itemsSvc.create(ctx.member, { boardId: ctx.boardId, name: "Pingpong" });
    setLlmClient(new ScriptedLlm((req, n) => {
      const isA = String(req.system).includes('"Agent A"');
      if (n % 2 === 0) return [call("change_column_values", { itemId: it.id, values: { status: isA ? "Stuck" : "Working on it" } })];
      return [say("klaar")];
    }));
    itemsSvc.changeColumnValue(ctx.member, it.id, "status", "Working on it");
    await agents.drainAgents();
    const runs = db.select().from(agentRuns).all();
    const byAgent = (id: string) => runs.filter((r) => r.agentId === id).map((r) => r.status).sort();
    expect(byAgent(a.id)).toEqual(["skipped", "success"]);
    expect(byAgent(b.id)).toEqual(["success"]);
    expect(runs.find((r) => r.status === "skipped")!.error).toContain("Loop protection");
    // an agent never reacts to its own writes either
    expect(runs.length).toBe(3);
  });

  it("caps steps and tokens per run, and runs per hour", async () => {
    const a = mk({ maxSteps: 2 });
    grant(a.id, ctx.boardId, "read");
    setLlmClient(new ScriptedLlm([[call("list_boards", {})]])); // never stops asking for tools
    const r1 = await agents.run(ctx.member, a.id);
    expect(r1).toMatchObject({ status: "capped", steps: 2 });
    expect(r1.error).toContain("Stappenlimiet");

    const b = mk({ name: "Duur", maxTokens: 1000 });
    const llm = new ScriptedLlm([[call("list_boards", {})]]); // 1200 tokens per call
    setLlmClient(llm);
    const r2 = await agents.run(ctx.member, b.id);
    expect(r2.status).toBe("capped");
    expect(r2.error).toContain("Tokenlimiet");
    expect(llm.calls).toHaveLength(1);

    const c = mk({ name: "Snel", maxRunsPerHour: 2 });
    setLlmClient(new ScriptedLlm(["ok"]));
    await agents.run(ctx.member, c.id);
    await agents.run(ctx.member, c.id);
    const r3 = await agents.run(ctx.member, c.id);
    expect(r3.status).toBe("skipped");
    expect(r3.error).toContain("runs per uur");
  });

  it("kill switch and credit limits stop runs; the kill switch is audited", async () => {
    const a = mk();
    setLlmClient(new ScriptedLlm(["ok"]));
    ai.updateSettings(ctx.admin, { agentsEnabled: false });
    const r = await agents.run(ctx.member, a.id);
    expect(r.status).toBe("skipped");
    expect(r.error).toContain("noodstop");
    expect(db.select().from(auditLog).where(eq(auditLog.event, "ai.agents_killed")).all()).toHaveLength(1);
    ai.updateSettings(ctx.admin, { agentsEnabled: true, accountMonthlyCredits: 0 });
    const r2 = await agents.run(ctx.member, a.id);
    expect(r2.status).toBe("failed");
    expect(r2.error).toContain("credits");
    ai.updateSettings(ctx.admin, { accountMonthlyCredits: null });
    expect((await agents.run(ctx.member, a.id)).status).toBe("success");
    expect(() => ai.updateSettings(ctx.member, { agentsEnabled: false })).toThrow();
  });

  it("runs without AI configured fail with a clear message", async () => {
    const a = mk();
    const r = await agents.run(ctx.member, a.id);
    expect(r).toMatchObject({ status: "failed", error: "AI niet geconfigureerd" });
  });
});

describe("ready-made agents", () => {
  it("lists the catalogue and installs templates with triggers, skills and knowledge", () => {
    const cat = agents.catalog(ctx.member);
    expect(cat.templates.map((t) => t.key).sort()).toEqual(["daily_briefer", "hours_checker", "lead_scorer", "meeting_summarizer", "risk_analyzer", "sprint_reporter", "ticket_assignment"]);
    const lead = agents.installTemplate(ctx.member, { templateKey: "lead_scorer", boardId: ctx.boardId });
    expect(lead.status).toBe("draft");
    expect(lead.triggers.map((t) => t.type).sort()).toEqual(["item_created", "manual"]);
    expect(lead.knowledge).toMatchObject([{ kind: "board", refId: ctx.boardId, access: "write" }]);
    expect(lead.skills[0].tools).toContain("create_update");
    expect(agents.catalog(ctx.member).templates.find((t) => t.key === "lead_scorer")!.installed).toBe(1);
    expect(() => agents.installTemplate(ctx.member, { templateKey: "hours_checker" })).toThrow(/Kies een board/);
  });

  it("Daily Briefer works without AI: an inbox note with overdue and today items", async () => {
    const dev1 = ctx.userIds.dev1;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date()); // the account's time zone, not UTC
    const it = itemsSvc.create(ctx.sys, { boardId: ctx.boardId, name: "Vandaag klaar", values: { people: [dev1], date: today } });
    itemsSvc.create(ctx.sys, { boardId: ctx.boardId, name: "Te laat", values: { people: [dev1], date: "2020-01-01" } });
    expect(it.id).toBeTruthy();
    const a = agents.installTemplate(ctx.member, { templateKey: "daily_briefer", activate: true });
    const r = await agents.run(ctx.member, a.id);
    expect(r.status).toBe("success");
    // manual run only briefs the person who started it (dev1 is the member)
    const n = db.select().from(notifications).where(and(eq(notifications.userId, dev1), eq(notifications.type, "ai"))).all();
    expect(n).toHaveLength(1);
    expect(n[0].title).toContain("1 te laat, 1 vandaag");
    expect(n[0].body).toContain("Te laat");
    // the scheduled run briefs everyone with something due
    const eng = await import("../../src/server/ai/agent-engine");
    db.update((await import("../../src/db/schema/ai")).agentTriggers).set({ lastFiredKey: null }).where(eq((await import("../../src/db/schema/ai")).agentTriggers.agentId, a.id)).run();
    const runs = await eng.tickSchedules(new Date());
    expect(runs.length === 0 || runs[0].status === "success").toBe(true);
  });

  it("Hours Checker finds days without hours, empty rows and rows without a client", async () => {
    const { findHoursGaps } = await import("../../src/server/ai/agent-native");
    const names = new Map([["1", "Builder"], ["2", "Reviewer"]]);
    const rows = [
      { itemId: "a", name: "Dev", userIds: ["1"], date: "2026-10-05", hasHours: true, hasClient: true },
      { itemId: "b", name: "Leeg", userIds: ["1"], date: "2026-10-06", hasHours: false, hasClient: null },
      { itemId: "c", name: "Zonder klant", userIds: ["1"], date: "2026-10-07", hasHours: true, hasClient: false },
      { itemId: "d", name: "Alles", userIds: ["2"], date: "2026-10-05", hasHours: true, hasClient: true },
      { itemId: "e", name: "Alles", userIds: ["2"], date: "2026-10-06", hasHours: true, hasClient: true },
      { itemId: "f", name: "Alles", userIds: ["2"], date: "2026-10-07", hasHours: true, hasClient: true },
      { itemId: "g", name: "Alles", userIds: ["2"], date: "2026-10-08", hasHours: true, hasClient: true },
      { itemId: "h", name: "Alles", userIds: ["2"], date: "2026-10-09", hasHours: true, hasClient: true },
    ];
    const gaps = findHoursGaps(rows, names, "2026-10-12", 5); // Monday: window = 9, 8, 7, 6, 5 october
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ name: "Builder", missingDays: ["2026-10-08", "2026-10-09"], emptyRows: ["Leeg"], noClientRows: ["Zonder klant"] });
  });

  it("Hours Checker agent warns the person on the Urenregistratie board", async () => {
    const uren = boardsSvc.create(ctx.sys, { workspaceId: ctx.workspaceId, name: "Urenregistratie", emptyColumns: true });
    const wie = columnsSvc.create(ctx.sys, uren.id, { title: "Wie", type: "people", key: "wie" });
    const datum = columnsSvc.create(ctx.sys, uren.id, { title: "Datum", type: "date", key: "datum" });
    columnsSvc.create(ctx.sys, uren.id, { title: "Uren dev", type: "numbers", key: "uren_dev" });
    const day = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    itemsSvc.create(ctx.sys, { boardId: uren.id, name: "Regel", values: { [wie.id]: [ctx.userIds.dev1], [datum.id]: day } });
    const a = agents.installTemplate(ctx.member, { templateKey: "hours_checker", boardId: uren.id });
    const r = await agents.run(ctx.member, a.id);
    expect(r.status).toBe("success");
    expect(r.result).toContain("Builder");
    const n = db.select().from(notifications).where(and(eq(notifications.userId, ctx.userIds.dev1), eq(notifications.type, "ai"))).all();
    expect(n.length).toBe(2); // the personal warning and the summary for the agent owner (also dev1 here)
    expect(n.every((x) => x.title.includes("Urenregistratie"))).toBe(true);
  });

  it("Sprint Reporter summarises the active sprint through the dev sprint service", async () => {
    const { createDevWorkspaceTemplate } = await import("../../src/server/services/dev-template");
    const t = createDevWorkspaceTemplate(ctx.accountId, { workspaceName: "Dev demo", demo: true });
    const a = agents.installTemplate(ctx.member, { templateKey: "sprint_reporter", boardId: t.boards.sprints });
    const r = await agents.run(ctx.member, a.id);
    expect(r.status).toBe("success");
    expect(r.result).toContain("Voortgang");
    expect(r.toolCalls[0].name).toBe("get_sprint_summary");
    expect(db.select().from(notifications).where(and(eq(notifications.userId, ctx.userIds.dev1), eq(notifications.type, "ai"))).all()).toHaveLength(1);
  });
});
