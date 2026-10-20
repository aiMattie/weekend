import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLlmClient } from "../../src/server/ai/llm";
import * as ai from "../../src/server/services/ai";
import * as automations from "../../src/server/services/automations";
import { autoCtx, type AutoCtx } from "../automations/setup";
import { ScriptedLlm } from "./mock-llm";

let c: AutoCtx;
beforeEach(async () => { c = await autoCtx(); });
afterEach(() => setLlmClient(null));

const plan = (c: AutoCtx) => JSON.stringify({
  name: "Klaar = afgerond",
  trigger: { type: "status_changes_to", config: { columnId: c.statusId, labelId: c.doneLabel } },
  steps: [{ block: "move_item_to_group", config: { groupId: c.doneGroup } }, { block: "notify", config: { recipients: ["@creator"], message: "{item} is klaar" } }],
  notes: [],
});
const SENTENCE = "When status changes to Done, move item to group Afgerond";

describe("natural language automations", () => {
  it("lets Claude plan it, validates against the block registry and creates it", async () => {
    const llm = new ScriptedLlm([plan(c)]);
    setLlmClient(llm);
    const p = await ai.nl.planFromText(c.admin, { boardId: c.boardId, text: "Zodra iets klaar is, naar Afgerond en laat de maker het weten" });
    expect(p.method).toBe("ai");
    expect(p.definition?.steps).toHaveLength(2);
    expect(JSON.stringify(llm.calls[0].messages)).toContain(c.doneGroup); // ids from the board context
    const a = await ai.nl.createFromText(c.admin, { boardId: c.boardId, text: "Zodra iets klaar is, naar Afgerond en laat de maker het weten" });
    expect(a.method).toBe("ai");
    expect(automations.get(c.admin, a.id).definition.trigger.type).toBe("status_changes_to");
  });

  it("repairs once, then falls back to the pattern parser", async () => {
    const bad = JSON.stringify({ name: "x", trigger: { type: "nope", config: {} }, steps: [{ block: "move_item_to_group", config: {} }] });
    const llm = new ScriptedLlm([bad, plan(c)]);
    setLlmClient(llm);
    const p = await ai.nl.planFromText(c.admin, { boardId: c.boardId, text: SENTENCE });
    expect(p.method).toBe("ai");
    expect(llm.calls).toHaveLength(2);
    expect(JSON.stringify(llm.calls[1].messages)).toContain("niet geldig");

    setLlmClient(new ScriptedLlm([bad]));
    const p2 = await ai.nl.planFromText(c.admin, { boardId: c.boardId, text: SENTENCE });
    expect(p2.method).toBe("pattern");
    expect(p2.notes[0]).toContain("niet bruikbaar");
    expect(p2.definition?.steps[0]).toMatchObject({ block: "move_item_to_group" });
  });

  it("uses the pattern parser without AI and when credits are exhausted", async () => {
    const p = await ai.nl.planFromText(c.admin, { boardId: c.boardId, text: SENTENCE });
    expect(p.method).toBe("pattern");
    expect(p.definition?.trigger.type).toBe("status_changes_to");
    setLlmClient(new ScriptedLlm([plan(c)]));
    ai.updateSettings(c.admin, { accountMonthlyCredits: 0 });
    const p2 = await ai.nl.planFromText(c.admin, { boardId: c.boardId, text: SENTENCE });
    expect(p2.method).toBe("pattern");
    expect(p2.notes.join(" ")).toContain("credits");
    const a = await ai.nl.createFromText(c.admin, { boardId: c.boardId, text: SENTENCE });
    expect(a.method).toBe("pattern");
  });

  it("creates a draft workflow from text and keeps definition input untouched", async () => {
    setLlmClient(new ScriptedLlm([plan(c)]));
    const wf = await ai.nl.createWorkflow(c.admin, { boardId: c.boardId, text: "Bij klaar naar afgerond" });
    expect(wf.kind).toBe("workflow");
    expect(wf.status).toBe("draft");
    const plain = await ai.nl.createWorkflow(c.admin, { boardId: c.boardId, name: "Leeg" });
    expect(plain.kind).toBe("workflow");
  });

  it("is still permission checked", async () => {
    setLlmClient(new ScriptedLlm([plan(c)]));
    await expect(ai.nl.createFromText(c.viewer, { boardId: c.boardId, text: SENTENCE })).rejects.toThrow();
  });
});
