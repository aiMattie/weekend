import type { ColumnDto } from "@/lib/board-types";
import type { BlockMeta, Definition, FieldSpec, Step } from "./types";
import type { UiCtx } from "./use-auto-context";
import { tx } from "./field-input";

/** Human readable value of one config field (column title, label text, user name ...). */
function show(f: FieldSpec, v: unknown, config: Record<string, unknown>, ctx: UiCtx): string {
  if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return "";
  const boardId = (f.boardField && String(config[f.boardField] ?? "")) || ctx.boardId;
  const cols: ColumnDto[] = ctx.boardColumns(ctx.boardId);
  const t = ctx.locale;
  switch (f.kind) {
    case "column": return ctx.boardColumns(boardId).find((c) => c.id === v)?.title ?? String(v);
    case "label": case "value": {
      const col = cols.find((c) => c.id === config[f.of ?? ""]);
      const labels = (col?.settings.labels as { id: number; text: string }[] | undefined) ?? [];
      return labels.find((l) => String(l.id) === String(v))?.text ?? String(v);
    }
    case "group": return ctx.boardGroups(boardId).find((g) => g.id === v)?.title ?? String(v);
    case "board": return ctx.boards.find((b) => b.id === v)?.name ?? String(v);
    case "user": return ctx.board.users.find((u) => u.id === v)?.name ?? String(v);
    case "users": return (v as string[]).map((x) => x === "@creator" ? (t === "nl" ? "maker" : "creator") : x === "@actor" ? (t === "nl" ? "wijziger" : "actor") : x.startsWith("@col:") ? cols.find((c) => c.id === x.slice(5))?.title ?? x : ctx.board.users.find((u) => u.id === x)?.name ?? x).join(", ");
    case "integration": return ctx.chatTargets.find((i) => i.id === v)?.name ?? String(v);
    case "select": return tx(f.options?.find((o) => o.value === String(v))?.label, t) || String(v);
    case "list": return (v as string[]).join(" / ");
    case "mapping": return `${Object.keys(v as object).length}`;
    case "boolean": return v ? "ja" : "";
    default: return String(v);
  }
}

export function describeBlock(block: BlockMeta | undefined, config: Record<string, unknown>, ctx: UiCtx): string {
  if (!block) return "?";
  const parts = block.fields.map((f) => ({ f, s: show(f, config[f.key], config, ctx) })).filter((x) => x.s && x.f.kind !== "longtext" && x.f.kind !== "mapping").map((x) => x.s);
  return parts.length ? `${tx(block.title, ctx.locale)}: ${parts.join(", ")}` : tx(block.title, ctx.locale);
}

export function describeSteps(steps: Step[], blocks: BlockMeta[], ctx: UiCtx): string[] {
  return steps.map((s) => {
    if (s.type === "action") return describeBlock(blocks.find((b) => b.id === s.block), s.config, ctx);
    if (s.type === "approval") return ctx.locale === "nl" ? "Goedkeuring vragen" : "Ask for approval";
    return ctx.locale === "nl" ? "Als/anders vertakking" : "If/else branch";
  });
}

export function describeDefinition(def: Definition, blocks: BlockMeta[], ctx: UiCtx): { when: string; actions: string[] } {
  return { when: describeBlock(blocks.find((b) => b.id === def.trigger.type), def.trigger.config, ctx), actions: describeSteps(def.steps, blocks, ctx) };
}

/** Drop empty values so the server schema defaults apply. */
export function cleanConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (v === "" || v === undefined || v === null) continue;
    if (Array.isArray(v) && !v.length) continue;
    if (typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length) continue;
    out[k] = v;
  }
  return out;
}
