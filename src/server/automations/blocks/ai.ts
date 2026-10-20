/**
 * AI action blocks (module ai): categorize, summarize, translate, extract, sentiment and
 * "fill column with AI". They show up in the automation builder and workflows like any other
 * action. The work is done by services/ai-blocks.ts (structured JSON output, per-run credit cap).
 */
import { z } from "zod";
import * as aiBlocksSvc from "../../services/ai-blocks";
import type { AiBlockKind } from "../../services/ai-blocks";
import type { AutomationBlock, FieldSpec } from "./types";

const t = (nl: string, en: string) => ({ nl, en });
const idish = z.union([z.string(), z.number()]).transform(String);
const idReq = idish.pipe(z.string().min(1));

interface Cfg { sourceColumnId?: string; targetColumnId: string; instruction?: string; language?: string; maxCredits: number }

const schema = z.object({
  sourceColumnId: idish.optional(), targetColumnId: idReq, instruction: z.string().max(1000).optional(), language: z.string().max(40).optional(),
  maxCredits: z.coerce.number().int().min(1).max(500).default(5),
});

const source: FieldSpec = { key: "sourceColumnId", kind: "column", label: t("lees uit kolom (leeg = het hele item)", "read from column (empty = whole item)") };
const instruction: FieldSpec = { key: "instruction", kind: "longtext", label: t("extra instructie (optioneel)", "extra instruction (optional)") };
const cap: FieldSpec = { key: "maxCredits", kind: "number", label: t("max. credits per run", "max credits per run"), default: 5 };

function block(kind: AiBlockKind, title: ReturnType<typeof t>, label: string, targetTypes: string[] | undefined, extra: FieldSpec[] = []): AutomationBlock<Cfg> {
  return {
    id: `ai_${kind}`, kind: "action", label, title, category: "ai", needsItem: true,
    configSchema: schema as never,
    fields: [source, { key: "targetColumnId", kind: "column", columnTypes: targetTypes, label: t("schrijf naar kolom", "write to column"), required: true }, ...extra, instruction, cap],
    async run(ctx) {
      const it = ctx.item();
      if (!it) throw new Error("This run has no item");
      const r = await aiBlocksSvc.run(ctx.actor, it.id, kind, { ...ctx.config, instruction: ctx.config.instruction ? ctx.render(ctx.config.instruction) : undefined }, { source: "block", refId: ctx.run.id });
      return r.text;
    },
  };
}

export const aiBlocks: AutomationBlock<never>[] = [
  block("categorize", t("AI: categoriseer", "AI: categorize"), "AI categorize", ["status", "dropdown", "text"]),
  block("summarize", t("AI: vat samen", "AI: summarize"), "AI summarize", ["text", "long_text"]),
  block("translate", t("AI: vertaal", "AI: translate"), "AI translate", ["text", "long_text"], [{ key: "language", kind: "text", label: t("naar taal", "to language"), default: "Engels" }]),
  block("extract", t("AI: haal gegevens eruit", "AI: extract"), "AI extract", undefined),
  block("sentiment", t("AI: bepaal sentiment", "AI: sentiment"), "AI sentiment", ["status", "dropdown", "text"]),
  block("autofill", t("AI: vul kolom in", "AI: fill column"), "AI fill column", undefined),
] as unknown as AutomationBlock<never>[];
