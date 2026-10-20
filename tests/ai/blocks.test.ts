import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLlmClient } from "../../src/server/ai/llm";
import * as aiBlocks from "../../src/server/services/ai-blocks";
import * as ai from "../../src/server/services/ai";
import * as columns from "../../src/server/services/columns";
import * as items from "../../src/server/services/items";
import { listBlocks } from "../../src/server/automations/blocks/registry";
import { autoCtx, makeAutomation, runsOf, settle, type AutoCtx } from "../automations/setup";
import { ScriptedLlm } from "./mock-llm";

let c: AutoCtx;
let cols: { klacht: string; samenvatting: string; categorie: string; getal: string; datum: string; sentiment: string };
beforeEach(async () => {
  c = await autoCtx();
  const mk = (title: string, type: string, settings?: Record<string, unknown>) => columns.create(c.admin, c.boardId, { title, type, ...(settings ? { settings } : {}) }).id;
  const labels = (...t: string[]) => ({ labels: t.map((text, i) => ({ id: i, index: i, text, color: "#579bfc" })) });
  cols = {
    klacht: mk("Klacht", "long_text"), samenvatting: mk("Samenvatting", "long_text"), getal: mk("Bedrag", "numbers"), datum: mk("Deadline", "date"),
    categorie: mk("Categorie", "status", labels("Bug", "Vraag", "Feature")), sentiment: mk("Sentiment", "status", labels("Positief", "Neutraal", "Negatief")),
  };
});
afterEach(() => setLlmClient(null));

const withText = (name: string, text: string) => { const it = items.create(c.admin, { boardId: c.boardId, name }); items.changeColumnValue(c.admin, it.id, cols.klacht, { text }); return it; };

describe("AI blocks", () => {
  it("registers the six blocks in the registry", () => {
    expect(listBlocks("action").filter((b) => b.id.startsWith("ai_")).map((b) => b.id).sort()).toEqual(["ai_autofill", "ai_categorize", "ai_extract", "ai_sentiment", "ai_summarize", "ai_translate"]);
  });

  it("categorize writes a status label, validated against the options", async () => {
    const llm = new ScriptedLlm(['{"category": "Bug"}']);
    setLlmClient(llm);
    const it = withText("App crasht", "De app crasht bij het opslaan");
    const r = await aiBlocks.run(c.admin, it.id, "categorize", { sourceColumnId: cols.klacht, targetColumnId: cols.categorie });
    expect(r.value).toBe("Bug");
    expect(items.get(c.admin, it.id).values[cols.categorie]).toEqual({ index: 0 });
    expect(llm.calls[0].messages[0].content).toContain("Bug");
    // an answer outside the options is repaired once, then refused
    setLlmClient(new ScriptedLlm(['{"category": "Onzin"}', '{"category": "Nog meer onzin"}']));
    await expect(aiBlocks.run(c.admin, it.id, "categorize", { targetColumnId: cols.categorie })).rejects.toThrow(/geldige JSON/);
  });

  it("summarize, translate, sentiment, extract and autofill write the right value types", async () => {
    const it = withText("Klant mail", "Ik ben erg blij met de snelle service. Het kost 1250 euro en moet voor 2026-12-01 klaar zijn.");
    const answers: Record<string, string> = {
      summarize: '{"summary": "Blije klant, 1250 euro, deadline 1 december."}',
      translate: '{"translation": "I am very happy with the fast service."}',
      sentiment: '{"sentiment": "Positief"}',
    };
    for (const [kind, answer] of Object.entries(answers)) {
      setLlmClient(new ScriptedLlm([answer]));
      const target = kind === "sentiment" ? cols.sentiment : cols.samenvatting;
      await aiBlocks.run(c.admin, it.id, kind as "summarize", { sourceColumnId: cols.klacht, targetColumnId: target, language: "Engels" });
    }
    expect(items.get(c.admin, it.id).values[cols.sentiment]).toEqual({ index: 0 });
    expect(JSON.stringify(items.get(c.admin, it.id).values[cols.samenvatting])).toContain("very happy");
    setLlmClient(new ScriptedLlm(['{"value": 1250}']));
    await aiBlocks.run(c.admin, it.id, "extract", { sourceColumnId: cols.klacht, targetColumnId: cols.getal });
    expect(items.get(c.admin, it.id).values[cols.getal]).toBe(1250);
    setLlmClient(new ScriptedLlm(['{"value": "2026-12-01"}']));
    await aiBlocks.run(c.admin, it.id, "autofill", { targetColumnId: cols.datum, instruction: "de deadline" });
    expect(items.get(c.admin, it.id).values[cols.datum]).toMatchObject({ date: "2026-12-01" });
  });

  it("enforces the per-run cost cap", async () => {
    const llm = new ScriptedLlm(['{"summary": "x"}']);
    llm.inputTokens = 50_000; // 50 credits per call
    setLlmClient(llm);
    const it = withText("Duur", "tekst");
    // cap 1: the call itself cost more than the cap, so a repair round is refused
    llm.steps = ["geen json"];
    await expect(aiBlocks.run(c.admin, it.id, "summarize", { sourceColumnId: cols.klacht, targetColumnId: cols.samenvatting, maxCredits: 1 })).rejects.toThrow(/kostenlimiet/);
    expect(llm.calls).toHaveLength(1);
    // huge input is refused before any call
    const big = withText("Groot", "woord ".repeat(5000));
    const before = llm.calls.length;
    await expect(aiBlocks.run(c.admin, big.id, "summarize", { sourceColumnId: cols.klacht, targetColumnId: cols.samenvatting, maxCredits: 1 })).rejects.toThrow(/geschatte kosten/);
    expect(llm.calls).toHaveLength(before);
  });

  it("runs as an automation action with the system actor and logs the credits", async () => {
    setLlmClient(new ScriptedLlm(['{"category": "Vraag"}']));
    const a = makeAutomation(c, {
      trigger: { type: "item_created", config: {} },
      steps: [{ type: "action", block: "ai_categorize", config: { sourceColumnId: cols.klacht, targetColumnId: cols.categorie } }],
    });
    const it = items.create(c.admin, { boardId: c.boardId, name: "Nieuwe vraag", values: { [cols.klacht]: { text: "Hoe werkt het?" } } });
    await settle();
    const runs = runsOf(a.id);
    expect(runs[0].error).toBeNull();
    expect(runs[0].status).toBe("success");
    expect(runs[0].steps[0].output).toContain("categorize");
    expect(items.get(c.admin, it.id).values[cols.categorie]).toEqual({ index: 1 });
    // without AI the run fails with a clear message instead of writing nothing silently
    setLlmClient(null);
    items.create(c.admin, { boardId: c.boardId, name: "Nog een", values: { [cols.klacht]: { text: "Hallo" } } });
    await settle();
    expect(runsOf(a.id).some((r) => r.status === "retrying" && /AI niet geconfigureerd/.test(r.error ?? ""))).toBe(true);
  });

  it("autofill for a column stops at the batch budget and skips filled cells", async () => {
    const llm = new ScriptedLlm(['{"category": "Feature"}']);
    llm.inputTokens = 4000; // ~5 credits per call
    setLlmClient(llm);
    for (let i = 0; i < 4; i++) withText(`Idee ${i}`, "nieuwe functie gewenst");
    const r = await aiBlocks.autofillColumn(c.admin, { boardId: c.boardId, columnId: cols.categorie, kind: "categorize", sourceColumnId: cols.klacht, maxCredits: 9 });
    expect(r.filled).toBe(2);
    expect(r.stoppedForBudget).toBe(true);
    expect(r.skipped).toBe(2);
    const second = await aiBlocks.autofillColumn(c.admin, { boardId: c.boardId, columnId: cols.categorie, kind: "categorize", sourceColumnId: cols.klacht, maxCredits: 100 });
    expect(second.filled).toBe(2); // only the empty ones
    expect(ai.creditsUsed(c.admin.accountId)).toBeGreaterThan(0);
  });

  it("a viewer cannot autofill", async () => {
    setLlmClient(new ScriptedLlm(['{"category": "Bug"}']));
    const it = withText("X", "tekst");
    await expect(aiBlocks.run(c.viewer, it.id, "categorize", { targetColumnId: cols.categorie })).rejects.toThrow();
    expect(it.id).toBeTruthy();
  });
});
