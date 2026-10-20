import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { boards, columns, items, workspaces } from "../../src/db/schema/core";
import { automations } from "../../src/db/schema/automations";
import * as itemsSvc from "../../src/server/services/items";
import * as workspacesSvc from "../../src/server/services/workspaces";
import * as templates from "../../src/server/services/templates";
import { CLIENT_BOARD_NAMES } from "../../src/server/services/migration/template-client";
import { freshCtx, type Ctx } from "../helpers";

let ctx: Ctx;
beforeEach(async () => { ctx = await freshCtx(); });

const counts = () => ({ ws: db.select().from(workspaces).all().length, boards: db.select().from(boards).all().length, cols: db.select().from(columns).all().length, items: db.select().from(items).all().length, autos: db.select().from(automations).all().length });
const val = (item: { values: Record<string, unknown> }, boardId: string, key: string) => {
  const col = db.select().from(columns).where(and(eq(columns.boardId, boardId), eq(columns.key, key))).get()!;
  return item.values[col.id] as Record<string, unknown> | number | undefined;
};

describe("Delivery template", () => {
  it("creates Klanten, Projecten & Fases, Urenregistratie and the checklist; re-running changes nothing", () => {
    const d = templates.ensureDeliveryTemplate(ctx.accountId);
    expect(Object.values(d.boards)).toHaveLength(4);
    const names = db.select().from(boards).where(eq(boards.workspaceId, d.workspaceId)).all().map((b) => b.name);
    for (const n of ["Klanten", "Projecten & Fases", "Urenregistratie", "Klant overstap checklist"]) expect(names).toContain(n);
    const before = counts();
    const again = templates.ensureDeliveryTemplate(ctx.accountId);
    expect(again.boards).toEqual(d.boards);
    expect(counts()).toEqual(before);
  });

  it("adopts the seeded demo boards instead of duplicating them", async () => {
    const { seed } = await import("../../src/db/seed");
    await seed({ password: "x" }); // demoBoards default: seeds Klanten + Projecten & Fases
    const klantenBefore = db.select().from(boards).where(eq(boards.name, "Klanten")).all();
    expect(klantenBefore).toHaveLength(1);
    const d = templates.ensureDeliveryTemplate(ctx.accountId);
    expect(d.boards.klanten).toBe(klantenBefore[0].id);
    expect(db.select().from(boards).where(eq(boards.name, "Klanten")).all()).toHaveLength(1);
    expect(db.select().from(boards).where(eq(boards.name, "Projecten & Fases")).all()).toHaveLength(1);
    // seeded klanten got a checklist item each
    const checklist = db.select().from(items).where(eq(items.boardId, d.boards.checklist)).all();
    expect(checklist.map((i) => i.name)).toContain("Delta");
  });

  it("wires the boards two-way and rolls hours up per fase through mirror + formulas", () => {
    const d = templates.ensureDeliveryTemplate(ctx.accountId);
    const sys = ctx.sys;
    const klant = itemsSvc.create(sys, { boardId: d.boards.klanten, name: "Testklant" });
    const fase = itemsSvc.create(sys, { boardId: d.boards.fases, name: "Fase 1", values: { klant: [klant.id], uren_dev: 100, uren_pm: 20 } });
    // two-way: the klant item now lists the fase
    expect(val(itemsSvc.get(sys, klant.id), d.boards.klanten, "projecten_fases")).toMatchObject({ linkedPulseIds: [{ linkedPulseId: fase.id }] });
    const r1 = itemsSvc.create(sys, { boardId: d.boards.uren, name: "Dag 1", values: { klant: [klant.id], fase: [fase.id], uren_dev: 8, uren_pm: 1 } });
    itemsSvc.create(sys, { boardId: d.boards.uren, name: "Dag 2", values: { klant: [klant.id], fase: [fase.id], uren_dev: 72, uren_pm: 3 } });
    expect(val(itemsSvc.get(sys, fase.id), d.boards.fases, "urenregels")).toMatchObject({ linkedPulseIds: [{}, {}] });
    const read = (key: string) => (val(itemsSvc.get(sys, fase.id), d.boards.fases, key) as { result?: number; value?: number | string; text?: string });
    expect(read("uren_dev_besteed").result).toBe(80);
    expect(read("uren_pm_besteed").result).toBe(4);
    expect(read("uren_besteed").value).toBe(84);
    expect(read("restant_dev").value).toBe(20);
    expect(read("restant_pm").value).toBe(16);
    expect(read("budget_pct").value).toBe(70);
    expect(read("budget_waarschuwing").value).toBe("OK");
    // 80% budget warning: 10 more hours dev pushes it over
    itemsSvc.create(sys, { boardId: d.boards.uren, name: "Dag 3", values: { klant: [klant.id], fase: [fase.id], uren_dev: 12 } });
    expect(read("budget_pct").value).toBe(80);
    expect(String(read("budget_waarschuwing").value)).toMatch(/80%/);
    // klant-level roll-up
    expect((val(itemsSvc.get(sys, klant.id), d.boards.klanten, "uren_dev_totaal") as { result: number }).result).toBe(92);
    expect(val(itemsSvc.get(sys, r1.id), d.boards.uren, "uren_totaal")).toMatchObject({ value: 9 });
  });
});

describe("client workspace template", () => {
  it("creates the workspace with six boards and folders, links the klant and ticks the checklist", () => {
    const d = templates.ensureDeliveryTemplate(ctx.accountId);
    const klant = itemsSvc.create(ctx.sys, { boardId: d.boards.klanten, name: "Nieuwe Klant BV" });
    const r = templates.instantiateClientWorkspace(ctx.accountId, { klantnaam: "Nieuwe Klant BV" });
    expect(r.created).toBe(true);
    const bs = db.select().from(boards).where(eq(boards.workspaceId, r.workspaceId)).all().map((b) => b.name).sort();
    expect(bs).toEqual(Object.values(CLIENT_BOARD_NAMES).sort());
    expect(workspacesSvc.get(ctx.sys, r.workspaceId).name).toBe("Nieuwe Klant BV");
    const kick = db.select().from(columns).where(eq(columns.boardId, r.boards.kickoff)).all();
    expect(kick.find((c) => c.key === "status")!.settings.labels).toHaveLength(7);
    expect(kick.some((c) => c.type === "week")).toBe(true);
    // klant item points to the workspace; checklist step ticked
    expect(r.klantItemId).toBe(klant.id);
    expect(val(itemsSvc.get(ctx.sys, klant.id), d.boards.klanten, "klant_workspace")).toMatchObject({ url: expect.stringContaining(`/workspaces/${r.workspaceId}`) });
    const ci = db.select().from(items).where(eq(items.boardId, d.boards.checklist)).all().find((i) => i.name === "Nieuwe Klant BV")!;
    expect(val(ci, d.boards.checklist, "stap_workspace")).toEqual({ checked: true });
    expect(val(itemsSvc.get(ctx.sys, ci.id), d.boards.checklist, "voortgang")).toMatchObject({ value: 14 });
    // idempotent
    const before = counts();
    const again = templates.instantiateClientWorkspace(ctx.accountId, { klantnaam: "Nieuwe Klant BV" });
    expect(again.created).toBe(false);
    expect(again.workspaceId).toBe(r.workspaceId);
    expect(counts()).toEqual(before);
  });

  it("hook createClientWorkspaceForItem works from a Klanten item and refuses other boards", () => {
    const d = templates.ensureDeliveryTemplate(ctx.accountId);
    const klant = itemsSvc.create(ctx.sys, { boardId: d.boards.klanten, name: "Hook Klant" });
    expect(templates.createClientWorkspaceForItem(ctx.sys, klant.id).created).toBe(true);
    const other = itemsSvc.create(ctx.sys, { boardId: ctx.boardId, name: "Geen klant" });
    expect(() => templates.createClientWorkspaceForItem(ctx.sys, other.id)).toThrow();
  });

  it("auto-create hook reacts to a new item in Klanten", () => {
    const d = templates.ensureDeliveryTemplate(ctx.accountId);
    const off = templates.registerClientAutoCreate();
    itemsSvc.create(ctx.sys, { boardId: d.boards.klanten, name: "Auto Klant" });
    off();
    expect(db.select().from(workspaces).where(eq(workspaces.name, "Auto Klant")).all()).toHaveLength(1);
  });
});

describe("seedAllTemplates", () => {
  it("builds Delivery, Development, the client template and the hours recipe, idempotently", () => {
    const r = templates.seedAllTemplates(ctx.accountId);
    expect(r.development).toBeTruthy();
    const names = db.select().from(workspaces).all().map((w) => w.name);
    expect(names).toContain("Development");
    expect(names).toContain(templates.CLIENT_TEMPLATE_WORKSPACE);
    // hours link to tasks: Urenregistratie.Taak <-> Taken.Uren
    expect(db.select().from(columns).where(and(eq(columns.boardId, r.delivery.boards.uren), eq(columns.key, "taak"))).get()?.settings.boardIds).toEqual([r.development!.boards.taken]);
    expect(r.recipeId).toBe("migration.uren-nieuwe-regel");
    expect(r.hoursFormId).toBeTruthy();
    expect(db.select().from(automations).where(eq(automations.boardId, r.delivery.boards.uren)).all()).toHaveLength(1);
    const before = counts();
    templates.seedAllTemplates(ctx.accountId);
    expect(counts()).toEqual(before);
  });
});

describe("hooks for the automations module", () => {
  it("registers create_client_workspace and runs it", async () => {
    const { registerMigrationHooks } = await import("../../src/server/services/migration/register-hooks");
    const { getAutomationHook } = await import("../../src/server/automations/hooks");
    registerMigrationHooks();
    const hook = getAutomationHook("create_client_workspace")!;
    expect(hook).toBeTruthy();
    const r = await hook({ actor: ctx.sys, name: "Via Automation BV", sourceItemId: null, sourceBoardId: null });
    expect(db.select().from(workspaces).where(eq(workspaces.id, r.workspaceId)).get()?.name).toBe("Via Automation BV");
  });

  it("admin-only template action", () => {
    expect(() => templates.runTemplateAction(ctx.member, { action: "all" })).toThrow();
    expect(templates.runTemplateAction(ctx.admin, { action: "client", klantnaam: "Admin Klant" }).action).toBe("client");
    expect(() => templates.runTemplateAction(ctx.admin, { action: "client", klantnaam: "" })).toThrow();
  });
});
