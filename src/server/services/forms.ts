/**
 * WorkForms service: forms (with a backing board), questions mapped to columns, publishing.
 * Submissions live in ./forms-submit.ts and are re-exported here so `forms.submit(...)` etc. work.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { randomBytes, scryptSync } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors";
import { assertCan, can } from "../../lib/permissions";
import { hexColor, idSchema, nameSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { formQuestions, forms, type FormSettings } from "../../db/schema/forms";
import { FORM_COLUMN_TYPES, isFormColumnType, isFormKind } from "../../modules/boards-extra/forms/logic";
import type { FormDto, FormWithQuestions, QuestionDto } from "../../modules/boards-extra/forms/types";
import { hasColumnLogic } from "../columns/registry";
import { boardColumns, computePosition, parse, requireBoard, resolveColumn } from "./_shared";
import * as boardsService from "./boards";

export { createSubmission, getPublic, listSubmissions, submit, unlockPublic } from "./forms-submit";

type FormRow = typeof forms.$inferSelect;
type QuestionRow = typeof formQuestions.$inferSelect;

/* ------------------------------------------------------------ dto */

export function toFormDto(row: FormRow): FormDto {
  const { passwordHash, ...rest } = row.settings ?? {};
  return {
    id: row.id, workspaceId: row.workspaceId, boardId: row.boardId, groupId: row.groupId, name: row.name, token: row.token,
    isPublished: row.isPublished, settings: { ...rest, hasPassword: !!passwordHash }, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}
const toQuestionDto = (q: QuestionRow): QuestionDto => ({ ...q, settings: q.settings ?? {} });

export function getFormRow(formId: string): FormRow {
  const f = db.select().from(forms).where(eq(forms.id, formId)).get();
  if (!f || f.state === "deleted") throw new NotFoundError("Form");
  return f;
}
export const getFormByToken = (token: string): FormRow | undefined => {
  const f = db.select().from(forms).where(eq(forms.token, token)).get();
  return f && f.state === "active" ? f : undefined;
};
export const questionRows = (formId: string): QuestionRow[] => db.select().from(formQuestions).where(eq(formQuestions.formId, formId)).orderBy(asc(formQuestions.position)).all();

/** Same format as lib/auth/password.ts (scrypt$salt$hash, 64 bytes) so verifyPassword accepts it. */
const hashPasswordSync = (pw: string): string => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(pw, salt, 64).toString("hex")}`;
};
const newToken = (): string => randomBytes(18).toString("base64url");

/* ------------------------------------------------------------ schemas */

const urlOrPath = z.string().trim().max(2000).refine((v) => v === "" || /^(https?:\/\/|\/)/i.test(v), "Must be an http(s) URL or a /path");
const settingsPatch = z.object({
  description: z.string().max(5000).optional(),
  coverUrl: urlOrPath.nullish(),
  logoUrl: urlOrPath.nullish(),
  primaryColor: hexColor.optional(),
  backgroundColor: hexColor.optional(),
  submitLabel: z.string().trim().max(60).optional(),
  thankYou: z.object({ title: z.string().max(200).optional(), message: z.string().max(5000).optional(), redirectUrl: z.string().trim().max(2000).refine((v) => v === "" || /^https?:\/\//i.test(v), "Redirect must be an http(s) URL").nullish() }).optional(),
  /** plain password to set; null/"" clears it */
  password: z.string().max(200).nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  limitOneResponse: z.boolean().optional(),
  requireLogin: z.boolean().optional(),
}).strict();

const createInput = z.object({ workspaceId: idSchema.optional(), boardId: idSchema.optional(), name: nameSchema });
const updateInput = z.object({ name: nameSchema.optional(), groupId: idSchema.nullish(), settings: settingsPatch.optional() });

const logicSchema = z.object({
  showWhen: z.array(z.object({
    questionId: idSchema,
    op: z.enum(["equals", "not_equals", "contains", "not_empty", "is_empty"]),
    value: z.unknown().optional(),
  })).max(20).optional(),
  match: z.enum(["all", "any"]).optional(),
});
const questionSettings = z.object({
  placeholder: z.string().max(200).optional(),
  optionIds: z.array(z.number().int()).optional(),
  logic: logicSchema.optional(),
}).passthrough();
const questionPatch = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(2000).nullish(),
  required: z.boolean().optional(),
  hidden: z.boolean().optional(),
  settings: questionSettings.optional(),
});
const addInput = questionPatch.extend({
  columnId: z.string().min(1).nullish(),
  kind: z.string().optional(),
  position: z.number().finite().optional(),
  beforeId: idSchema.optional(),
  afterId: idSchema.optional(),
});

/* ------------------------------------------------------------ forms */

function visibleForms(actor: Actor, rows: FormRow[]): FormRow[] {
  return rows.filter((f) => can(actor, "board:view", { boardId: f.boardId }));
}

export function list(actor: Actor, opts: { workspaceId?: string; boardId?: string } = {}): FormDto[] {
  const rows = db.select().from(forms).where(and(
    eq(forms.state, "active"),
    opts.workspaceId ? eq(forms.workspaceId, opts.workspaceId) : undefined,
    opts.boardId ? eq(forms.boardId, opts.boardId) : undefined,
  )).orderBy(desc(forms.createdAt)).all();
  return visibleForms(actor, rows).map(toFormDto);
}

export function get(actor: Actor, formId: string): FormWithQuestions {
  const f = getFormRow(formId);
  requireBoard(actor, f.boardId, "board:view");
  return { form: toFormDto(f), questions: questionRows(formId).map(toQuestionDto) };
}

/** Create a form. With `boardId` it attaches to that board; else a new backing board is created in `workspaceId`. */
export function create(actor: Actor, input: unknown): FormWithQuestions {
  const d = parse(createInput, input);
  let boardId = d.boardId;
  let workspaceId: string;
  if (boardId) {
    const b = requireBoard(actor, boardId, "board:edit_structure");
    workspaceId = b.workspaceId;
  } else {
    if (!d.workspaceId) throw new ValidationError("workspaceId or boardId is required");
    workspaceId = d.workspaceId;
    boardId = boardsService.create(actor, { workspaceId, name: d.name }).id;
  }
  const row = db.transaction(() => {
    const f = db.insert(forms).values({
      workspaceId, boardId: boardId!, name: d.name, token: newToken(), isPublished: false, createdBy: actor.isSystem ? null : actor.id,
      settings: { submitLabel: "Verzenden", primaryColor: "#0073ea", backgroundColor: "#f6f7fb", thankYou: { title: "Bedankt!", message: "Je antwoord is verstuurd.", redirectUrl: null } },
    }).returning().get();
    let pos = 1000;
    db.insert(formQuestions).values({ formId: f.id, columnId: null, kind: "name", title: "Name", required: true, position: pos }).run();
    for (const c of boardColumns(boardId!, "item")) {
      if (c.archived || !isFormColumnType(c.type) || !hasColumnLogic(c.type)) continue;
      pos += 1000;
      db.insert(formQuestions).values({ formId: f.id, columnId: c.id, kind: c.type, title: c.title, position: pos, hidden: c.type === "people" }).run();
    }
    return f;
  });
  return { form: toFormDto(row), questions: questionRows(row.id).map(toQuestionDto) };
}

export function update(actor: Actor, formId: string, input: unknown): FormDto {
  const d = parse(updateInput, input);
  const cur = getFormRow(formId);
  requireBoard(actor, cur.boardId, "board:edit_structure");
  const settings: FormSettings = { ...(cur.settings ?? {}) };
  const patch = d.settings;
  if (patch) {
    const { password, thankYou, ...rest } = patch;
    Object.assign(settings, rest);
    if (thankYou) settings.thankYou = { ...(settings.thankYou ?? {}), ...thankYou };
    if (password !== undefined) settings.passwordHash = password ? hashPasswordSync(password) : null;
  }
  const row = db.update(forms).set({
    ...(d.name !== undefined ? { name: d.name } : {}),
    ...(d.groupId !== undefined ? { groupId: d.groupId ?? null } : {}),
    settings,
  }).where(eq(forms.id, formId)).returning().get();
  return toFormDto(row);
}

export function setPublished(actor: Actor, formId: string, published: boolean): FormDto {
  const cur = getFormRow(formId);
  requireBoard(actor, cur.boardId, "board:edit_structure");
  return toFormDto(db.update(forms).set({ isPublished: published }).where(eq(forms.id, formId)).returning().get());
}

export function remove(actor: Actor, formId: string): void {
  const cur = getFormRow(formId);
  requireBoard(actor, cur.boardId, "board:edit_structure");
  db.update(forms).set({ state: "deleted", isPublished: false }).where(eq(forms.id, formId)).run();
}

/** New public token (invalidates the old link). */
export function regenerateToken(actor: Actor, formId: string): FormDto {
  const cur = getFormRow(formId);
  requireBoard(actor, cur.boardId, "board:edit_structure");
  return toFormDto(db.update(forms).set({ token: newToken() }).where(eq(forms.id, formId)).returning().get());
}

/* ------------------------------------------------------------ questions */

function requireFormEdit(actor: Actor, formId: string): FormRow {
  const f = getFormRow(formId);
  assertCan(actor, "board:edit_structure", { boardId: f.boardId });
  return f;
}

function checkLogic(formId: string, selfId: string | null, settings: { logic?: z.infer<typeof logicSchema> } | undefined): void {
  const rules = settings?.logic?.showWhen ?? [];
  if (!rules.length) return;
  const ids = new Set(questionRows(formId).map((q) => q.id));
  for (const r of rules) {
    if (r.questionId === selfId) throw new ValidationError("A question cannot depend on itself");
    if (!ids.has(r.questionId)) throw new ValidationError(`Logic refers to unknown question ${r.questionId}`);
  }
}

export function addQuestion(actor: Actor, formId: string, input: unknown): QuestionDto {
  const d = parse(addInput, input);
  const f = requireFormEdit(actor, formId);
  let kind = d.kind ?? "";
  let columnId: string | null = null;
  let title = d.title;
  if (d.columnId) {
    const col = resolveColumn(f.boardId, d.columnId);
    if (col.boardId !== f.boardId || col.scope !== "item" || !isFormColumnType(col.type) || !hasColumnLogic(col.type)) {
      throw new ValidationError(`Column type "${col.type}" cannot be used in a form (supported: ${FORM_COLUMN_TYPES.join(", ")})`);
    }
    if (questionRows(formId).some((q) => q.columnId === col.id)) throw new ConflictError(`Column "${col.title}" already has a question`);
    kind = col.type;
    columnId = col.id;
    title ??= col.title;
  } else {
    if (kind === "name") {
      if (questionRows(formId).some((q) => q.kind === "name")) throw new ConflictError("The form already has a name question");
    } else if (kind !== "section") throw new ValidationError("A question needs a columnId, or kind \"name\" / \"section\"");
    if (!isFormKind(kind)) throw new ValidationError(`Unknown question kind "${kind}"`);
    title ??= kind === "name" ? "Name" : "Section";
  }
  checkLogic(formId, null, d.settings);
  const siblings = questionRows(formId);
  const row = db.insert(formQuestions).values({
    formId, columnId, kind, title: title!, description: d.description ?? null, required: d.required ?? kind === "name", hidden: d.hidden ?? false,
    position: computePosition(siblings, d), settings: (d.settings ?? {}) as QuestionRow["settings"],
  }).returning().get();
  return toQuestionDto(row);
}

export function updateQuestion(actor: Actor, formId: string, questionId: string, input: unknown): QuestionDto {
  const d = parse(questionPatch, input);
  requireFormEdit(actor, formId);
  const cur = db.select().from(formQuestions).where(and(eq(formQuestions.id, questionId), eq(formQuestions.formId, formId))).get();
  if (!cur) throw new NotFoundError("Question");
  if (cur.kind === "name" && d.required === false) throw new ValidationError("The name question is always required");
  checkLogic(formId, questionId, d.settings);
  const row = db.update(formQuestions).set({
    ...(d.title !== undefined ? { title: d.title } : {}),
    ...(d.description !== undefined ? { description: d.description } : {}),
    ...(d.required !== undefined ? { required: cur.kind === "section" ? false : d.required } : {}),
    ...(d.hidden !== undefined ? { hidden: d.hidden } : {}),
    ...(d.settings !== undefined ? { settings: { ...cur.settings, ...d.settings } as QuestionRow["settings"] } : {}),
  }).where(eq(formQuestions.id, questionId)).returning().get();
  return toQuestionDto(row);
}

export function removeQuestion(actor: Actor, formId: string, questionId: string): void {
  requireFormEdit(actor, formId);
  const cur = db.select().from(formQuestions).where(and(eq(formQuestions.id, questionId), eq(formQuestions.formId, formId))).get();
  if (!cur) throw new NotFoundError("Question");
  db.transaction(() => {
    db.delete(formQuestions).where(eq(formQuestions.id, questionId)).run();
    // drop logic rules that pointed at the removed question
    for (const q of questionRows(formId)) {
      const rules = q.settings.logic?.showWhen;
      if (rules?.some((r) => r.questionId === questionId)) {
        const left = rules.filter((r) => r.questionId !== questionId);
        db.update(formQuestions).set({ settings: { ...q.settings, logic: { ...q.settings.logic, showWhen: left } } }).where(eq(formQuestions.id, q.id)).run();
      }
    }
  });
}

/** Reorder: `orderedIds` is the new order (questions not listed keep their relative place after them). */
export function reorderQuestions(actor: Actor, formId: string, orderedIds: string[]): QuestionDto[] {
  requireFormEdit(actor, formId);
  const all = questionRows(formId);
  const known = new Set(all.map((q) => q.id));
  const ids = [...orderedIds.filter((id) => known.has(id)), ...all.map((q) => q.id).filter((id) => !orderedIds.includes(id))];
  db.transaction(() => ids.forEach((id, i) => db.update(formQuestions).set({ position: (i + 1) * 1000 }).where(eq(formQuestions.id, id)).run()));
  return questionRows(formId).map(toQuestionDto);
}

const opSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), question: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal("update"), questionId: idSchema, patch: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal("delete"), questionId: idSchema }),
  z.object({ op: z.literal("reorder"), questionIds: z.array(idSchema).min(1) }),
]);

/** Batch editor used by the MCP tool `form_questions_editor`. Atomic: all ops or none. */
export function questionsEditor(actor: Actor, formId: string, ops: unknown): QuestionDto[] {
  const list = parse(z.array(opSchema).min(1).max(100), ops);
  requireFormEdit(actor, formId);
  db.transaction(() => {
    for (const o of list) {
      if (o.op === "add") addQuestion(actor, formId, o.question);
      else if (o.op === "update") updateQuestion(actor, formId, o.questionId, o.patch);
      else if (o.op === "delete") removeQuestion(actor, formId, o.questionId);
      else reorderQuestions(actor, formId, o.questionIds);
    }
  });
  return questionRows(formId).map(toQuestionDto);
}

/** Columns of the backing board that can still be added as a question (builder "add question" menu). */
export function availableColumns(actor: Actor, formId: string) {
  const f = getFormRow(formId);
  requireBoard(actor, f.boardId, "board:view");
  const used = new Set(questionRows(formId).map((q) => q.columnId).filter(Boolean));
  return boardColumns(f.boardId, "item")
    .filter((c) => !c.archived && isFormColumnType(c.type) && hasColumnLogic(c.type) && !used.has(c.id))
    .map((c) => ({ id: c.id, key: c.key, title: c.title, type: c.type }));
}
