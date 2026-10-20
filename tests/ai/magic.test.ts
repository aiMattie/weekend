import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLlmClient } from "../../src/server/ai/llm";
import * as ai from "../../src/server/services/ai";
import * as columnsSvc from "../../src/server/services/columns";
import * as groupsSvc from "../../src/server/services/groups";
import * as itemsSvc from "../../src/server/services/items";
import { freshCtx, type Ctx } from "../helpers";
import { ScriptedLlm } from "./mock-llm";

let ctx: Ctx;
beforeEach(async () => { ctx = await freshCtx(); });
afterEach(() => setLlmClient(null));

const SPEC = {
  name: "Recruitment pipeline",
  description: "Van sollicitatie tot contract",
  columns: [
    { title: "Fase", type: "status", labels: ["Nieuw", "Gesprek", "Afgerond"] },
    { title: "Recruiter", type: "people" },
    { title: "Startdatum", type: "date" },
    { title: "Salaris", type: "numbers" },
    { title: "Bron", type: "dropdown", labels: ["LinkedIn", "Referral"] },
  ],
  groups: [
    { title: "Open", items: [{ name: "Anna de Vries", values: { Fase: "Gesprek", Startdatum: "2026-11-01", Salaris: 4200, Bron: "LinkedIn", Recruiter: "iemand" } }] },
    { title: "Aangenomen", items: [{ name: "Bram Jansen", values: { Fase: "Afgerond", Salaris: "geen getal" } }] },
  ],
};

describe("Weekend magic", () => {
  it("previews a validated spec and builds the board through the services", async () => {
    setLlmClient(new ScriptedLlm(["```json\n" + JSON.stringify(SPEC) + "\n```"]));
    const { spec, credits } = await ai.magic.preview(ctx.member, { description: "Een recruitment pipeline met fases en bronnen" });
    expect(credits).toBeGreaterThan(0);
    expect(spec.columns).toHaveLength(5);

    const r = ai.magic.create(ctx.member, { workspaceId: ctx.workspaceId, spec });
    expect(r).toMatchObject({ name: "Recruitment pipeline", columns: 5, groups: 2, items: 2 });
    const cols = columnsSvc.list(ctx.member, r.boardId);
    expect(cols.map((c) => c.type)).toEqual(expect.arrayContaining(["name", "status", "people", "date", "numbers", "dropdown"]));
    expect(cols.find((c) => c.title === "Fase")!.settings.labels).toHaveLength(3);
    expect(groupsSvc.list(ctx.member, r.boardId).map((g) => g.title)).toEqual(["Open", "Aangenomen"]);
    const its = itemsSvc.list(ctx.member, { boardId: r.boardId });
    expect(its.map((i) => i.name)).toEqual(["Anna de Vries", "Bram Jansen"]);
    const fase = cols.find((c) => c.title === "Fase")!;
    expect(its[0].values[fase.id]).toBeTruthy();
    // an invalid sample value is skipped, not fatal
    expect(r.skippedValues.length).toBe(1);
  });

  it("repairs invalid model output once and fails after that", async () => {
    const llm = new ScriptedLlm(["geen json hier", JSON.stringify(SPEC)]);
    setLlmClient(llm);
    const { spec } = await ai.magic.preview(ctx.member, { description: "Een proces beschrijven" });
    expect(spec.name).toBe("Recruitment pipeline");
    expect(llm.calls).toHaveLength(2);
    expect(JSON.stringify(llm.calls[1].messages)).toContain("ongeldig");
    setLlmClient(new ScriptedLlm(["nope", "still nope"]));
    await expect(ai.magic.preview(ctx.member, { description: "Een proces beschrijven" })).rejects.toThrow(/geldige JSON/);
  });

  it("respects permissions and the not configured state", async () => {
    setLlmClient(new ScriptedLlm([JSON.stringify(SPEC)]));
    await expect(ai.magic.preview(ctx.viewer, { description: "Een proces beschrijven", workspaceId: ctx.workspaceId })).rejects.toThrow(/permission|Not allowed/i);
    expect(() => ai.magic.create(ctx.viewer, { workspaceId: ctx.workspaceId, spec: SPEC })).toThrow();
    setLlmClient(null);
    await expect(ai.magic.preview(ctx.member, { description: "Een proces beschrijven" })).rejects.toThrow("AI niet geconfigureerd");
  });
});
