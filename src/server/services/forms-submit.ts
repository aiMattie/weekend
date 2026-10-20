/**
 * WorkForms submissions: public form read-model, answer mapping/validation, item creation.
 * Re-exported from ./forms.ts (`forms.submit`, `forms.getPublic`, ...).
 */
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { systemActor, type Actor } from "../../lib/actor";
import { verifyPassword } from "../../lib/auth/password";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "../../lib/errors";
import { can } from "../../lib/permissions";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { groups, users, workspaces } from "../../db/schema/core";
import { formSubmissions } from "../../db/schema/forms";
import { isEmptyAnswer, visibleQuestionIds } from "../../modules/boards-extra/forms/logic";
import type { FieldError, PublicForm, PublicOption, PublicQuestion, SubmitResult } from "../../modules/boards-extra/forms/types";
import { getColumnLogic } from "../columns/registry";
import { dropdownLabels, statusLabels } from "../columns/labels";
import { boardColumns, formatContext, parse, requireBoard, type ColumnRow } from "./_shared";
import { getFormByToken, getFormRow, questionRows } from "./forms";
import * as itemsService from "./items";
import * as updatesService from "./updates";

type FormRow = ReturnType<typeof getFormRow>;
type QuestionRow = ReturnType<typeof questionRows>[number];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const effectiveRequireLogin = (f: FormRow): boolean => !!(f.settings.requireLogin || f.settings.limitOneResponse);

function thankYouOf(f: FormRow): SubmitResult["thankYou"] {
  const t = f.settings.thankYou ?? {};
  return { title: t.title || "Bedankt!", message: t.message ?? "", redirectUrl: t.redirectUrl || null };
}

/* ------------------------------------------------------------ public read model */

function optionsFor(q: QuestionRow, col: ColumnRow): PublicOption[] | undefined {
  const allowed = Array.isArray(q.settings.optionIds) && q.settings.optionIds.length ? (q.settings.optionIds as number[]) : null;
  if (q.kind === "status") return statusLabels(col.settings).filter((l) => l.text.trim() && (!allowed || allowed.includes(l.id))).map((l) => ({ id: l.id, text: l.text, color: l.color }));
  if (q.kind === "dropdown") return dropdownLabels(col.settings).filter((l) => !allowed || allowed.includes(l.id)).map((l) => ({ id: l.id, text: l.text }));
  return undefined;
}

async function checkPassword(f: FormRow, password: string | undefined): Promise<boolean> {
  if (!f.settings.passwordHash) return true;
  return !!password && (await verifyPassword(password, f.settings.passwordHash));
}

function findPublicForm(ref: { token?: string; formId?: string }, viewer: Actor | null | undefined): FormRow {
  const f = ref.token ? getFormByToken(ref.token) : ref.formId ? getFormRow(ref.formId) : undefined;
  if (!f || f.state !== "active") throw new NotFoundError("Form");
  if (!f.isPublished && !(viewer && can(viewer, "board:edit_items", { boardId: f.boardId }))) throw new NotFoundError("Form");
  return f;
}

/** Sanitised form for the public page. Locked (no questions) while a required password is missing/wrong. */
export async function getPublic(token: string, opts: { password?: string; viewer?: Actor | null } = {}): Promise<PublicForm> {
  const f = findPublicForm({ token }, opts.viewer);
  const s = f.settings;
  const base: PublicForm = {
    token: f.token, name: f.name, locked: false, requireLogin: effectiveRequireLogin(f),
    settings: { description: s.description, coverUrl: s.coverUrl, logoUrl: s.logoUrl, primaryColor: s.primaryColor, backgroundColor: s.backgroundColor, submitLabel: s.submitLabel, thankYou: s.thankYou, tags: s.tags },
    questions: [],
  };
  if (!(await checkPassword(f, opts.password))) return { ...base, locked: true };
  const cols = new Map(boardColumns(f.boardId, "item").map((c) => [c.id, c]));
  const out: PublicQuestion[] = [];
  for (const q of questionRows(f.id)) {
    if (q.hidden) continue;
    const col = q.columnId ? cols.get(q.columnId) : undefined;
    if (q.columnId && !col) continue;
    if (q.kind === "people") {
      if (!opts.viewer) continue; // people pickers are only offered to logged-in users
      const people = db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.accountId, opts.viewer.accountId), eq(users.isActive, true))).all();
      out.push({ id: q.id, kind: q.kind, title: q.title, description: q.description, required: q.required, options: people.map((p) => ({ id: Number(p.id), text: p.name })), multiple: true, logic: q.settings.logic });
      continue;
    }
    out.push({
      id: q.id, kind: q.kind, title: q.title, description: q.description, required: q.kind === "section" ? false : q.required,
      placeholder: typeof q.settings.placeholder === "string" ? q.settings.placeholder : undefined,
      options: col ? optionsFor(q, col) : undefined,
      multiple: q.kind === "dropdown" ? col?.settings.allowMultiple !== false : undefined,
      logic: q.settings.logic,
    });
  }
  return { ...base, questions: out };
}

/** Same as getPublic with a password (POST /unlock). */
export const unlockPublic = (token: string, password: string, viewer?: Actor | null) => getPublic(token, { password, viewer });

/* ------------------------------------------------------------ mapping + validation */

export interface MappedSubmission {
  name: string | null;
  /** raw answers keyed by column id, ready for items.create */
  values: Record<string, unknown>;
  /** answers of the shown questions, keyed by question id */
  answers: Record<string, unknown>;
  /** "Question: answer" lines for the item update */
  lines: { title: string; text: string }[];
  errors: FieldError[];
}

/** Map question answers to column values; validates required + column rules. Pure apart from reading `ctx`. */
export function mapAnswers(questions: QuestionRow[], columnsById: Map<string, ColumnRow>, answers: Record<string, unknown>, ctx?: ReturnType<typeof formatContext>): MappedSubmission {
  const shown = visibleQuestionIds(questions, answers);
  const out: MappedSubmission = { name: null, values: {}, answers: {}, lines: [], errors: [] };
  for (const q of questions) {
    if (!shown.has(q.id) || q.kind === "section") continue;
    const a = answers[q.id];
    if (isEmptyAnswer(a)) {
      if (q.required) out.errors.push({ questionId: q.id, message: "This question is required" });
      continue;
    }
    out.answers[q.id] = a;
    if (q.kind === "name") {
      const n = String(a).trim();
      if (n.length > 1000) out.errors.push({ questionId: q.id, message: "Too long (max 1000 characters)" });
      else out.name = n;
      out.lines.push({ title: q.title, text: n });
      continue;
    }
    const col = q.columnId ? columnsById.get(q.columnId) : undefined;
    if (!col) continue;
    const logic = getColumnLogic(col.type);
    try {
      const stored = logic.validate(a, col);
      const allowed = Array.isArray(q.settings.optionIds) && q.settings.optionIds.length ? (q.settings.optionIds as number[]) : null;
      if (allowed && stored) {
        const picked: number[] = col.type === "status" ? [(stored as { index: number }).index] : col.type === "dropdown" ? (stored as { ids: number[] }).ids : [];
        if (picked.some((id) => !allowed.includes(id))) throw new ValidationError("This option is not available");
      }
      if (stored === null) {
        if (q.required) out.errors.push({ questionId: q.id, message: "This question is required" });
        delete out.answers[q.id];
        continue;
      }
      out.values[col.id] = a;
      out.lines.push({ title: q.title, text: logic.format(stored, col, ctx) || String(a) });
    } catch (e) {
      out.errors.push({ questionId: q.id, message: e instanceof ValidationError ? e.message : "Invalid answer" });
      delete out.answers[q.id];
    }
  }
  return out;
}

/* ------------------------------------------------------------ submit */

const MAX_ANSWERS_BYTES = 100_000;
const answersSchema = z.record(z.string().max(40), z.unknown()).refine((a) => JSON.stringify(a).length <= MAX_ANSWERS_BYTES, "Answers are too large");
const submitInput = z.object({
  token: z.string().min(1).max(100).optional(),
  formId: idSchema.optional(),
  answers: answersSchema,
  password: z.string().max(200).optional(),
  ipHash: z.string().max(100).optional(),
  /** hidden "website" field: bots fill it, humans never see it */
  honeypot: z.string().max(2000).optional(),
}).refine((d) => d.token || d.formId, "token or formId is required");

function create(f: FormRow, itemActor: Actor, userId: string | null, ipHash: string | null, answers: Record<string, unknown>): SubmitResult {
  const questions = questionRows(f.id);
  const cols = new Map(boardColumns(f.boardId, "item").map((c) => [c.id, c]));
  const ws = db.select({ accountId: workspaces.accountId }).from(workspaces).where(eq(workspaces.id, f.workspaceId)).get();
  const mapped = mapAnswers(questions, cols, answers, ws ? formatContext(ws.accountId) : undefined);
  if (mapped.errors.length) throw new ValidationError(`${mapped.errors.length} answer(s) are invalid: ${mapped.errors[0].message}`, mapped.errors);
  const groupOk = f.groupId && db.select({ id: groups.id }).from(groups).where(and(eq(groups.id, f.groupId), eq(groups.boardId, f.boardId), eq(groups.state, "active"))).get();
  const name = mapped.name || `${f.name} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  const item = itemsService.create(itemActor, { boardId: f.boardId, groupId: groupOk ? f.groupId : undefined, name, values: mapped.values });
  if (mapped.lines.length) {
    const body = `<p><em>${esc(f.name)}</em></p>` + mapped.lines.map((l) => `<p><strong>${esc(l.title)}</strong><br>${esc(l.text).replace(/\n/g, "<br>")}</p>`).join("");
    updatesService.create(itemActor, { itemId: item.id, body });
  }
  const sub = db.insert(formSubmissions).values({ formId: f.id, itemId: item.id, userId, ipHash, answers: mapped.answers }).returning().get();
  return { ok: true, itemId: item.id, submissionId: sub.id, thankYou: thankYouOf(f) };
}

/** Public/logged-in submission. `actor` null = anonymous visitor. */
export async function submit(actor: Actor | null, input: unknown): Promise<SubmitResult> {
  const d = parse(submitInput, input);
  const f = findPublicForm({ token: d.token, formId: d.formId }, actor);
  if (d.honeypot && d.honeypot.trim()) return { ok: true, itemId: null, submissionId: null, thankYou: thankYouOf(f) }; // bot: pretend it worked
  if (!(await checkPassword(f, d.password))) throw new ValidationError("Wrong or missing password", [{ questionId: "", message: "password" }]);
  const userId = actor && !actor.isSystem ? actor.id : null;
  if (effectiveRequireLogin(f) && !userId) throw new UnauthorizedError("Log in to respond to this form");
  if (f.settings.limitOneResponse && userId) {
    const prev = db.select({ id: formSubmissions.id }).from(formSubmissions).where(and(eq(formSubmissions.formId, f.id), eq(formSubmissions.userId, userId))).get();
    if (prev) throw new ConflictError("You already responded to this form");
  }
  const accountId = db.select({ accountId: workspaces.accountId }).from(workspaces).where(eq(workspaces.id, f.workspaceId)).get()?.accountId ?? "";
  const itemActor = actor && userId && can(actor, "board:edit_items", { boardId: f.boardId }) ? actor : systemActor(accountId, "system");
  return create(f, itemActor, userId, d.ipHash ?? null, d.answers);
}

/** Accept answers keyed by question id, column id/key, or "name" (MCP friendly). */
function normalizeKeys(f: FormRow, answers: Record<string, unknown>): Record<string, unknown> {
  const qs = questionRows(f.id);
  const cols = new Map(boardColumns(f.boardId, "item").map((c) => [c.id, c]));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(answers)) {
    const q = qs.find((x) => x.id === k)
      ?? qs.find((x) => x.columnId && (x.columnId === k || cols.get(x.columnId)?.key === k))
      ?? (k === "name" ? qs.find((x) => x.kind === "name") : undefined)
      ?? qs.find((x) => x.title.toLowerCase() === k.toLowerCase());
    if (!q) throw new ValidationError(`Unknown question "${k}"`);
    out[q.id] = v;
  }
  return out;
}

/** MCP `create_form_submission`: needs board:edit_items; skips publish/password/login checks. */
export function createSubmission(actor: Actor, formId: string, answers: unknown): SubmitResult {
  const f = getFormRow(formId);
  requireBoard(actor, f.boardId, "board:edit_items");
  const a = parse(answersSchema, answers);
  return create(f, actor, actor.isSystem ? null : actor.id, null, normalizeKeys(f, a));
}

export function listSubmissions(actor: Actor, formId: string, limit = 200) {
  const f = getFormRow(formId);
  requireBoard(actor, f.boardId, "board:view");
  const rows = db.select().from(formSubmissions).where(eq(formSubmissions.formId, formId)).orderBy(desc(formSubmissions.createdAt)).limit(Math.min(limit, 1000)).all();
  const names = new Map(db.select({ id: users.id, name: users.name }).from(users).all().map((u) => [u.id, u.name]));
  return rows.map((r) => ({ id: r.id, itemId: r.itemId, userId: r.userId, userName: r.userId ? names.get(r.userId) ?? null : null, answers: r.answers, createdAt: r.createdAt }));
}
