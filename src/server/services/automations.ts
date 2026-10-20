/**
 * Automations service: CRUD, toggle, recipes, run log, button clicks, natural language create and
 * the workflow functions (planWorkflow/createWorkflow/updateWorkflow/publishWorkflow). Used by REST,
 * the UI, MCP and GraphQL. The engine itself lives in src/server/automations/.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { NotFoundError, ValidationError } from "../../lib/errors";
import { assertCan } from "../../lib/permissions";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { automationRuns, automations, type RunStatus } from "../../db/schema/automations";
import { getBlock, listBlocks } from "../automations/blocks/registry";
import type { AutomationBlock, FieldSpec } from "../automations/blocks/types";
import { decideApproval, executeRun, startEngine, usage } from "../automations/engine";
import { definitionSchema, isGroup, type AutomationDefinition, type BlockRef, type ConditionGroup, type Step } from "../automations/model";
import { parseAutomationText, type ParseContext } from "../automations/nl-parser";
import { buildRecipe, getRecipe, RECIPE_CATEGORIES, recipeCatalog } from "../automations/recipes";
import { items } from "../../db/schema/core";
import { parse, record, requireBoard } from "./_shared";
import * as boardsSvc from "./boards";
import * as columnsSvc from "./columns";
import * as groupsSvc from "./groups";
import * as usersSvc from "./users";

export type Automation = typeof automations.$inferSelect;
export type AutomationRun = typeof automationRuns.$inferSelect;

startEngine();

/* ------------------------------------------------------------ normalisation + validation */

interface BoardCtx { parse: ParseContext; boardId: string }

function boardContext(actor: Actor, boardId: string): BoardCtx {
  const cols = columnsSvc.list(actor, boardId, "item");
  return {
    boardId,
    parse: {
      columns: cols.map((c) => ({ id: c.id, key: c.key, title: c.title, type: c.type, settings: c.settings })),
      groups: groupsSvc.list(actor, boardId).map((g) => ({ id: g.id, title: g.title })),
      users: usersSvc.list(actor).map((u) => ({ id: u.id, name: u.name, email: u.email })),
      boards: boardsSvc.list(actor).map((b) => ({ id: b.id, name: b.name })),
    },
  };
}

const eqi = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Resolve names/keys to ids (columns, labels, groups, users) so MCP/text creation can use readable values. */
function normalizeConfig(block: AutomationBlock, config: Record<string, unknown>, bc: BoardCtx): Record<string, unknown> {
  const out = { ...config };
  const cols = bc.parse.columns;
  const resolveCol = (v: unknown) => { const s = String(v ?? ""); return cols.find((c) => c.id === s) ?? cols.find((c) => c.key === s) ?? cols.find((c) => eqi(c.title, s)); };
  const each = (f: FieldSpec, fn: (v: unknown) => unknown) => {
    const v = out[f.key];
    if (v === undefined || v === null || v === "") return;
    out[f.key] = Array.isArray(v) ? v.map(fn) : fn(v);
  };
  for (const f of block.fields) {
    if (f.kind === "column" && !f.boardField) each(f, (v) => resolveCol(v)?.id ?? v);
    else if (f.kind === "group" && !f.boardField) each(f, (v) => bc.parse.groups.find((g) => g.id === String(v) || eqi(g.title, String(v)))?.id ?? v);
    else if (f.kind === "board") each(f, (v) => bc.parse.boards.find((b) => b.id === String(v) || eqi(b.name, String(v)))?.id ?? v);
    else if (f.kind === "user" || f.kind === "users") each(f, (v) => (String(v).startsWith("@") ? v : bc.parse.users.find((u) => u.id === String(v) || eqi(u.name, String(v)) || eqi(u.email, String(v)))?.id ?? v));
  }
  for (const f of block.fields.filter((x) => x.kind === "label")) {
    const col = resolveCol(out[f.of ?? "columnId"]);
    const raw = out[f.key];
    if (col && raw !== undefined && raw !== null && raw !== "" && !/^\d+$/.test(String(raw))) {
      const labels = (col.settings.labels as { id: number; text: string }[] | undefined) ?? [];
      const hit = labels.find((l) => eqi(l.text, String(raw)));
      if (!hit) throw new ValidationError(`Unknown label "${raw}" for column "${col.title}"`);
      out[f.key] = String(hit.id);
    }
  }
  return out;
}

function normalizeGroup(g: ConditionGroup, bc: BoardCtx): ConditionGroup {
  return { ...g, conditions: g.conditions.map((c): BlockRef | ConditionGroup => (isGroup(c) ? normalizeGroup(c, bc) : normalizeRef(c, "condition", bc))) };
}
function normalizeRef(ref: BlockRef, kind: AutomationBlock["kind"], bc: BoardCtx): BlockRef {
  const block = getBlock(ref.type);
  if (!block || block.kind !== kind) throw new ValidationError(`Unknown ${kind} "${ref.type}"`);
  const config = normalizeConfig(block, ref.config ?? {}, bc);
  const parsed = block.configSchema.safeParse(config);
  if (!parsed.success) throw new ValidationError(`${block.label}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "config"} ${i.message}`).join("; ")}`);
  return { type: ref.type, config: parsed.data as Record<string, unknown> };
}
function normalizeSteps(steps: Step[], bc: BoardCtx): Step[] {
  return steps.map((s): Step => {
    if (s.type === "action") { const r = normalizeRef({ type: s.block, config: s.config }, "action", bc); return { ...s, block: r.type, config: r.config }; }
    if (s.type === "branch") return { ...s, condition: normalizeGroup(s.condition, bc), then: normalizeSteps(s.then, bc), else: normalizeSteps(s.else, bc) };
    return s;
  });
}

/** Validate + normalise a definition for a board. Throws ValidationError with a readable message. */
export function normalizeDefinition(actor: Actor, boardId: string, input: unknown): AutomationDefinition {
  const def = parse(definitionSchema, input);
  const bc = boardContext(actor, boardId);
  return { trigger: normalizeRef(def.trigger, "trigger", bc), conditions: def.conditions ? normalizeGroup(def.conditions, bc) : undefined, steps: normalizeSteps(def.steps, bc) };
}

/* ------------------------------------------------------------ CRUD */

const stepAlias = z.object({ block: z.string().optional(), type: z.string().optional(), config: z.record(z.string(), z.unknown()).optional() }).passthrough();
const createInput = z.object({
  boardId: idSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullish(),
  trigger: z.object({ type: z.string(), config: z.record(z.string(), z.unknown()).default({}) }),
  conditions: z.unknown().optional(),
  steps: z.array(stepAlias).optional(),
  /** MCP friendly alias: [{ type|block: "set_status", config }] */
  actions: z.array(stepAlias).optional(),
  recipeId: z.string().nullish(),
  active: z.boolean().default(true),
  kind: z.enum(["automation", "workflow"]).default("automation"),
  graph: z.record(z.string(), z.unknown()).default({}),
});

function toSteps(raw: z.infer<typeof stepAlias>[]): unknown[] {
  return raw.map((s) => (s.type === "branch" || s.type === "approval" || (s.type === "action" && s.block)) ? s : { type: "action", block: s.block ?? s.type, config: s.config ?? {} });
}
function conditionsInput(c: unknown): unknown {
  if (!c) return undefined;
  if (Array.isArray(c)) return { op: "and", conditions: c };
  return c;
}

function load(id: string): Automation {
  const a = db.select().from(automations).where(eq(automations.id, id)).get();
  if (!a || a.state === "deleted") throw new NotFoundError("Automation");
  return a;
}
function loadFor(actor: Actor, id: string, action: "board:view" | "board:edit_structure"): Automation {
  const a = load(id);
  if (a.accountId !== actor.accountId) throw new NotFoundError("Automation");
  if (a.boardId) requireBoard(actor, a.boardId, action);
  else assertCan(actor, "account:manage");
  return a;
}

export type AutomationListItem = Automation & { lastRunStatus: RunStatus | null };

export function list(actor: Actor, input: { boardId?: string | null; kind?: "automation" | "workflow" } = {}): AutomationListItem[] {
  if (input.boardId) requireBoard(actor, input.boardId, "board:view");
  else assertCan(actor, "account:manage");
  const rows = db.select().from(automations)
    .where(and(eq(automations.accountId, actor.accountId), eq(automations.state, "active"), input.boardId ? eq(automations.boardId, input.boardId) : undefined, input.kind ? eq(automations.kind, input.kind) : undefined))
    .orderBy(asc(automations.createdAt)).all();
  const last = new Map<string, RunStatus>();
  if (rows.length) {
    for (const r of db.select({ a: automationRuns.automationId, s: automationRuns.status }).from(automationRuns).where(inArray(automationRuns.automationId, rows.map((x) => x.id))).orderBy(asc(automationRuns.createdAt), asc(automationRuns.id)).all()) last.set(r.a, r.s);
  }
  return rows.map((a) => ({ ...a, lastRunStatus: last.get(a.id) ?? null }));
}

export function get(actor: Actor, id: string): Automation { return loadFor(actor, id, "board:view"); }

export function create(actor: Actor, input: unknown): Automation {
  const d = parse(createInput, input);
  requireBoard(actor, d.boardId, "board:edit_structure");
  const isWorkflow = d.kind === "workflow";
  const def = normalizeDefinition(actor, d.boardId, { trigger: d.trigger, conditions: conditionsInput(d.conditions), steps: toSteps(d.steps ?? d.actions ?? []) });
  const row = db.insert(automations).values({
    accountId: actor.accountId, boardId: d.boardId, name: d.name, description: d.description ?? null, kind: d.kind, active: isWorkflow ? false : d.active,
    status: isWorkflow ? "draft" : "published", definition: def, graph: d.graph, recipeId: d.recipeId ?? null, createdBy: actor.isSystem ? null : actor.id,
  }).returning().get();
  record(actor, { type: "board.updated", boardId: d.boardId }, { event: "create_automation", data: { name: d.name, automationId: row.id } });
  return row;
}

const updateInput = z.object({
  name: z.string().trim().min(1).max(200).optional(), description: z.string().max(2000).nullish(),
  trigger: z.object({ type: z.string(), config: z.record(z.string(), z.unknown()).default({}) }).optional(),
  conditions: z.unknown().optional(), steps: z.array(stepAlias).optional(), actions: z.array(stepAlias).optional(),
  active: z.boolean().optional(), graph: z.record(z.string(), z.unknown()).optional(),
});

export function update(actor: Actor, id: string, input: unknown): Automation {
  const d = parse(updateInput, input);
  const cur = loadFor(actor, id, "board:edit_structure");
  const patch: Partial<Automation> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.description !== undefined) patch.description = d.description ?? null;
  if (d.graph) patch.graph = d.graph;
  if (d.active !== undefined) patch.active = d.active && !(cur.kind === "workflow" && cur.status === "draft");
  if (d.trigger || d.conditions !== undefined || d.steps || d.actions) {
    if (!cur.boardId) throw new ValidationError("Automation has no board");
    patch.definition = normalizeDefinition(actor, cur.boardId, {
      trigger: d.trigger ?? cur.definition.trigger,
      conditions: d.conditions !== undefined ? conditionsInput(d.conditions) : cur.definition.conditions,
      steps: d.steps || d.actions ? toSteps(d.steps ?? d.actions ?? []) : cur.definition.steps,
    });
  }
  // editing a published workflow turns it back into a draft until it is published again
  if (patch.definition && cur.kind === "workflow" && cur.status === "published") { patch.status = "draft"; patch.active = false; }
  return Object.keys(patch).length ? db.update(automations).set(patch).where(eq(automations.id, id)).returning().get() : cur;
}

export function toggle(actor: Actor, id: string, active?: boolean): Automation {
  const cur = loadFor(actor, id, "board:edit_structure");
  const next = active ?? !cur.active;
  if (next && cur.status === "draft") throw new ValidationError("Publish the workflow before activating it");
  return db.update(automations).set({ active: next }).where(eq(automations.id, id)).returning().get();
}

export function remove(actor: Actor, id: string): void {
  loadFor(actor, id, "board:edit_structure");
  db.update(automations).set({ state: "deleted", active: false }).where(eq(automations.id, id)).run();
}

export function duplicate(actor: Actor, id: string): Automation {
  const cur = loadFor(actor, id, "board:edit_structure");
  return db.insert(automations).values({
    accountId: cur.accountId, boardId: cur.boardId, name: `${cur.name} (kopie)`, description: cur.description, kind: cur.kind, active: false, status: cur.status,
    definition: cur.definition, graph: cur.graph, recipeId: cur.recipeId, createdBy: actor.isSystem ? null : actor.id,
  }).returning().get();
}

/* ------------------------------------------------------------ recipes + catalog */

export function createFromRecipe(actor: Actor, input: unknown): Automation {
  const d = parse(z.object({ boardId: idSchema, recipeId: z.string(), values: z.record(z.string(), z.unknown()).default({}), name: z.string().trim().max(200).optional() }), input);
  const recipe = getRecipe(d.recipeId);
  if (!recipe) throw new NotFoundError("Recipe");
  const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
  const missing = recipe.tokens.filter((t) => ["column", "label", "value", "users", "board", "integration", "item", "url"].includes(t.kind) && empty(d.values[t.key])).map((t) => t.key);
  if (missing.length) throw new ValidationError(`Fill in: ${missing.join(", ")}`);
  return create(actor, { boardId: d.boardId, name: d.name || recipe.sentence.en.replace(/\[(\w+)\]/g, (_m, k: string) => String(d.values[k] ?? k)).slice(0, 190), ...buildRecipe(recipe, d.values), recipeId: recipe.id });
}

const txt = (t: { nl: string; en: string }) => t;
export function catalog(actor: Actor, input: { boardId?: string } = {}) {
  if (input.boardId) requireBoard(actor, input.boardId, "board:view");
  const blocks = listBlocks().map((b) => ({ id: b.id, kind: b.kind, label: b.label, title: txt(b.title), category: b.category, fields: b.fields, schedule: !!b.schedule, needsItem: !!b.needsItem }));
  return { blocks, recipes: recipeCatalog(), categories: RECIPE_CATEGORIES, usage: input.boardId ? usage(actor.accountId, input.boardId) : null };
}

/* ------------------------------------------------------------ runs */

export function listRuns(actor: Actor, input: { automationId?: string; boardId?: string; status?: RunStatus; limit?: number } = {}): AutomationRun[] {
  let boardId = input.boardId;
  if (input.automationId) boardId = loadFor(actor, input.automationId, "board:view").boardId ?? undefined;
  if (boardId) requireBoard(actor, boardId, "board:view");
  else assertCan(actor, "account:manage");
  return db.select().from(automationRuns)
    .where(and(eq(automationRuns.accountId, actor.accountId), input.automationId ? eq(automationRuns.automationId, input.automationId) : boardId ? eq(automationRuns.boardId, boardId) : undefined, input.status ? eq(automationRuns.status, input.status) : undefined))
    .orderBy(desc(automationRuns.createdAt), desc(automationRuns.id)).limit(Math.min(input.limit ?? 50, 500)).all();
}

function loadRun(actor: Actor, runId: string): AutomationRun {
  const r = db.select().from(automationRuns).where(eq(automationRuns.id, runId)).get();
  if (!r || r.accountId !== actor.accountId) throw new NotFoundError("Run");
  if (r.boardId) requireBoard(actor, r.boardId, "board:view");
  return r;
}
export const getRun = (actor: Actor, runId: string): AutomationRun => loadRun(actor, runId);

/** Retry a failed/skipped run from its failing step. */
export async function retryRun(actor: Actor, runId: string): Promise<AutomationRun> {
  const r = loadRun(actor, runId);
  if (r.boardId) requireBoard(actor, r.boardId, "board:edit_structure");
  if (r.status !== "failed" && r.status !== "retrying") throw new ValidationError("Only failed runs can be retried");
  db.update(automationRuns).set({ attempt: 1, status: "running", finishedAt: null }).where(eq(automationRuns.id, runId)).run();
  return executeRun(runId);
}

/** Approve/reject a run waiting on an approval step (workflows). */
export async function decideRun(actor: Actor, runId: string, approve: boolean): Promise<AutomationRun> {
  loadRun(actor, runId);
  try { return await decideApproval(runId, approve, { id: actor.id, name: actor.name }); }
  catch (e) { throw new ValidationError(e instanceof Error ? e.message : String(e)); }
}

export function listPendingApprovals(actor: Actor): AutomationRun[] {
  return db.select().from(automationRuns).where(and(eq(automationRuns.accountId, actor.accountId), eq(automationRuns.status, "waiting_approval"))).orderBy(desc(automationRuns.createdAt)).all()
    .filter((r) => ((r.approval?.approverIds as string[] | undefined) ?? []).includes(actor.id) || actor.role === "admin");
}

/** Button column click (also called by the columns module through the bus event). */
export function clickButton(actor: Actor, input: unknown): { ok: true } {
  const d = parse(z.object({ itemId: idSchema, columnId: idSchema }), input);
  const row = getItemBoard(d.itemId);
  requireBoard(actor, row.boardId, "board:edit_items");
  record(actor, { type: "button.clicked", boardId: row.boardId, itemId: d.itemId, columnId: d.columnId }, { event: "button_clicked", itemId: d.itemId, columnId: d.columnId });
  return { ok: true };
}
function getItemBoard(itemId: string): { boardId: string } {
  const r = db.select({ boardId: items.boardId, state: items.state }).from(items).where(eq(items.id, itemId)).get();
  if (!r || r.state === "deleted") throw new NotFoundError("Item");
  return r;
}

/* ------------------------------------------------------------ natural language */

export function planFromText(actor: Actor, input: unknown): { name: string; definition: AutomationDefinition | null; notes: string[] } {
  const d = parse(z.object({ boardId: idSchema, text: z.string().min(3).max(2000) }), input);
  requireBoard(actor, d.boardId, "board:view");
  const r = parseAutomationText(d.text, boardContext(actor, d.boardId).parse);
  return { name: r.name, definition: r.definition, notes: r.notes };
}

/** Create an automation from a sentence ("When status changes to Done, move item to group Afgerond"). */
export function createFromText(actor: Actor, input: unknown): Automation {
  const d = parse(z.object({ boardId: idSchema, text: z.string().min(3).max(2000), name: z.string().max(200).optional() }), input);
  const plan = planFromText(actor, d);
  if (!plan.definition) throw new ValidationError(`Could not understand the automation: ${plan.notes.join("; ")}`);
  return create(actor, { boardId: d.boardId, name: d.name || plan.name, ...plan.definition });
}

/* ------------------------------------------------------------ workflows (same engine) */

export function planWorkflow(actor: Actor, input: unknown) { return planFromText(actor, input); }

export function createWorkflow(actor: Actor, input: unknown): Automation {
  const d = parse(z.object({ boardId: idSchema, name: z.string().trim().min(1).max(200).optional(), text: z.string().optional(), definition: z.unknown().optional(), graph: z.record(z.string(), z.unknown()).optional() }), input);
  let definition = d.definition as AutomationDefinition | undefined;
  let name = d.name;
  if (!definition && d.text) {
    const plan = planFromText(actor, { boardId: d.boardId, text: d.text });
    if (!plan.definition) throw new ValidationError(`Could not plan the workflow: ${plan.notes.join("; ")}`);
    definition = plan.definition; name = name ?? plan.name;
  }
  if (!definition) definition = { trigger: { type: "item_created", config: {} }, steps: [{ id: "s1", type: "action", block: "notify", config: { recipients: ["@creator"], message: "{item}" } }] };
  return create(actor, { boardId: d.boardId, name: name ?? "Nieuwe workflow", kind: "workflow", graph: d.graph ?? {}, ...definition });
}

export function updateWorkflow(actor: Actor, id: string, input: unknown): Automation {
  const cur = loadFor(actor, id, "board:edit_structure");
  if (cur.kind !== "workflow") throw new ValidationError("Not a workflow");
  return update(actor, id, input);
}

export function publishWorkflow(actor: Actor, id: string, publish = true): Automation {
  const cur = loadFor(actor, id, "board:edit_structure");
  if (cur.kind !== "workflow") throw new ValidationError("Not a workflow");
  if (publish) normalizeDefinition(actor, cur.boardId!, cur.definition);
  return db.update(automations).set(publish ? { status: "published", active: true } : { status: "draft", active: false }).where(eq(automations.id, id)).returning().get();
}

export { usage };
