/** Shared helpers for MCP tools (input normalisation, JSON args, scope guard, availability). */
import { z } from "zod";
import type { Actor } from "@/lib/actor";
import { idSchema } from "@/lib/zod-schemas";
import { ValidationError } from "@/lib/errors";
import * as services from "@/server/services";
import { assertBoardInScope, assertItemInScope, assertWorkspaceInScope } from "@/server/platform/scope";

export const id = idSchema;
export const idList = z.array(idSchema);
/** object or a JSON string holding an object (LLMs often send either) */
export const jsonObject = z.union([z.record(z.string(), z.unknown()), z.string()]).transform((v, ctx) => {
  if (typeof v !== "string") return v;
  try {
    const p = JSON.parse(v);
    if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
  } catch { /* fallthrough */ }
  ctx.addIssue({ code: "custom", message: "must be a JSON object" });
  return z.NEVER;
});
export const jsonArray = z.union([z.array(z.unknown()), z.string()]).transform((v, ctx) => {
  if (typeof v !== "string") return v;
  try {
    const p = JSON.parse(v);
    if (Array.isArray(p)) return p;
  } catch { /* fallthrough */ }
  ctx.addIssue({ code: "custom", message: "must be a JSON array" });
  return z.NEVER;
});

export const toSnake = (k: string): string => k.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** camelCase top-level keys -> snake_case (clients send either). */
export function normalizeArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) out[toSnake(k)] = v;
  return out;
}

export class NotAvailableError extends Error {
  constructor(what: string) {
    super(`${what} is not available yet in this installation.`);
    this.name = "NotAvailableError";
  }
}

/** A service another agent may not have shipped yet. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function optionalService(name: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (services as Record<string, any>)[name];
  if (!s) throw new NotAvailableError(`Service "${name}"`);
  return s;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function optionalFn(service: string, fn: string): (...a: any[]) => any {
  const s = optionalService(service);
  if (typeof s[fn] !== "function") throw new NotAvailableError(`${service}.${fn}`);
  return s[fn].bind(s);
}

const READ_RE = /^(get_|list_|read_|search|all_|board_insights|show_|workspace_info|form_questions_editor_read|agent_catalog|plan_workflow)/;
export const isReadOnlyTool = (t: { name: string; readOnly?: boolean }): boolean => t.readOnly ?? READ_RE.test(t.name);

const DESTRUCTIVE_RE = /^(delete|remove|archive|purge)_/;
const IDEMPOTENT_RE = /^(update|change|move|set|archive|delete)_/;
const humanize = (name: string) => name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** MCP tool annotations (title + behaviour hints) for tools/list. */
export function toolAnnotations(t: { name: string; title?: string; readOnly?: boolean; destructive?: boolean; idempotent?: boolean }) {
  const readOnly = isReadOnlyTool(t);
  return {
    title: t.title ?? humanize(t.name),
    readOnlyHint: readOnly,
    destructiveHint: !readOnly && (t.destructive ?? DESTRUCTIVE_RE.test(t.name)),
    idempotentHint: readOnly || (t.idempotent ?? IDEMPOTENT_RE.test(t.name)),
    openWorldHint: false,
  };
}

/** Enforce a token's workspace restriction from whatever id-like keys the input carries. */
export function guardInputScope(actor: Actor, input: Record<string, unknown>): void {
  if (!actor.token?.workspaceIds) return;
  const each = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined || v === null ? [] : [String(v)]);
  for (const b of [...each(input.board_id), ...each(input.board_ids)]) assertBoardInScope(actor, b);
  for (const w of [...each(input.workspace_id), ...each(input.workspace_ids)]) assertWorkspaceInScope(actor, w);
  for (const i of [...each(input.item_id), ...each(input.parent_item_id), ...each(input.item_ids)]) assertItemInScope(actor, i);
  if (input.object_type && input.object_id && String(input.object_type).toLowerCase() === "board") assertBoardInScope(actor, String(input.object_id));
}

/** Error that tools can throw to return a clean message to the model. */
export class ToolError extends ValidationError {}
