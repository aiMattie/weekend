/**
 * Sidekick (module ai): chat with tool use over the service layer, as the logged-in user.
 *
 *  - History per user in ai_conversations / ai_messages (raw Anthropic blocks, replayed verbatim).
 *  - Reads run immediately; writes become confirmation cards (ai_pending_actions) and only run on
 *    `confirmAction`, again as the user, again permission-checked.
 *  - Tool output is wrapped as data (prompt-injection hygiene, see server/ai/tools.ts).
 *  - Every model call is metered (ai-core `callLlm`): per-user and per-account monthly credits.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError, ServiceError } from "../../lib/errors";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { aiConversations, aiMessages, aiPendingActions, type AiContextRef } from "../../db/schema/ai";
import { findTool, sidekickTools, toLlmTools, TOOL_DATA_RULES, wrapData, type ToolCtx, type ToolPlan } from "../ai/tools";
import type { LlmMessage } from "../ai/llm";
import { parse } from "./_shared";
import { assertCredits, callLlm, requireLlm } from "./ai-core";
import * as boardsSvc from "./boards";
import * as columnsSvc from "./columns";
import * as docsSvc from "./docs";
import * as itemsSvc from "./items";

export type Conversation = typeof aiConversations.$inferSelect;
export type PendingAction = typeof aiPendingActions.$inferSelect;

export type ChatEvent =
  | { type: "conversation"; id: string; title: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; status: "running" | "done" | "error"; detail?: string }
  | { type: "pending"; action: PendingAction }
  | { type: "error"; message: string; code?: string }
  | { type: "done"; credits: number };

const MAX_ROUNDS = 6;
const HISTORY_LIMIT = 40;

const chatInput = z.object({
  conversationId: idSchema.optional(),
  message: z.string().trim().min(1).max(8000),
  context: z.object({ kind: z.enum(["board", "item", "doc"]), id: idSchema }).nullish(),
});

const toolCtx = (actor: Actor, refId: string): ToolCtx => ({ actor: { ...actor, source: "ai" }, accountId: actor.accountId, userId: actor.id, source: "sidekick", refId });

/* ------------------------------------------------------------ prompt */

function contextBlock(actor: Actor, ref: AiContextRef): string {
  if (!ref) return "";
  try {
    if (ref.kind === "board") {
      const b = boardsSvc.get(actor, ref.id);
      const cols = columnsSvc.list(actor, ref.id, "item").filter((c) => c.type !== "name").map((c) => `${c.key} (${c.type})`).join(", ");
      return `De gebruiker kijkt nu naar board "${b.name}" (id ${b.id}). Kolommen: ${cols}. Gebruik get_board voor de inhoud.`;
    }
    if (ref.kind === "item") {
      const it = itemsSvc.get(actor, ref.id);
      return `De gebruiker heeft item "${it.name}" (id ${it.id}) open op board ${it.boardId}. Gebruik get_item voor details.`;
    }
    const d = docsSvc.get(actor, ref.id);
    return `De gebruiker leest doc "${d.title}" (id ${d.id}). Gebruik read_doc voor de inhoud.`;
  } catch {
    return "";
  }
}

export function systemPrompt(actor: Actor, ref: AiContextRef): string {
  return [
    `Je bent Sidekick, de AI-assistent in Weekend (een werk-OS). Je spreekt met ${actor.name ?? "de gebruiker"}. Vandaag is het ${new Date().toISOString().slice(0, 10)}.`,
    "Antwoord in dezelfde taal als de gebruiker (standaard Nederlands), kort en concreet. Gebruik de tools om boards, items en docs te lezen in plaats van te gokken.",
    "Wijzigingen (create_item, change_column_values, create_update, weekend_magic) worden NIET direct uitgevoerd: de gebruiker krijgt een bevestigingskaart. Zeg dat je het hebt voorgesteld en vraag om bevestiging; beweer nooit dat het al gebeurd is.",
    "Je hebt precies de rechten van de gebruiker. Als een tool 'niet toegestaan' teruggeeft, leg dat uit en probeer geen omweg.",
    TOOL_DATA_RULES,
    contextBlock(actor, ref),
  ].filter(Boolean).join("\n");
}

/* ------------------------------------------------------------ history */

function nextSeq(conversationId: string): number {
  const last = db.select({ seq: aiMessages.seq }).from(aiMessages).where(eq(aiMessages.conversationId, conversationId)).orderBy(desc(aiMessages.seq)).limit(1).get();
  return (last?.seq ?? 0) + 1;
}

function addMessage(conversationId: string, m: { role: "user" | "assistant"; kind?: "text" | "tool_result" | "note"; content: unknown; text?: string }): void {
  db.insert(aiMessages).values({ conversationId, seq: nextSeq(conversationId), role: m.role, kind: m.kind ?? "text", content: m.content, text: m.text ?? "" }).run();
  db.update(aiConversations).set({ updatedAt: new Date().toISOString() }).where(eq(aiConversations.id, conversationId)).run();
}

function history(conversationId: string): LlmMessage[] {
  let rows = db.select().from(aiMessages).where(eq(aiMessages.conversationId, conversationId)).orderBy(asc(aiMessages.seq)).all();
  if (rows.length > HISTORY_LIMIT) rows = rows.slice(-HISTORY_LIMIT);
  // a window must start with a plain user text (never with an orphaned tool_result)
  while (rows.length && !(rows[0].role === "user" && rows[0].kind !== "tool_result")) rows = rows.slice(1);
  return rows.map((r) => ({ role: r.role, content: r.content as LlmMessage["content"] }));
}

function ownConversation(actor: Actor, id: string): Conversation {
  const c = db.select().from(aiConversations).where(eq(aiConversations.id, id)).get();
  if (!c || c.accountId !== actor.accountId || c.userId !== actor.id) throw new NotFoundError("Conversation");
  return c;
}

/* ------------------------------------------------------------ chat loop */

/** Throws the HTTP-mappable error (not configured / credits) BEFORE a stream is opened. */
export function preflight(actor: Actor): void {
  requireLlm(actor.accountId);
  assertCredits(actor.accountId, actor.id);
}

export async function chat(actor: Actor, input: unknown, send: (e: ChatEvent) => void): Promise<{ conversationId: string; credits: number }> {
  const d = parse(chatInput, input);
  preflight(actor);
  let conv: Conversation;
  if (d.conversationId) conv = ownConversation(actor, d.conversationId);
  else {
    conv = db.insert(aiConversations).values({ accountId: actor.accountId, userId: actor.id, title: d.message.replace(/\s+/g, " ").slice(0, 60), context: d.context ?? null }).returning().get();
  }
  const ctxRef: AiContextRef = d.context ?? conv.context ?? null;
  send({ type: "conversation", id: conv.id, title: conv.title });
  addMessage(conv.id, { role: "user", content: d.message, text: d.message });

  const tools = sidekickTools();
  const llmTools = toLlmTools(tools);
  const system = systemPrompt(actor, ctxRef);
  const ctx = toolCtx(actor, conv.id);
  let credits = 0;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const r = await callLlm({ accountId: actor.accountId, userId: actor.id, source: "sidekick", refId: conv.id }, { system, messages: history(conv.id), tools: llmTools, maxTokens: 2500 }, { onText: (delta) => send({ type: "text", delta }) });
      credits += r.credits;
      addMessage(conv.id, { role: "assistant", content: r.content, text: r.text });
      if (r.stopReason === "refusal") { send({ type: "error", message: "Het model kon hier niet op antwoorden.", code: "refusal" }); break; }
      if (!r.toolUses.length) break;
      const results: unknown[] = [];
      for (const tu of r.toolUses) results.push(await runToolUse(ctx, conv.id, tu, send));
      addMessage(conv.id, { role: "user", kind: "tool_result", content: results });
      if (round === MAX_ROUNDS - 1) send({ type: "error", message: "Te veel stappen in een keer; stel de vraag opnieuw of splits hem op.", code: "max_rounds" });
    }
  } catch (e) {
    const err = e instanceof ServiceError ? e : null;
    send({ type: "error", message: err?.message ?? "Er ging iets mis bij het ophalen van het antwoord.", code: (err?.details as { reason?: string } | undefined)?.reason });
    if (!err) console.error("[ai] sidekick failed", e instanceof Error ? e.message : e);
  }
  send({ type: "done", credits });
  return { conversationId: conv.id, credits };
}

async function runToolUse(ctx: ToolCtx, conversationId: string, tu: { id: string; name: string; input: Record<string, unknown> }, send: (e: ChatEvent) => void): Promise<unknown> {
  const result = (text: string, isError = false) => ({ type: "tool_result", tool_use_id: tu.id, content: text, ...(isError ? { is_error: true } : {}) });
  const tool = findTool(sidekickTools(), tu.name);
  if (!tool) return result(`Onbekende tool "${tu.name}"`, true);
  const parsed = tool.schema.safeParse(tu.input);
  if (!parsed.success) return result(`Ongeldige invoer: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, true);
  send({ type: "tool", name: tool.name, status: "running" });
  try {
    if (tool.write) {
      const plan = await tool.plan!(ctx, parsed.data);
      const action = db.insert(aiPendingActions).values({ conversationId, userId: ctx.actor.id, toolName: tool.name, input: parsed.data as Record<string, unknown>, summary: plan.summary, preview: plan.preview ?? null }).returning().get();
      send({ type: "tool", name: tool.name, status: "done", detail: "voorgesteld" });
      send({ type: "pending", action });
      return result(`Voorgesteld aan de gebruiker (actie ${action.id}): ${plan.summary}. Het is NOG NIET uitgevoerd; de gebruiker moet bevestigen.`);
    }
    const out = await tool.run(ctx, parsed.data);
    send({ type: "tool", name: tool.name, status: "done" });
    return result(wrapData(tool.name, out));
  } catch (e) {
    const msg = e instanceof ForbiddenError ? `Niet toegestaan: ${e.message}` : e instanceof ServiceError ? e.message : "Tool mislukt";
    send({ type: "tool", name: tool.name, status: "error", detail: msg });
    if (!(e instanceof ServiceError)) console.error("[ai] tool failed", tool.name, e instanceof Error ? e.message : e);
    return result(msg, true);
  }
}

/* ------------------------------------------------------------ confirmation cards */

function pendingFor(actor: Actor, actionId: string): PendingAction {
  const a = db.select().from(aiPendingActions).where(eq(aiPendingActions.id, actionId)).get();
  if (!a || a.userId !== actor.id) throw new NotFoundError("Action");
  return a;
}

/** The user clicked "Bevestigen": run the write as the user (permissions re-checked by the services). */
export async function confirmAction(actor: Actor, actionId: string): Promise<{ action: PendingAction; result: unknown }> {
  const a = pendingFor(actor, actionId);
  if (a.status !== "pending") throw new ServiceError(`Deze actie is al ${a.status === "confirmed" ? "uitgevoerd" : "afgehandeld"}`, "conflict", 409);
  const tool = findTool(sidekickTools(), a.toolName);
  if (!tool?.write) throw new NotFoundError("Tool");
  const ctx = toolCtx(actor, a.conversationId);
  const parsed = tool.schema.parse(a.input);
  const plan: ToolPlan = { summary: a.summary, preview: a.preview ?? undefined };
  try {
    if (tool.check) tool.check(ctx, parsed); else await tool.plan!(ctx, parsed); // permission re-check
    const result = await tool.run(ctx, parsed, plan);
    const row = db.update(aiPendingActions).set({ status: "confirmed", result: result as never, decidedAt: new Date().toISOString() }).where(eq(aiPendingActions.id, actionId)).returning().get();
    addMessage(a.conversationId, { role: "user", kind: "note", content: `[Systeem] De gebruiker heeft bevestigd en de actie is uitgevoerd: ${a.summary}`, text: `Uitgevoerd: ${a.summary}` });
    return { action: row, result };
  } catch (e) {
    const msg = e instanceof ServiceError ? e.message : "Uitvoeren mislukt";
    db.update(aiPendingActions).set({ status: "failed", error: msg, decidedAt: new Date().toISOString() }).where(eq(aiPendingActions.id, actionId)).run();
    if (e instanceof ServiceError) throw e;
    throw new ServiceError(msg, "bad_request", 500);
  }
}

export function rejectAction(actor: Actor, actionId: string): PendingAction {
  const a = pendingFor(actor, actionId);
  if (a.status !== "pending") throw new ServiceError("Deze actie is al afgehandeld", "conflict", 409);
  const row = db.update(aiPendingActions).set({ status: "rejected", decidedAt: new Date().toISOString() }).where(eq(aiPendingActions.id, actionId)).returning().get();
  addMessage(a.conversationId, { role: "user", kind: "note", content: `[Systeem] De gebruiker heeft de voorgestelde actie geweigerd: ${a.summary}`, text: `Geweigerd: ${a.summary}` });
  return row;
}

/* ------------------------------------------------------------ conversations */

export function listConversations(actor: Actor, limit = 50): Conversation[] {
  return db.select().from(aiConversations).where(and(eq(aiConversations.accountId, actor.accountId), eq(aiConversations.userId, actor.id))).orderBy(desc(aiConversations.updatedAt)).limit(limit).all();
}

export interface DisplayMessage { id: string; role: "user" | "assistant" | "note"; text: string; createdAt: string }

export function getConversation(actor: Actor, id: string): { conversation: Conversation; messages: DisplayMessage[]; actions: PendingAction[] } {
  const conversation = ownConversation(actor, id);
  const rows = db.select().from(aiMessages).where(eq(aiMessages.conversationId, id)).orderBy(asc(aiMessages.seq)).all();
  const messages: DisplayMessage[] = rows
    .filter((r) => r.kind !== "tool_result" && r.text.trim())
    .map((r) => ({ id: r.id, role: r.kind === "note" ? "note" : r.role, text: r.text, createdAt: r.createdAt }));
  const actions = db.select().from(aiPendingActions).where(eq(aiPendingActions.conversationId, id)).orderBy(asc(aiPendingActions.createdAt)).all();
  return { conversation, messages, actions };
}

export function deleteConversation(actor: Actor, id: string): void {
  ownConversation(actor, id);
  db.delete(aiConversations).where(eq(aiConversations.id, id)).run();
}
