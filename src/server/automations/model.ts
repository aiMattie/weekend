/**
 * Durable automation model (JSON stored in automations.definition). Pure: no db, no React.
 *
 *   trigger      "when ..."   one block (type + config)
 *   conditions   "if ..."     optional AND/OR group of condition blocks
 *   steps        "then ..."   ordered list: action | branch (if/else) | approval
 *
 * Plain automations only use action steps. Workflows (canvas) also use branch and approval steps.
 * Steps are compiled to a flat program (`compileSteps`) so a run can resume at a program counter
 * after a retry or an approval.
 */
import { z } from "zod";

export const MAX_DEPTH = 5;
export const MAX_ATTEMPTS = 3;
/** minutes to wait before attempt 2, 3 ... */
export const RETRY_BACKOFF_MINUTES = [1, 5, 15];

export interface BlockRef { type: string; config: Record<string, unknown> }
export interface ConditionGroup { op: "and" | "or"; conditions: (BlockRef | ConditionGroup)[] }
export type Step =
  | { id: string; type: "action"; block: string; config: Record<string, unknown> }
  | { id: string; type: "branch"; condition: ConditionGroup; then: Step[]; else: Step[] }
  | { id: string; type: "approval"; approverIds: string[]; approverColumnId?: string; message?: string };
export interface AutomationDefinition { trigger: BlockRef; conditions?: ConditionGroup; steps: Step[] }

/** What started a run, kept on the run row so a retry can replay it without the live event. */
export interface TriggerSnapshot {
  type: string;
  at: string;
  itemId?: string | null;
  boardId?: string | null;
  /** event-derived values for templates: {from}, {to}, {column}, {user} ... */
  vars: Record<string, string>;
  /** the raw bus event or scheduler payload */
  event?: Record<string, unknown>;
}

export interface RunStep { pc: number; id?: string; block: string; status: "ok" | "failed" | "skipped"; error?: string; at: string; output?: string }

const blockRef: z.ZodType<BlockRef> = z.object({ type: z.string().min(1), config: z.record(z.string(), z.unknown()).default({}) });
export const conditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.object({ op: z.enum(["and", "or"]).default("and"), conditions: z.array(z.union([blockRef, conditionGroupSchema])).max(25) }),
);
const idLike = z.string().min(1).max(64);
export const stepSchema: z.ZodType<Step> = z.lazy(() =>
  z.union([
    z.object({ id: idLike.optional(), type: z.literal("action"), block: z.string().min(1), config: z.record(z.string(), z.unknown()).default({}) }),
    z.object({ id: idLike.optional(), type: z.literal("branch"), condition: conditionGroupSchema, then: z.array(stepSchema).max(50).default([]), else: z.array(stepSchema).max(50).default([]) }),
    z.object({ id: idLike.optional(), type: z.literal("approval"), approverIds: z.array(z.string()).default([]), approverColumnId: z.string().optional(), message: z.string().max(1000).optional() }),
  ]).transform((s) => ({ ...s, id: s.id ?? Math.random().toString(36).slice(2, 10) }) as Step),
);

export const definitionSchema: z.ZodType<AutomationDefinition> = z.object({
  trigger: blockRef,
  conditions: conditionGroupSchema.optional(),
  steps: z.array(stepSchema).min(1, "Add at least one action").max(50),
});

export const isGroup = (c: BlockRef | ConditionGroup): c is ConditionGroup => "conditions" in c;

/* ----------------------------------------------------------- compiled program */

export type Instruction =
  | { op: "action"; id: string; block: string; config: Record<string, unknown> }
  | { op: "jumpIfNot"; id: string; condition: ConditionGroup; to: number }
  | { op: "jump"; to: number }
  | { op: "approval"; id: string; approverIds: string[]; approverColumnId?: string; message?: string };

export function compileSteps(steps: Step[], out: Instruction[] = []): Instruction[] {
  for (const s of steps) {
    if (s.type === "action") out.push({ op: "action", id: s.id, block: s.block, config: s.config });
    else if (s.type === "approval") out.push({ op: "approval", id: s.id, approverIds: s.approverIds, approverColumnId: s.approverColumnId, message: s.message });
    else {
      const jin: Instruction = { op: "jumpIfNot", id: s.id, condition: s.condition, to: -1 };
      out.push(jin);
      compileSteps(s.then, out);
      const jend: Instruction = { op: "jump", to: -1 };
      out.push(jend);
      jin.to = out.length;
      compileSteps(s.else, out);
      jend.to = out.length;
    }
  }
  return out;
}

/** Flat list of every action block used (for validation / usage display). */
export function listActionBlocks(steps: Step[]): string[] {
  return steps.flatMap((s) => (s.type === "action" ? [s.block] : s.type === "branch" ? [...listActionBlocks(s.then), ...listActionBlocks(s.else)] : []));
}

/** Replace `{item}`-style tokens. Unknown tokens stay untouched. */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([a-zA-Z_][\w.]*)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}
