/**
 * Agent runner (module ai). One run = one `agent_runs` row with transcript, tool calls and cost.
 *
 * Safety rails (all tested in tests/ai/agents.test.ts):
 *  - kill switch (ai_settings.agentsEnabled) and account AI switch: nothing runs, a "skipped" row says why;
 *  - loop protection: AsyncLocalStorage chain of agent ids; an agent already in the chain is skipped,
 *    depth is capped (MAX_DEPTH) and an agent cannot react to its own writes;
 *  - hard caps per run: steps (model rounds) and tokens; per agent: runs per hour;
 *  - the actor is `agentActor()`: a member-level actor whose permissions are cut down to the granted
 *    knowledge boards (src/lib/agent-permissions.ts), read or read-write.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import type { Actor } from "../../lib/actor";
import { ServiceError } from "../../lib/errors";
import { db } from "../../db/client";
import { agentKnowledge, agentRuns, agentSkills, agents, type AgentToolCall, type AgentTranscriptEntry, type AgentTriggerType } from "../../db/schema/ai";
import { callLlm, getSettings } from "../services/ai-core";
import { getTemplate } from "./agent-templates";
import { NATIVE_HANDLERS } from "./agent-native";
import { agentToolCatalog, findTool, toLlmTools, TOOL_DATA_RULES, wrapData, type AiTool } from "./tools";

export type AgentRow = typeof agents.$inferSelect;
export type AgentRunRow = typeof agentRuns.$inferSelect;
export const MAX_DEPTH = 3;
export const READ_TOOLS = ["list_boards", "get_board", "get_item", "search", "list_users", "my_work", "read_doc"];

export interface ChainStore { chain: string[]; depth: number }
const g = globalThis as unknown as { __agentAls?: AsyncLocalStorage<ChainStore> };
export const agentAls = (g.__agentAls ??= new AsyncLocalStorage<ChainStore>());

export interface RunTrigger { type: AgentTriggerType; data?: Record<string, unknown>; itemId?: string | null; boardId?: string | null }
export interface RunOptions { startedBy?: string | null; input?: string; store?: ChainStore; now?: Date }

/** The permission-limited actor an agent writes as. */
export function agentActor(agent: AgentRow): Actor {
  const grants = db.select().from(agentKnowledge).where(eq(agentKnowledge.agentId, agent.id)).all().map((k) => ({ kind: k.kind, id: k.refId, access: k.access }));
  return { id: agent.userId ?? agent.ownerId ?? "system", accountId: agent.accountId, role: "member", name: agent.name, source: "agent", agent: { id: agent.id, grants } };
}

function toolsFor(agentId: string): AiTool[] {
  const catalog = agentToolCatalog();
  const skills = db.select().from(agentSkills).where(eq(agentSkills.agentId, agentId)).all();
  if (!skills.length) return catalog;
  const allowed = new Set([...READ_TOOLS, ...skills.flatMap((s) => s.tools)]);
  return catalog.filter((t) => allowed.has(t.name));
}

function systemPromptFor(agent: AgentRow, actor: Actor): string {
  const skills = db.select().from(agentSkills).where(eq(agentSkills.agentId, agent.id)).all();
  const grants = actor.agent?.grants ?? [];
  return [
    `Je bent de AI-agent "${agent.name}" in Weekend. Je werkt zelfstandig, zonder dat iemand meekijkt, en je rechten zijn beperkt tot de boards en docs in je kennis.`,
    `Opdracht van de eigenaar:\n${agent.instructions || agent.description || "(geen instructies)"}`,
    skills.length ? `Vaardigheden:\n${skills.map((s) => `- ${s.name}: ${s.instruction}`).join("\n")}` : "",
    `Kennis: ${grants.length ? grants.map((x) => `${x.kind} ${x.id} (${x.access === "write" ? "lezen en schrijven" : "alleen lezen"})`).join("; ") : "geen"}. Eigenaar van de agent (user-id): ${agent.ownerId ?? "onbekend"}.`,
    `Vandaag is het ${new Date().toISOString().slice(0, 10)}. Doe alleen wat de opdracht vraagt, wees zuinig met stappen en rond af met een korte samenvatting van wat je deed.`,
    TOOL_DATA_RULES,
  ].filter(Boolean).join("\n\n");
}

const describeTrigger = (t: RunTrigger, input?: string): string => {
  const base = `Trigger: ${t.type}${t.itemId ? `, item ${t.itemId}` : ""}${t.boardId ? `, board ${t.boardId}` : ""}. ${t.data ? JSON.stringify(t.data).slice(0, 1500) : ""}`;
  return input ? `${base}\nExtra invoer van de gebruiker (data):\n<invoer>${input}</invoer>` : base;
};

function skip(agent: AgentRow, trigger: RunTrigger, reason: string, opts: RunOptions): AgentRunRow {
  const now = (opts.now ?? new Date()).toISOString();
  return db.insert(agentRuns).values({ agentId: agent.id, accountId: agent.accountId, status: "skipped", triggerType: trigger.type, trigger: { ...(trigger.data ?? {}), itemId: trigger.itemId, boardId: trigger.boardId }, startedBy: opts.startedBy ?? null, error: reason, depth: opts.store?.depth ?? 0, chain: opts.store?.chain ?? [], startedAt: now, finishedAt: now }).returning().get();
}

/** Check the rails; returns the reason a run must not start, or null. */
export function blockReason(agent: AgentRow, trigger: RunTrigger, opts: RunOptions): string | null {
  const s = getSettings(agent.accountId);
  if (!s.aiEnabled) return "AI is uitgeschakeld voor dit account";
  if (!s.agentsEnabled) return "Agents staan uit (noodstop actief)";
  if (opts.store?.chain.includes(agent.id)) return "Loop protection: deze agent is al onderdeel van de keten die dit startte";
  if ((opts.store?.depth ?? 0) >= MAX_DEPTH) return `Loop protection: keten dieper dan ${MAX_DEPTH} agents`;
  const hourAgo = new Date((opts.now ?? new Date()).getTime() - 3_600_000).toISOString();
  const n = db.select({ n: sql<number>`count(*)` }).from(agentRuns).where(and(eq(agentRuns.agentId, agent.id), ne(agentRuns.status, "skipped"), gte(agentRuns.createdAt, hourAgo))).get()?.n ?? 0;
  if (n >= agent.maxRunsPerHour) return `Limiet bereikt: ${agent.maxRunsPerHour} runs per uur voor deze agent`;
  return null;
}

/** Execute one run (never throws for agent failures: they end up in the run row). */
export async function executeAgent(agentId: string, trigger: RunTrigger, opts: RunOptions = {}): Promise<AgentRunRow> {
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent || agent.state === "deleted") throw new ServiceError("Agent not found", "not_found", 404);
  const reason = blockReason(agent, trigger, opts);
  if (reason) return skip(agent, trigger, reason, opts);

  const store: ChainStore = { chain: [...(opts.store?.chain ?? []), agent.id], depth: (opts.store?.depth ?? 0) + 1 };
  const run = db.insert(agentRuns).values({ agentId: agent.id, accountId: agent.accountId, status: "running", triggerType: trigger.type, trigger: { ...(trigger.data ?? {}), itemId: trigger.itemId, boardId: trigger.boardId }, startedBy: opts.startedBy ?? null, depth: store.depth - 1, chain: store.chain, startedAt: (opts.now ?? new Date()).toISOString() }).returning().get();

  const actor = agentActor(agent);
  const transcript: AgentTranscriptEntry[] = [];
  const toolCalls: AgentToolCall[] = [];
  const at = () => new Date().toISOString();
  const tally = { input: 0, output: 0, credits: 0, steps: 0 };
  let status: AgentRunRow["status"] = "success";
  let error: string | null = null;
  let result = "";
  const log = (role: AgentTranscriptEntry["role"], text: string) => transcript.push({ role, text: text.slice(0, 4000), at: at() });

  try {
    await agentAls.run(store, async () => {
      const tpl = agent.templateKey ? getTemplate(agent.templateKey) : undefined;
      if (tpl?.native) {
        log("system", `Native agent: ${tpl.native}`);
        result = await NATIVE_HANDLERS[tpl.native]({
          agent, actor, runId: run.id, triggerType: trigger.type, startedBy: opts.startedBy ?? null, now: opts.now ?? new Date(),
          log: (t) => log("assistant", t),
          call: (name, input, output) => { toolCalls.push({ name, input, output, at: at() }); tally.steps++; },
        });
        log("assistant", result);
        return;
      }
      const tools = toolsFor(agent.id);
      const llmTools = toLlmTools(tools);
      const system = systemPromptFor(agent, actor);
      const first = describeTrigger(trigger, opts.input);
      log("system", system.slice(0, 1500));
      log("user", first);
      const messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: first }];
      for (let step = 0; step < agent.maxSteps; step++) {
        if (tally.input + tally.output >= agent.maxTokens) { status = "capped"; error = `Tokenlimiet van ${agent.maxTokens} bereikt`; return; }
        const r = await callLlm({ accountId: agent.accountId, userId: opts.startedBy ?? null, source: "agent", refId: run.id }, { system, messages: messages as never, tools: llmTools, maxTokens: 1500, model: agent.model ?? undefined });
        tally.steps++; tally.input += r.inputTokens; tally.output += r.outputTokens; tally.credits += r.credits;
        messages.push({ role: "assistant", content: r.content });
        if (r.text) { log("assistant", r.text); result = r.text; }
        if (!r.toolUses.length) return;
        const results: unknown[] = [];
        for (const tu of r.toolUses) {
          const tool = findTool(tools, tu.name);
          let out: string;
          let isError = false;
          if (!tool) { out = `Tool "${tu.name}" is niet beschikbaar voor deze agent`; isError = true; }
          else {
            const parsed = tool.schema.safeParse(tu.input);
            if (!parsed.success) { out = `Ongeldige invoer: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`; isError = true; }
            else {
              try { out = wrapData(tool.name, await tool.run({ actor, accountId: agent.accountId, userId: opts.startedBy ?? null, source: "agent", refId: run.id }, parsed.data)); }
              catch (e) { out = e instanceof ServiceError ? (e.code === "forbidden" ? `Niet toegestaan: ${e.message}` : e.message) : "Tool mislukt"; isError = true; }
            }
          }
          toolCalls.push({ name: tu.name, input: tu.input, output: out.slice(0, 1500), error: isError || undefined, at: at() });
          log("tool", `${tu.name}: ${out.slice(0, 600)}`);
          results.push({ type: "tool_result", tool_use_id: tu.id, content: out, ...(isError ? { is_error: true } : {}) });
        }
        messages.push({ role: "user", content: results });
      }
      status = "capped";
      error = `Stappenlimiet van ${agent.maxSteps} bereikt`;
    });
  } catch (e) {
    status = "failed";
    error = e instanceof ServiceError ? e.message : e instanceof Error ? e.message : String(e);
    if (!(e instanceof ServiceError)) console.error("[agents] run failed", agent.id, error);
  }
  return db.update(agentRuns).set({ status, error, result: result || null, transcript, toolCalls, steps: tally.steps, inputTokens: tally.input, outputTokens: tally.output, credits: tally.credits, finishedAt: new Date().toISOString() }).where(eq(agentRuns.id, run.id)).returning().get();
}
