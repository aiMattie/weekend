import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { assets, columns, items, updates, users } from "../../src/db/schema/core";
import { sprints } from "../../src/db/schema/sprints";
import { externalRefs } from "../../src/db/schema/import-jobs";
import * as itemsSvc from "../../src/server/services/items";
import * as templates from "../../src/server/services/templates";
import * as jira from "../../src/server/services/jira-migration";
import { JiraClient } from "../../src/server/services/migration/jira-client";
import { adfToHtml } from "../../src/server/services/migration/adf";
import { aggregateWorklogs, discoverFields, mapPriority, mapStatus, mapType, monthPeriod, periodOfSprint, sprintPeriod, worklogsCsv } from "../../src/server/services/migration/jira-map";
import { fixtureSource } from "../../scripts/fixtures/jira/fixture-source";
import { freshCtx, type Ctx } from "../helpers";

const NOW = new Date("2026-10-06T12:00:00Z");
let ctx: Ctx;
let tmp: string;
beforeEach(async () => { ctx = await freshCtx(); tmp = mkdtempSync(path.join(os.tmpdir(), "jira-test-")); process.env.FILES_DIR = path.join(tmp, "files"); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); delete process.env.FILES_DIR; });

describe("mapping rules (plan section 7)", () => {
  it("statuses: To Do/In Progress/Done -> Ready/In progress/Done, Waiting on/Awaiting -> Wacht op klant", () => {
    expect(mapStatus("To Do", "new")).toBe("Ready");
    expect(mapStatus("In Progress", "indeterminate")).toBe("In progress");
    expect(mapStatus("Done", "done")).toBe("Done");
    expect(mapStatus("Waiting on customer", "indeterminate")).toBe("Wacht op klant");
    expect(mapStatus("Awaiting feedback", "indeterminate")).toBe("Wacht op klant");
    expect(mapStatus("In Review", "indeterminate")).toBe("Review");
    expect(mapStatus("Blocked", "indeterminate")).toBe("Blocked");
    expect(mapStatus("Backlog", "new")).toBe("Backlog");
  });
  it("priority -> P1-P4 and type -> Feature/Chore/Bug", () => {
    expect([mapPriority("Highest"), mapPriority("High"), mapPriority("Medium"), mapPriority("Low"), mapPriority("Lowest"), mapPriority(null)]).toEqual(["P1", "P2", "P3", "P4", "P4", "P3"]);
    expect([mapType("Story"), mapType("Task"), mapType("Bug"), mapType("Spike")]).toEqual(["Feature", "Chore", "Bug", "Onderzoek"]);
  });
  it("discovers custom fields and converts ADF", () => {
    expect(discoverFields([{ id: "customfield_1", name: "Sprint", schema: { custom: "com.pyxis.greenhopper.jira:gh-sprint" } }, { id: "customfield_2", name: "Story point estimate" }])).toEqual({ sprint: "customfield_1", epicLink: undefined, storyPoints: "customfield_2" });
    const html = adfToHtml({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a<b", marks: [{ type: "strong" }] }] }, { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] }] }] });
    expect(html).toBe("<p><strong>a&lt;b</strong></p><ul><li>x</li></ul>");
  });
});

describe("worklog aggregation", () => {
  const mk = (issueKey: string, who: string, day: string, h: number) => ({ id: day + who + issueKey, issueKey, projectKey: issueKey.split("-")[0], author: { accountId: who, displayName: who.toUpperCase() }, started: `${day}T09:00:00.000+0200`, timeSpentSeconds: h * 3600 });
  const ctxFns = { projectName: (k: string) => `P-${k}`, faseOf: (k: string) => (k === "A-1" ? "Fase 1" : ""), isNonBillable: (k: string) => k === "N-1", isMeerwerk: (k: string) => k === "A-9" };
  it("sums per klant + fase + person + month within the period only", () => {
    const logs = [mk("A-1", "x", "2026-10-01", 1.5), mk("A-1", "x", "2026-10-20", 2.25), mk("A-1", "y", "2026-10-02", 1), mk("A-1", "x", "2026-09-30", 8), mk("A-2", "x", "2026-10-03", 1), mk("N-1", "x", "2026-10-03", 2), mk("A-9", "x", "2026-10-04", 3)];
    const rows = aggregateWorklogs(logs, { from: "2026-10-01", to: "2026-10-31" }, ctxFns);
    const find = (klant: string, fase: string, acc: string, extra: Partial<{ billable: boolean; meerwerk: boolean }> = {}) => rows.find((r) => r.klant === klant && r.fase === fase && r.accountId === acc && r.billable === (extra.billable ?? true) && r.meerwerk === (extra.meerwerk ?? false));
    expect(find("P-A", "Fase 1", "x")?.hours).toBe(3.75);
    expect(find("P-A", "Fase 1", "x")?.entries).toBe(2);
    expect(find("P-A", "Fase 1", "y")?.hours).toBe(1);
    expect(find("P-A", "", "x")?.hours).toBe(1);
    expect(find("P-N", "", "x", { billable: false })?.hours).toBe(2);
    expect(find("P-A", "", "x", { meerwerk: true })?.hours).toBe(3);
    expect(rows.reduce((a, r) => a + r.hours, 0)).toBe(10.75); // the 8h of 30 September is outside the period
  });
  it("month period and CSV archive of all raw worklogs", () => {
    expect(monthPeriod("2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28", label: "2026-02" });
    const csv = worklogsCsv([mk("A-1", "x", "2026-09-30", 8), { ...mk("A-1", "y", "2026-10-01", 1), comment: 'say "hi", ok' }]);
    expect(csv.split("\n")[0]).toBe("project,issue,author,author_account_id,started,hours,seconds,comment");
    expect(csv).toContain('"say ""hi"", ok"');
    expect(csv.trim().split("\n")).toHaveLength(3);
  });
});

describe("read-only guarantees and env handling", () => {
  it("refuses to run live without JIRA_* (checks presence only)", async () => {
    const saved = { b: process.env.JIRA_BASE_URL, e: process.env.JIRA_EMAIL, t: process.env.JIRA_API_TOKEN };
    delete process.env.JIRA_BASE_URL; delete process.env.JIRA_EMAIL; delete process.env.JIRA_API_TOKEN;
    try {
      expect(jira.jiraEnvPresent()).toBe(false);
      await expect(jira.runJiraMigration(ctx.admin, { apply: false })).rejects.toThrow(/refuses to run/);
    } finally {
      if (saved.b) process.env.JIRA_BASE_URL = saved.b;
      if (saved.e) process.env.JIRA_EMAIL = saved.e;
      if (saved.t) process.env.JIRA_API_TOKEN = saved.t;
    }
  });
  it("client never writes to Jira and never sends credentials elsewhere", async () => {
    expect(() => new JiraClient({ baseUrl: "https://evil.example.com", email: "a", apiToken: "b" })).toThrow(/Refusing/);
    const calls: { method: string; url: string }[] = [];
    const c = new JiraClient({ baseUrl: "https://x.atlassian.net", email: "a", apiToken: "b", fetch: async (url, init) => { calls.push({ method: init?.method ?? "GET", url }); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ issues: [] }), arrayBuffer: async () => new ArrayBuffer(0) }; } });
    await c.issues({ project: "ALPHA", openOrDoneSince: "2026-07-08" });
    expect(calls.every((x) => x.method === "GET" || x.url.endsWith("/rest/api/3/search/jql"))).toBe(true);
    // @ts-expect-error private on purpose: any other POST must be refused
    await expect(c.call("POST", "/rest/api/3/issue", { x: 1 })).rejects.toThrow(/read-only/);
  });
  it("scope includes issues moved to Done without a resolution (status change date)", async () => {
    const bodies: { jql: string; fields: string[] }[] = [];
    const c = new JiraClient({ baseUrl: "https://x.atlassian.net", email: "a", apiToken: "b", fetch: async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ issues: [] }), arrayBuffer: async () => new ArrayBuffer(0) }; } });
    await c.issues({ project: "ALPHA", openOrDoneSince: "2026-07-08" });
    expect(bodies[0].jql).toContain(`(resolution IS EMPTY AND statusCategoryChangedDate >= "2026-07-08")`);
    expect(bodies[0].fields).toContain("statuscategorychangedate");
  });
  it("asks for the sprint/story point fields by id (search/jql ignores customfield_*)", async () => {
    const bodies: { fields: string[] }[] = [];
    const c = new JiraClient({ baseUrl: "https://x.atlassian.net", email: "a", apiToken: "b", fetch: async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ issues: [] }), arrayBuffer: async () => new ArrayBuffer(0) }; } });
    await c.issues({ project: "ALPHA", openOrDoneSince: "2026-07-08", fields: ["customfield_10020", "customfield_10016"] });
    expect(bodies[0].fields).toEqual(expect.arrayContaining(["summary", "customfield_10020", "customfield_10016"]));
    expect(bodies[0].fields.some((f) => f.includes("*"))).toBe(false);
  });
  it("prefers Jira's own story point field over a lookalike", () => {
    expect(discoverFields([{ id: "customfield_49", name: "Story Points" }, { id: "customfield_16", name: "Story point estimate", schema: { custom: "com.pyxis.greenhopper.jira:jsw-story-points" } }]).storyPoints).toBe("customfield_16");
  });
});

describe("team sprint cadence (monday dev)", () => {
  const c = { anchor: "2026-10-05", weeks: 4 };
  it("periods repeat every 4 weeks around the anchor", () => {
    expect(sprintPeriod("2026-10-05", c)).toEqual({ from: "2026-10-05", to: "2026-11-01", name: "Sprint 5 okt – 1 nov 2026" });
    expect(sprintPeriod("2026-11-01", c).from).toBe("2026-10-05");
    expect(sprintPeriod("2026-10-04", c)).toMatchObject({ from: "2026-09-07", to: "2026-10-04" });
    expect(sprintPeriod("2026-12-31", c)).toMatchObject({ from: "2026-12-28", to: "2027-01-24", name: "Sprint 28 dec 2026 – 24 jan 2027" });
  });
  it("Jira sprints fold into periods; open work stays in the present", () => {
    const today = "2026-10-07";
    expect(periodOfSprint({ id: 1, name: "LMS 12", state: "closed", startDate: "2026-09-14T07:00:00Z" }, c, today).from).toBe("2026-09-07");
    expect(periodOfSprint({ id: 2, name: "LMS 13", state: "active", startDate: "2026-09-21T07:00:00Z" }, c, today).from).toBe("2026-10-05");
    expect(periodOfSprint({ id: 3, name: "LMS 14", state: "future" }, c, today).from).toBe("2026-11-02");
    expect(periodOfSprint({ id: 4, name: "LMS 15", state: "future", startDate: "2026-12-01T07:00:00Z" }, c, today).from).toBe("2026-11-30");
  });
});

const setupDelivery = () => {
  const t = templates.seedAllTemplates(ctx.accountId);
  const klant = itemsSvc.create(ctx.sys, { boardId: t.delivery.boards.klanten, name: "Alpha Klant" });
  const fase = itemsSvc.create(ctx.sys, { boardId: t.delivery.boards.fases, name: "Alpha Klant - Fase 1: MVP", values: { klant: [klant.id], fasestatus: "Actief", uren_dev: 100, uren_pm: 10 } });
  return { t, klant, fase };
};
const counts = () => ({ items: db.select().from(items).all().length, updates: db.select().from(updates).all().length, refs: db.select().from(externalRefs).all().length, sprints: db.select().from(sprints).all().length, assets: db.select().from(assets).all().length });
const colId = (boardId: string, key: string, scope: "item" | "subitem" = "item") => db.select().from(columns).where(and(eq(columns.boardId, boardId), eq(columns.key, key), eq(columns.scope, scope))).get()!.id;

describe("Jira migration (fixtures)", () => {
  it("dry-run reports what would happen and writes nothing", async () => {
    setupDelivery();
    const before = counts();
    const rep = await jira.runJiraMigration(ctx.admin, { apply: false }, { source: fixtureSource(), now: NOW });
    expect(counts()).toEqual(before);
    expect(rep.mode).toBe("dry_run");
    // active projects only (OLD is inactive), old done issue excluded
    expect(rep.projects.map((p) => p.key).sort()).toEqual(["ALPHA", "BETA", "INT"]);
    const alpha = rep.projects.find((p) => p.key === "ALPHA")!;
    expect(alpha).toMatchObject({ issues: 7, epics: 1, subtasks: 1, tasks: 5 });
    expect(rep.counts.issue.create).toBe(11);
    expect(rep.distribution.status).toMatchObject({ Ready: 3, "In progress": 1, Done: 1, "Wacht op klant": 2, Review: 1 });
    expect(rep.distribution.type).toMatchObject({ Feature: 2, Bug: 1 });
    expect(rep.sprints).toMatchObject({ total: 3, byState: { closed: 1, active: 1, future: 1 } });
    expect(rep.hours).toMatchObject({ period: "2026-10", rows: 6, totalHours: 20.5, billableHours: 18.5, nonBillableHours: 2, meerwerkHours: 6, worklogsTotal: 9 });
    expect(rep.verification).toBeNull();
    expect(rep.diff.some((l) => l.includes("task ALPHA-2"))).toBe(true);
  });

  it("dry-run works even before the templates exist", async () => {
    const rep = await jira.runJiraMigration(ctx.admin, { apply: false }, { source: fixtureSource(), now: NOW });
    expect(rep.warnings.some((w) => /Templates/.test(w))).toBe(true);
    expect(rep.counts.issue.create).toBe(11);
    expect(db.select().from(items).all().filter((i) => i.name === "Login scherm")).toHaveLength(0);
  });

  it("apply migrates issues with the mapping, then verifies counts and a sample", async () => {
    const { t, fase, klant } = setupDelivery();
    const archiveDir = path.join(tmp, "archive");
    const src = fixtureSource();
    const rep = await jira.runJiraMigration(ctx.admin, { apply: true, archiveDir, sample: 10, seed: 1 }, { source: src, now: NOW });
    const taken = t.development!.boards.taken, epics = t.development!.boards.epics;
    const byKey = (key: string) => db.select().from(externalRefs).where(and(eq(externalRefs.source, "jira"), eq(externalRefs.externalId, key))).get()!;
    const row = (key: string) => db.select().from(items).where(eq(items.id, byKey(key).entityId)).get()!;
    const v = (key: string, board: string, col: string, scope: "item" | "subitem" = "item") => row(key).values[colId(board, col, scope)] as Record<string, unknown> | string | number | undefined;

    const story = row("ALPHA-2");
    expect(story.boardId).toBe(taken);
    expect(story.name).toBe("Login scherm");
    expect(v("ALPHA-2", taken, "jira_key")).toBe("ALPHA-2");
    expect(v("ALPHA-2", taken, "schatting")).toBe(5);
    expect(story.createdAt).toBe("2026-08-20T09:00:00.000+0200");
    // status/type/priority labels
    const labelOf = (key: string, col: string) => { const c = db.select().from(columns).where(eq(columns.id, colId(taken, col))).get()!; const val = v(key, taken, col) as { index?: number; ids?: number[] }; const labels = c.settings.labels as { id: number; text: string }[]; return labels.find((l) => l.id === (val.index ?? val.ids?.[0]))?.text; };
    expect(labelOf("ALPHA-2", "status")).toBe("Ready");
    expect(labelOf("ALPHA-2", "type")).toBe("Feature");
    expect(labelOf("ALPHA-2", "prioriteit")).toBe("P2");
    expect(labelOf("ALPHA-2", "klant")).toBe("Alpha Klant");
    expect(labelOf("ALPHA-3", "type")).toBe("Bug");
    expect(labelOf("ALPHA-3", "prioriteit")).toBe("P1");
    expect(v("ALPHA-3", taken, "schatting")).toBe(2);
    expect(labelOf("ALPHA-6", "status")).toBe("Wacht op klant");
    expect(labelOf("BETA-2", "status")).toBe("Wacht op klant");
    // epic link + epic on Epics board linked to the fase of the klant
    const epic = row("ALPHA-1");
    expect(epic.boardId).toBe(epics);
    expect(v("ALPHA-2", taken, "epic")).toMatchObject({ linkedPulseIds: [{ linkedPulseId: epic.id }] });
    expect(epic.values[colId(epics, "fase")]).toMatchObject({ linkedPulseIds: [{ linkedPulseId: fase.id }] });
    expect(row("ALPHA-8").values[colId(taken, "epic")]).toMatchObject({ linkedPulseIds: [{ linkedPulseId: epic.id }] }); // legacy Epic Link field
    // subtask
    const sub = row("ALPHA-5");
    expect(sub.parentItemId).toBe(story.id);
    // out-of-scope issues absent
    expect(db.select().from(externalRefs).where(eq(externalRefs.externalId, "ALPHA-7")).all()).toHaveLength(0);
    expect(db.select().from(externalRefs).where(eq(externalRefs.externalId, "OLD-1")).all()).toHaveLength(0);
    // owner mapping: by email, by first name; unknown user reported
    expect(v("ALPHA-2", taken, "eigenaar")).toMatchObject({ personsAndTeams: [{ id: ctx.userIds.dev1 }] });
    expect(v("ALPHA-3", taken, "eigenaar")).toMatchObject({ personsAndTeams: [{ id: ctx.userIds.dev2 }] });
    expect(rep.unmappedUsers).toContain("Unknown Person");
    // description + comments -> updates; attachment -> asset + file column + bytes
    const ups = db.select().from(updates).where(eq(updates.itemId, story.id)).all();
    expect(ups).toHaveLength(3);
    expect(ups.map((u) => u.bodyText).join(" ")).toContain("Graag ook SSO meenemen");
    expect(ups.find((u) => u.bodyText.includes("Akkoord"))?.body).toContain("Jira, Unknown Person");
    const a = db.select().from(assets).where(eq(assets.itemId, story.id)).all();
    expect(a).toHaveLength(1);
    expect(a[0].path).toMatch(/spec\.pdf$/);
    expect(existsSync(path.join(process.env.FILES_DIR!, a[0].path))).toBe(true);
    expect(v("ALPHA-2", taken, "files")).toMatchObject({ files: [{ assetId: a[0].id }] });
    expect(rep.files).toMatchObject({ downloaded: 1, failed: 0 });
    // sprints: closed -> completed, active -> active, future stays planned; tasks assigned
    const sp = db.select().from(sprints).all();
    expect(sp.map((s) => `${s.name}:${s.state}`).sort()).toEqual(["Sprint 1:completed", "Sprint 2:active", "Sprint 3:planned"]);
    const s2 = sp.find((s) => s.name === "Sprint 2")!;
    expect(v("ALPHA-2", taken, "sprint")).toMatchObject({ sprintId: s2.id });
    expect(v("ALPHA-3", taken, "sprint")).toMatchObject({ sprintId: s2.id });
    expect(v("ALPHA-4", taken, "sprint")).toMatchObject({ sprintId: sp.find((s) => s.name === "Sprint 1")!.id });
    // hours: Urenregistratie rows aggregated per klant+fase+person+month and rolled up on the fase
    const uren = db.select().from(items).where(eq(items.boardId, t.delivery.boards.uren)).all();
    expect(uren).toHaveLength(6);
    const builderRow = uren.find((u) => u.name === "Alpha Klant · Alpha Klant - Fase 1: MVP · Builder Developer · 2026-10")!;
    expect(builderRow.values[colId(t.delivery.boards.uren, "uren_dev")]).toBe(6);
    expect(builderRow.values[colId(t.delivery.boards.uren, "datum")]).toEqual({ date: "2026-10-02" });
    expect(builderRow.values[colId(t.delivery.boards.uren, "factuurperiode")]).toBe("2026-10");
    const coordinator = uren.find((u) => u.name.includes("Coordinator Pm"))!;
    expect(coordinator.values[colId(t.delivery.boards.uren, "uren_pm")]).toBe(1);
    expect(uren.find((u) => u.name.includes("non-billable"))!.values[colId(t.delivery.boards.uren, "nonbillable_uren")]).toBe(2);
    expect(uren.find((u) => u.name.includes("meerwerk"))!.values[colId(t.delivery.boards.uren, "meerwerk_uren")]).toBe(6);
    const faseRead = itemsSvc.get(ctx.sys, fase.id);
    expect((faseRead.values[colId(t.delivery.boards.fases, "uren_dev_besteed")] as { result: number }).result).toBe(10);
    expect((faseRead.values[colId(t.delivery.boards.fases, "uren_pm_besteed")] as { result: number }).result).toBe(1);
    expect(itemsSvc.get(ctx.sys, klant.id).values[colId(t.delivery.boards.klanten, "uren_dev_totaal")]).toMatchObject({ result: 11.5 }); // incl. 1.5h of an epic-less task without fase
    // CSV archive has every raw worklog (also September)
    expect(rep.hours!.archiveFile).toBeTruthy();
    const csv = readFileSync(rep.hours!.archiveFile!, "utf8").trim().split("\n");
    expect(csv).toHaveLength(1 + 9);
    // verification: counts per project + sample of 10 tasks
    expect(rep.verification!.perProject.every((p) => p.ok)).toBe(true);
    expect(rep.verification!.sample.length).toBe(Math.min(10, 8));
    expect(rep.verification!.sample.flatMap((s) => s.diffs)).toEqual([]);
    expect(rep.verification!.ok).toBe(true);
  });

  it("is idempotent on the Jira key and updates changed issues", async () => {
    setupDelivery();
    await jira.runJiraMigration(ctx.admin, { apply: true, archiveDir: path.join(tmp, "a") }, { source: fixtureSource(), now: NOW });
    const first = counts();
    const rep2 = await jira.runJiraMigration(ctx.admin, { apply: true, archiveDir: path.join(tmp, "a") }, { source: fixtureSource(), now: NOW });
    expect(counts()).toEqual(first);
    for (const [type, c] of Object.entries(rep2.counts)) expect({ type, create: c.create }).toEqual({ type, create: 0 });
    expect(rep2.counts.issue.update).toBe(0);
    // change an issue in Jira (summary + status) and re-run: update, no duplicate
    const raw = JSON.parse(readFileSync(path.join(__dirname, "../../scripts/fixtures/jira/issues.json"), "utf8")) as Record<string, { key: string; fields: { summary: string; status: { name: string; statusCategory: { key: string } }; updated: string } }[]>;
    const t = raw.ALPHA.find((i) => i.key === "ALPHA-6")!;
    t.fields.summary = "API-sleutel ontvangen"; t.fields.status = { name: "Done", statusCategory: { key: "done" } }; t.fields.updated = "2026-10-05T10:00:00.000+0200";
    (t.fields as unknown as { resolutiondate: string }).resolutiondate = "2026-10-05T10:00:00.000+0200";
    const rep3 = await jira.runJiraMigration(ctx.admin, { apply: true, archiveDir: path.join(tmp, "a") }, { source: fixtureSource({ issues: raw as never }), now: NOW });
    expect(rep3.counts.issue).toMatchObject({ create: 0, update: 1 });
    expect(counts().items).toBe(first.items);
    expect(db.select().from(items).where(eq(items.name, "API-sleutel ontvangen")).all()).toHaveLength(1);
  });

  it("with a cadence, Jira sprints become one team sprint per period and roll over on the next sync", async () => {
    const { t } = setupDelivery();
    const taken = t.development!.boards.taken;
    const sprintCadence = { anchor: "2026-10-05", weeks: 4 };
    const rep = await jira.runJiraMigration(ctx.admin, { apply: true, archiveDir: path.join(tmp, "a"), sprintCadence, seed: 1 }, { source: fixtureSource(), now: NOW });
    const list = () => db.select().from(sprints).all().map((s) => `${s.name}:${s.state}`).sort();
    expect(list()).toEqual(["Sprint 2 nov – 29 nov 2026:planned", "Sprint 5 okt – 1 nov 2026:active", "Sprint 7 sep – 4 okt 2026:completed"]);
    const byName = (n: string) => db.select().from(sprints).all().find((s) => s.name === n)!;
    const cur = byName("Sprint 5 okt – 1 nov 2026");
    expect(cur.goal).toBe("Jira: Sprint 2");
    const sprintOf = (key: string) => { const ref = db.select().from(externalRefs).where(and(eq(externalRefs.source, "jira"), eq(externalRefs.externalId, key))).get()!; return (db.select().from(items).where(eq(items.id, ref.entityId)).get()!.values[colId(taken, "sprint")] as { sprintId?: string } | undefined)?.sprintId; };
    expect(sprintOf("ALPHA-2")).toBe(cur.id);
    expect(sprintOf("ALPHA-4")).toBe(byName("Sprint 7 sep – 4 okt 2026").id);
    expect(rep.verification!.sample.flatMap((x) => x.diffs).filter((d) => d.startsWith("sprint"))).toEqual([]);

    // same day again: nothing changes
    const again = await jira.runJiraMigration(ctx.admin, { apply: true, archiveDir: path.join(tmp, "a"), sprintCadence }, { source: fixtureSource(), now: NOW });
    expect(again.counts["sprint-period"]).toMatchObject({ create: 0, update: 0 });

    // four weeks later the nightly sync closes the old team sprint and starts the next one
    await jira.runJiraMigration(ctx.admin, { apply: true, archiveDir: path.join(tmp, "a"), sprintCadence }, { source: fixtureSource(), now: new Date("2026-11-03T02:00:00Z") });
    expect(list()).toEqual(["Sprint 2 nov – 29 nov 2026:active", "Sprint 30 nov – 27 dec 2026:planned", "Sprint 5 okt – 1 nov 2026:completed", "Sprint 7 sep – 4 okt 2026:completed"]);
    expect(db.select().from(sprints).all().filter((s) => s.state === "active")).toHaveLength(1);
  });

  it("a Jira user who gets an account later becomes the author of their old comments", async () => {
    setupDelivery();
    await jira.runJiraMigration(ctx.admin, { apply: true, archiveDir: path.join(tmp, "a") }, { source: fixtureSource(), now: NOW });
    const comment = () => db.select().from(updates).all().find((u) => u.bodyText.includes("Akkoord"))!;
    expect(comment()).toMatchObject({ userId: null });
    const u = db.insert(users).values({ accountId: ctx.accountId, name: "Unknown Person", email: "unknown@example.com", isActive: false }).returning().get();
    const rep = await jira.runJiraMigration(ctx.admin, { apply: true, archiveDir: path.join(tmp, "a") }, { source: fixtureSource(), now: NOW });
    expect(rep.unmappedUsers).not.toContain("Unknown Person");
    expect(comment().userId).toBe(u.id);
    expect(comment().body).not.toContain("Jira, Unknown Person");
  });

  it("--projects and --since limit the scope", async () => {
    setupDelivery();
    const only = await jira.runJiraMigration(ctx.admin, { apply: false, projects: ["beta"] }, { source: fixtureSource(), now: NOW });
    expect(only.projects.map((p) => p.key)).toEqual(["BETA"]);
    expect(only.counts.issue.create).toBe(3);
    const since = await jira.runJiraMigration(ctx.admin, { apply: false, projects: ["ALPHA"], since: "2026-10-01" }, { source: fixtureSource(), now: NOW });
    expect(since.projects[0].issues).toBe(6); // ALPHA-4 (updated 26 Sep) drops out, ALPHA-7 is out of scope anyway
  });

  it("job history records the run", async () => {
    setupDelivery();
    const job = await jira.runJiraJob(ctx.admin, { apply: false }, { source: fixtureSource(), now: NOW });
    expect(job.status).toBe("done");
    expect(job.kind).toBe("jira");
    expect(jira.listJiraJobs(ctx.admin)).toHaveLength(1);
    expect(() => jira.listJiraJobs(ctx.member)).toThrow();
  });
});
