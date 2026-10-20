import { beforeEach, describe, expect, it } from "vitest";
import { RECIPES, RECIPE_CATEGORIES } from "../../src/server/automations/recipes";
import { parseAutomationText } from "../../src/server/automations/nl-parser";
import * as automations from "../../src/server/services/automations";
import * as boards from "../../src/server/services/boards";
import * as columns from "../../src/server/services/columns";
import * as integrations from "../../src/server/services/integrations";
import { autoCtx, newItem, type AutoCtx } from "./setup";

let c: AutoCtx;
beforeEach(async () => { c = await autoCtx(); });

describe("recipes", () => {
  it("ships at least 40 sentence recipes in every category with unique ids", () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    for (const cat of RECIPE_CATEGORIES.slice(0, 7)) expect(RECIPES.some((r) => r.category === cat.id), cat.id).toBe(true);
    for (const r of RECIPES) {
      const tokens = [...r.sentence.en.matchAll(/\[(\w+)\]/g)].map((m) => m[1]);
      for (const t of tokens) expect(r.tokens.some((x) => x.key === t), `${r.id} token ${t}`).toBe(true);
      const nl = [...r.sentence.nl.matchAll(/\[(\w+)\]/g)].map((m) => m[1]);
      expect(nl.sort(), r.id).toEqual(tokens.sort());
    }
  });

  it("every recipe can be filled in and stored as a valid automation", async () => {
    const other = boards.create(c.admin, { workspaceId: c.workspaceId, name: "Doelboard" });
    columns.create(c.admin, c.boardId, { title: "Knop", type: "button" });
    columns.create(c.admin, c.boardId, { title: "Aantal", type: "numbers" });
    columns.create(c.admin, c.boardId, { title: "Tijd", type: "time_tracking" });
    columns.create(c.admin, c.boardId, { title: "Status 2", type: "status" });
    const slack = integrations.create(c.admin, { kind: "slack", config: { webhookUrl: "http://localhost:9/slack" } });
    const tpl = newItem(c, "Sjabloon");
    const cols = columns.list(c.admin, c.boardId);
    const colOf = (types?: string[], skip = 0) => cols.filter((x) => !types || types.includes(x.type))[skip];
    for (const r of RECIPES) {
      const v: Record<string, unknown> = {};
      for (const t of r.tokens) {
        switch (t.kind) {
          case "column": v[t.key] = (t.key === "status2" ? colOf(["status"], 1) : colOf(t.columnTypes ?? ["status"]))?.id; break;
          case "label": { const col = cols.find((x) => x.id === v[t.of!])!; const ls = col.settings.labels as { id: number; text: string }[]; v[t.key] = String(ls[0].id); break; }
          case "value": v[t.key] = "Done"; break;
          case "users": v[t.key] = [c.userIds.dev1]; break;
          case "group": v[t.key] = c.doneGroup; break;
          case "board": v[t.key] = other.id; break;
          case "integration": v[t.key] = slack.id; break;
          case "item": v[t.key] = tpl.id; break;
          case "number": v[t.key] = 2; break;
          case "time": v[t.key] = "09:30"; break;
          case "url": v[t.key] = "http://localhost:9/hook"; break;
          case "select": v[t.key] = t.options?.[0].value ?? "week"; break;
          default: v[t.key] = typeof t.default === "string" && !/^[a-z@]+$/.test(t.default) ? t.default : "tekst";
        }
        if (t.key === "taskboard") v[t.key] = other.id;
      }
      const a = automations.createFromRecipe(c.admin, { boardId: c.boardId, recipeId: r.id, values: v });
      expect(a.recipeId).toBe(r.id);
      expect(a.definition.steps.length, r.id).toBeGreaterThan(0);
    }
    expect(automations.list(c.admin, { boardId: c.boardId }).length).toBe(RECIPES.length);
  });

  it("catalog lists blocks and recipes for the UI", () => {
    const cat = automations.catalog(c.admin, { boardId: c.boardId });
    expect(cat.blocks.filter((b) => b.kind === "trigger").map((b) => b.id)).toEqual(expect.arrayContaining(["item_created", "status_changes_to", "date_arrives", "recurring", "button_clicked", "sprint_started", "sprint_completed", "subitem_completed", "person_assigned", "item_moved_to_group", "update_created", "subitem_created", "column_changed"]));
    expect(cat.blocks.filter((b) => b.kind === "action").length).toBeGreaterThanOrEqual(20);
    expect(cat.recipes.length).toBe(RECIPES.length);
  });
});

describe("natural language parser", () => {
  const ctxOf = () => {
    const cols = columns.list(c.admin, c.boardId).map((x) => ({ id: x.id, key: x.key, title: x.title, type: x.type, settings: x.settings }));
    return { columns: cols, groups: [{ id: c.todoGroup, title: "Group Title" }, { id: c.doneGroup, title: "Afgerond" }], users: [{ id: c.userIds.dev1, name: "Builder Lam", email: "dev1@example.com" }], boards: [] };
  };
  it("parses English and Dutch sentences", () => {
    const en = parseAutomationText("When status changes to Done, move item to group Afgerond", ctxOf());
    expect(en.definition?.trigger).toMatchObject({ type: "status_changes_to", config: { labelId: c.doneLabel } });
    expect(en.definition?.steps[0]).toMatchObject({ block: "move_item_to_group", config: { groupId: c.doneGroup } });
    const nl = parseAutomationText("Als de status Stuck wordt, stuur dan een melding aan Builder en zet status op Working on it", ctxOf());
    expect(nl.definition?.trigger.type).toBe("status_changes_to");
    expect(nl.definition?.steps.map((s) => (s as { block: string }).block)).toEqual(["notify", "set_status"]);
    const rec = parseAutomationText("Every monday at 08:30, notify Builder", ctxOf());
    expect(rec.definition?.trigger).toMatchObject({ type: "recurring", config: { every: "week", weekday: 1, time: "08:30" } });
    expect(parseAutomationText("blah blah", ctxOf()).definition).toBeNull();
  });
  it("createFromText stores the automation and rejects nonsense", () => {
    const a = automations.createFromText(c.admin, { boardId: c.boardId, text: "When an item is created, assign Builder Lam" });
    expect(a.definition.steps[0]).toMatchObject({ block: "assign_person" });
    expect(() => automations.createFromText(c.admin, { boardId: c.boardId, text: "do something nice" })).toThrow();
  });
});

describe("advanced recipes", () => {
  it("phase Afgerond creates an invoice task and notifies; Wacht op klant > 5 days notifies the account manager", async () => {
    const { tick } = await import("../../src/server/automations/scheduler");
    const items = await import("../../src/server/services/items");
    const { settle } = await import("./setup");
    const taken = boards.create(c.admin, { workspaceId: c.workspaceId, name: "Taken" });
    automations.createFromRecipe(c.admin, { boardId: c.boardId, recipeId: "phase-done-invoice", values: { status: c.statusId, label: c.doneLabel, board: taken.id, users: [c.userIds.dev1] } });
    const p = newItem(c, "Fase 2");
    items.changeColumnValue(c.admin, p.id, "status", "Done");
    await settle();
    expect(items.list(c.admin, { boardId: taken.id }).map((i) => i.name)).toEqual(["Factureren: Fase 2"]);

    automations.createFromRecipe(c.admin, { boardId: c.boardId, recipeId: "notify-wait-customer", values: { status: c.statusId, label: c.stuckLabel, days: 5, users: [`@col:${c.peopleId}`] } });
    const w = newItem(c, "Wacht op klant taak", { values: { people: [c.userIds.dev1] } });
    items.changeColumnValue(c.admin, w.id, "status", "Stuck");
    await settle();
    await tick(new Date(Date.now() + 6 * 86_400_000));
    expect(c.mails).toHaveLength(1);
    expect(c.mails[0].to).toEqual(["dev1@example.com"]);
    expect(c.mails[0].subject).toContain("Wacht op klant taak");
  });
});
