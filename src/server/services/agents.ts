/**
 * Agents service (module ai): CRUD for agents, triggers, skills and knowledge grants, the ready-made
 * catalogue, manual runs and run history. Execution lives in src/server/ai/agent-runner.ts, events
 * and schedules in src/server/ai/agent-engine.ts. Used by REST, the UI and the MCP agent tools.
 *
 * Who may do what: any member sees the directory; the owner (or an account admin) manages an agent.
 * Knowledge grants can never exceed what the person granting them may do themselves.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { assertCan } from "../../lib/permissions";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { agentKnowledge, agentRuns, agentSkills, agentTriggers, agents, type AgentTriggerType } from "../../db/schema/ai";
import { boards, users } from "../../db/schema/core";
import { docs } from "../../db/schema/docs";
import { AGENT_TEMPLATES, getTemplate } from "../ai/agent-templates";
import { initialFiredKey, startAgentEngine } from "../ai/agent-engine";
import { executeAgent, type AgentRunRow } from "../ai/agent-runner";
import { toLlmTools, agentToolCatalog } from "../ai/tools";
import { newId } from "../../lib/id";
import { parse } from "./_shared";
import { recordAudit } from "./audit";
import * as boardsSvc from "./boards";
import * as docsSvc from "./docs";

export type Agent = typeof agents.$inferSelect;
export type AgentTrigger = typeof agentTriggers.$inferSelect;
export type AgentSkill = typeof agentSkills.$inferSelect;
export type AgentRun = AgentRunRow;
export interface KnowledgeDto { id: string; kind: "board" | "doc"; refId: string; access: "read" | "write"; name: string | null }
export interface AgentDto extends Agent { triggers: AgentTrigger[]; skills: AgentSkill[]; knowledge: KnowledgeDto[]; identityName: string | null; lastRun: Pick<AgentRun, "id" | "status" | "startedAt" | "triggerType"> | null }

startAgentEngine();

/* ------------------------------------------------------------ access */

const isMember = (a: Actor) => a.isSystem || (a.role !== "guest" && a.role !== "viewer");
function requireMember(actor: Actor): void { if (!isMember(actor)) throw new ForbiddenError("Alleen leden kunnen agents gebruiken"); }
const canManage = (actor: Actor, a: Agent) => !!actor.isSystem || actor.role === "admin" || a.ownerId === actor.id;

function load(actor: Actor, id: string): Agent {
  const a = db.select().from(agents).where(eq(agents.id, id)).get();
  if (!a || a.state === "deleted" || a.accountId !== actor.accountId) throw new NotFoundError("Agent");
  return a;
}
function loadManaged(actor: Actor, id: string): Agent {
  const a = load(actor, id);
  if (!canManage(actor, a)) throw new ForbiddenError("Alleen de eigenaar of een admin kan deze agent beheren");
  return a;
}

/* ------------------------------------------------------------ read */

function toDto(a: Agent): AgentDto {
  const knowledge = db.select().from(agentKnowledge).where(eq(agentKnowledge.agentId, a.id)).orderBy(asc(agentKnowledge.createdAt)).all();
  const names = new Map<string, string>();
  const bIds = knowledge.filter((k) => k.kind === "board").map((k) => k.refId);
  const dIds = knowledge.filter((k) => k.kind === "doc").map((k) => k.refId);
  if (bIds.length) for (const b of db.select({ id: boards.id, name: boards.name }).from(boards).where(inArray(boards.id, bIds)).all()) names.set(b.id, b.name);
  if (dIds.length) for (const d of db.select({ id: docs.id, title: docs.title }).from(docs).where(inArray(docs.id, dIds)).all()) names.set(d.id, d.title);
  const last = db.select({ id: agentRuns.id, status: agentRuns.status, startedAt: agentRuns.startedAt, triggerType: agentRuns.triggerType }).from(agentRuns).where(eq(agentRuns.agentId, a.id)).orderBy(desc(agentRuns.createdAt), desc(agentRuns.id)).limit(1).get();
  return {
    ...a,
    triggers: db.select().from(agentTriggers).where(eq(agentTriggers.agentId, a.id)).orderBy(asc(agentTriggers.createdAt)).all(),
    skills: db.select().from(agentSkills).where(eq(agentSkills.agentId, a.id)).orderBy(asc(agentSkills.createdAt)).all(),
    knowledge: knowledge.map((k) => ({ id: k.id, kind: k.kind, refId: k.refId, access: k.access, name: names.get(k.refId) ?? null })),
    identityName: a.userId ? db.select({ name: users.name }).from(users).where(eq(users.id, a.userId)).get()?.name ?? null : null,
    lastRun: last ?? null,
  };
}

export function list(actor: Actor, opts: { mine?: boolean } = {}): AgentDto[] {
  requireMember(actor);
  return db.select().from(agents).where(and(eq(agents.accountId, actor.accountId), eq(agents.state, "active"), opts.mine ? eq(agents.ownerId, actor.id) : undefined)).orderBy(asc(agents.createdAt)).all().map(toDto);
}
export function get(actor: Actor, id: string): AgentDto { requireMember(actor); return toDto(load(actor, id)); }

/* ------------------------------------------------------------ create / update / delete */

const createInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(""),
  avatar: z.string().max(40).default("#a25ddc"),
  instructions: z.string().max(8000).default(""),
  model: z.string().max(100).nullish(),
  status: z.enum(["active", "paused", "draft"]).default("draft"),
  /** link an existing AI user (Scout, Aide) as identity instead of creating one */
  userId: idSchema.nullish(),
  templateKey: z.string().max(60).nullish(),
  maxSteps: z.number().int().min(1).max(25).default(8),
  maxTokens: z.number().int().min(1000).max(500_000).default(20_000),
  maxRunsPerHour: z.number().int().min(1).max(1000).default(30),
});
const updateInput = createInput.omit({ templateKey: true }).partial();

function linkIdentity(actor: Actor, userId: string): void {
  const u = db.select().from(users).where(eq(users.id, userId)).get();
  if (!u || u.accountId !== actor.accountId || !u.isAiAgent) throw new ValidationError("Een agent kan alleen aan een AI-gebruiker (zoals Scout of Aide) gekoppeld worden");
}

function createIdentity(agent: Agent): string {
  const id = newId();
  db.insert(users).values({ id, accountId: agent.accountId, name: agent.name, email: `agent-${agent.id}@agents.example.com`, isAiAgent: true, role: "member", title: "AI-agent", passwordHash: null }).run();
  return id;
}

export function create(actor: Actor, input: unknown): AgentDto {
  requireMember(actor);
  const d = parse(createInput, input);
  if (d.userId) linkIdentity(actor, d.userId);
  if (d.templateKey && !getTemplate(d.templateKey)) throw new ValidationError(`Onbekend sjabloon "${d.templateKey}"`);
  const row = db.insert(agents).values({ accountId: actor.accountId, ownerId: actor.isSystem ? null : actor.id, ...d, model: d.model ?? null, userId: d.userId ?? null, templateKey: d.templateKey ?? null }).returning().get();
  if (!d.userId) {
    const uid = createIdentity(row);
    db.update(agents).set({ userId: uid, ownsUser: true }).where(eq(agents.id, row.id)).run();
  }
  db.insert(agentTriggers).values({ agentId: row.id, type: "manual", config: {} }).run();
  recordAudit(actor, "ai.agent_created", { targetType: "agent", targetId: row.id, targetName: row.name });
  return toDto(load(actor, row.id));
}

export function update(actor: Actor, id: string, input: unknown): AgentDto {
  const cur = loadManaged(actor, id);
  const d = parse(updateInput, input);
  if (d.userId) linkIdentity(actor, d.userId);
  const patch = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
  if (d.userId && d.userId !== cur.userId) {
    if (cur.ownsUser && cur.userId) db.update(users).set({ isActive: false }).where(eq(users.id, cur.userId)).run();
    (patch as Record<string, unknown>).ownsUser = false;
  }
  if (Object.keys(patch).length) db.update(agents).set(patch).where(eq(agents.id, id)).run();
  if (d.name && cur.ownsUser && cur.userId) db.update(users).set({ name: d.name }).where(eq(users.id, cur.userId)).run();
  if (d.status && d.status !== cur.status) recordAudit(actor, "ai.agent_status_changed", { targetType: "agent", targetId: id, targetName: cur.name, from: cur.status, to: d.status });
  return toDto(load(actor, id));
}

export function remove(actor: Actor, id: string): { deleted: true } {
  const cur = loadManaged(actor, id);
  db.update(agents).set({ state: "deleted", status: "paused" }).where(eq(agents.id, id)).run();
  if (cur.ownsUser && cur.userId) db.update(users).set({ isActive: false }).where(eq(users.id, cur.userId)).run();
  recordAudit(actor, "ai.agent_deleted", { targetType: "agent", targetId: id, targetName: cur.name });
  return { deleted: true };
}

/* ------------------------------------------------------------ triggers */

const TRIGGER_TYPES = ["item_created", "column_changed", "mention", "schedule", "manual"] as const;
const triggerInput = z.object({
  type: z.enum(TRIGGER_TYPES),
  config: z.record(z.string(), z.unknown()).default({}),
  active: z.boolean().default(true),
});

function checkTriggerConfig(actor: Actor, type: AgentTriggerType, config: Record<string, unknown>): Record<string, unknown> {
  if (type === "item_created" || type === "column_changed") {
    const c = parse(z.object({ boardId: idSchema, columnId: z.string().optional(), labelText: z.string().max(100).optional() }), config);
    boardsSvc.get(actor, c.boardId);
    return c;
  }
  if (type === "mention") return parse(z.object({ boardId: idSchema.optional() }), config);
  if (type === "schedule") return parse(z.object({ every: z.enum(["day", "weekday", "week"]).default("day"), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("09:00"), weekday: z.number().int().min(1).max(7).optional() }), config);
  return {};
}

export function listTriggers(actor: Actor, input: unknown): AgentTrigger[] {
  const d = parse(z.object({ agent_id: idSchema.optional(), id: idSchema.optional() }), input);
  return get(actor, (d.agent_id ?? d.id)!).triggers;
}

export function addTrigger(actor: Actor, agentId: string, input: unknown): AgentTrigger {
  loadManaged(actor, agentId);
  const d = parse(triggerInput, input);
  const config = checkTriggerConfig(actor, d.type, d.config);
  return db.insert(agentTriggers).values({ agentId, type: d.type, config, active: d.active, lastFiredKey: d.type === "schedule" ? initialFiredKey(config) : null }).returning().get();
}

export function setTriggerActive(actor: Actor, agentId: string, triggerId: string, active: boolean): AgentTrigger {
  loadManaged(actor, agentId);
  const t = db.update(agentTriggers).set({ active }).where(and(eq(agentTriggers.id, triggerId), eq(agentTriggers.agentId, agentId))).returning().get();
  if (!t) throw new NotFoundError("Trigger");
  return t;
}

export function removeTrigger(actor: Actor, agentId: string, triggerId: string): { removed: true } {
  loadManaged(actor, agentId);
  const r = db.delete(agentTriggers).where(and(eq(agentTriggers.id, triggerId), eq(agentTriggers.agentId, agentId))).run();
  if (!r.changes) throw new NotFoundError("Trigger");
  return { removed: true };
}

/* ------------------------------------------------------------ skills */

const skillInput = z.object({ name: z.string().trim().min(1).max(100), instruction: z.string().max(4000).default(""), tools: z.array(z.string()).max(40).default([]) });

export const toolNames = (): string[] => agentToolCatalog().map((t) => t.name);

export function addSkill(actor: Actor, agentId: string, input: unknown): AgentSkill {
  loadManaged(actor, agentId);
  const d = parse(skillInput, input);
  const unknown = d.tools.filter((t) => !toolNames().includes(t));
  if (unknown.length) throw new ValidationError(`Onbekende tools: ${unknown.join(", ")}. Beschikbaar: ${toolNames().join(", ")}`);
  return db.insert(agentSkills).values({ agentId, ...d }).returning().get();
}
export function updateSkill(actor: Actor, agentId: string, skillId: string, input: unknown): AgentSkill {
  loadManaged(actor, agentId);
  const d = parse(skillInput.partial(), input);
  const r = db.update(agentSkills).set(Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined))).where(and(eq(agentSkills.id, skillId), eq(agentSkills.agentId, agentId))).returning().get();
  if (!r) throw new NotFoundError("Skill");
  return r;
}
export function removeSkill(actor: Actor, agentId: string, skillId: string): { removed: true } {
  loadManaged(actor, agentId);
  const r = db.delete(agentSkills).where(and(eq(agentSkills.id, skillId), eq(agentSkills.agentId, agentId))).run();
  if (!r.changes) throw new NotFoundError("Skill");
  return { removed: true };
}
export function listSkills(actor: Actor, agentId: string): AgentSkill[] { return get(actor, agentId).skills; }

/* ------------------------------------------------------------ knowledge */

const knowledgeInput = z.object({ kind: z.enum(["board", "doc"]), refId: idSchema, access: z.enum(["read", "write"]).default("read") });

export function addKnowledge(actor: Actor, agentId: string, input: unknown): KnowledgeDto {
  const agent = loadManaged(actor, agentId);
  const d = parse(knowledgeInput, input);
  // never more than the person granting it may do
  if (d.kind === "board") {
    boardsSvc.get(actor, d.refId);
    if (d.access === "write") assertCan(actor, "board:edit_items", { boardId: d.refId });
    const b = db.select().from(boards).where(eq(boards.id, d.refId)).get();
    if (b?.visibility === "private" && agent.userId) { try { boardsSvc.setMember(actor, d.refId, agent.userId, d.access === "write" ? "editor" : "viewer"); } catch { /* the grant still limits; the board stays private */ } }
  } else {
    const doc = docsSvc.get(actor, d.refId);
    if (d.access === "write" && doc.access !== "edit") throw new ForbiddenError("Je mag dit doc zelf niet bewerken");
  }
  const existing = db.select().from(agentKnowledge).where(and(eq(agentKnowledge.agentId, agentId), eq(agentKnowledge.kind, d.kind), eq(agentKnowledge.refId, d.refId))).get();
  if (existing) db.update(agentKnowledge).set({ access: d.access }).where(eq(agentKnowledge.id, existing.id)).run();
  else db.insert(agentKnowledge).values({ agentId, ...d }).run();
  recordAudit(actor, "ai.agent_knowledge_granted", { targetType: "agent", targetId: agentId, targetName: agent.name, kind: d.kind, refId: d.refId, access: d.access });
  return toDto(load(actor, agentId)).knowledge.find((k) => k.refId === d.refId && k.kind === d.kind)!;
}
export function removeKnowledge(actor: Actor, agentId: string, knowledgeId: string): { removed: true } {
  loadManaged(actor, agentId);
  const r = db.delete(agentKnowledge).where(and(eq(agentKnowledge.id, knowledgeId), eq(agentKnowledge.agentId, agentId))).run();
  if (!r.changes) throw new NotFoundError("Knowledge");
  return { removed: true };
}
export function listKnowledge(actor: Actor, agentId: string): KnowledgeDto[] { return get(actor, agentId).knowledge; }

/* ------------------------------------------------------------ catalogue */

export interface CatalogEntry { key: string; name: string; description: { nl: string; en: string }; avatar: string; needsBoard: boolean; boardHint: string | null; boardAccess: "read" | "write" | null; triggers: string[]; installed: number; native: boolean }

export function catalog(actor: Actor): { templates: CatalogEntry[]; tools: { name: string; write: boolean; description: string }[] } {
  requireMember(actor);
  const have = db.select({ key: agents.templateKey }).from(agents).where(and(eq(agents.accountId, actor.accountId), eq(agents.state, "active"))).all();
  return {
    templates: AGENT_TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description, avatar: t.avatar, needsBoard: !!t.needsBoard, boardHint: t.needsBoard?.hint ?? null, boardAccess: t.needsBoard?.access ?? null, triggers: t.triggers.map((x) => x.type), installed: have.filter((h) => h.key === t.key).length, native: !!t.native })),
    tools: agentToolCatalog().map((t) => ({ name: t.name, write: t.write, description: t.description })),
  };
}
export const toolSchemas = () => toLlmTools(agentToolCatalog());

const installInput = z.object({ templateKey: z.string(), boardId: idSchema.optional(), name: z.string().trim().min(1).max(120).optional(), activate: z.boolean().default(false), userId: idSchema.nullish() });

/** Create an agent from a ready-made template (triggers, skills and knowledge included). Starts as draft unless `activate`. */
export function installTemplate(actor: Actor, input: unknown): AgentDto {
  requireMember(actor);
  const d = parse(installInput, input);
  const tpl = getTemplate(d.templateKey);
  if (!tpl) throw new NotFoundError("Template");
  let boardId = d.boardId;
  if (tpl.needsBoard && !boardId) {
    const hint = tpl.needsBoard.hint.toLowerCase();
    const cands = boardsSvc.list(actor).filter((b) => (tpl.needsBoard!.kind ? b.kind === tpl.needsBoard!.kind : b.kind === "board" || b.kind === "dev_sprints"));
    boardId = (cands.find((b) => b.name.toLowerCase().includes(hint)) ?? (tpl.needsBoard.kind ? cands[0] : undefined))?.id;
    if (!boardId) throw new ValidationError(`Kies een board voor ${tpl.name}`);
  }
  if (boardId) boardsSvc.get(actor, boardId);
  const agent = create(actor, { name: d.name ?? tpl.name, description: tpl.description.nl, avatar: tpl.avatar, instructions: tpl.instructions, templateKey: tpl.key, status: d.activate ? "active" : "draft", userId: d.userId });
  for (const t of tpl.triggers) {
    if (t.type === "manual") continue;
    addTrigger(actor, agent.id, { type: t.type, config: t.type === "schedule" ? t.config : { ...(t.config ?? {}), ...(boardId ? { boardId } : {}) } });
  }
  for (const s of tpl.skills) addSkill(actor, agent.id, s);
  if (boardId && tpl.needsBoard) addKnowledge(actor, agent.id, { kind: "board", refId: boardId, access: tpl.needsBoard.access });
  return get(actor, agent.id);
}

/* ------------------------------------------------------------ runs */

const runInput = z.object({ input: z.string().max(4000).optional(), itemId: idSchema.optional(), boardId: idSchema.optional() });

/** Manual / test run. Returns the finished run row (transcript, tool calls, cost). */
export async function run(actor: Actor, id: string, input: unknown = {}): Promise<AgentRun> {
  loadManaged(actor, id);
  const d = parse(runInput, input);
  if (d.boardId) boardsSvc.get(actor, d.boardId); // the person starting the run must be able to see what they point it at
  return executeAgent(id, { type: "manual", itemId: d.itemId ?? null, boardId: d.boardId ?? null }, { startedBy: actor.isSystem ? null : actor.id, input: d.input });
}

export function listRuns(actor: Actor, id: string, opts: { limit?: number } = {}): AgentRun[] {
  load(actor, id);
  requireMember(actor);
  return db.select().from(agentRuns).where(eq(agentRuns.agentId, id)).orderBy(desc(agentRuns.createdAt), desc(agentRuns.id)).limit(Math.min(opts.limit ?? 30, 200)).all();
}
export function getRun(actor: Actor, runId: string): AgentRun {
  requireMember(actor);
  const r = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
  if (!r || r.accountId !== actor.accountId) throw new NotFoundError("Run");
  return r;
}

/** AI users (Scout, Aide, ...) that can be linked as an agent identity. */
export function identities(actor: Actor): { id: string; name: string; linkedAgentId: string | null }[] {
  requireMember(actor);
  const linked = new Map(db.select({ uid: agents.userId, id: agents.id }).from(agents).where(and(eq(agents.accountId, actor.accountId), eq(agents.state, "active"))).all().filter((a) => a.uid).map((a) => [a.uid!, a.id]));
  return db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.accountId, actor.accountId), eq(users.isAiAgent, true), eq(users.isActive, true))).all().map((u) => ({ ...u, linkedAgentId: linked.get(u.id) ?? null }));
}

export { drainAgents, tickSchedules, handleEvent } from "../ai/agent-engine";
