/**
 * Pure form logic (no db, no React): column types a form can ask for, answer emptiness,
 * conditional logic (showWhen), and the sliding-window rate limiter used by the public route.
 */
import type { QuestionLogic } from "../../../db/schema/forms";

/** Column types that can be mapped to a form question. */
export const FORM_COLUMN_TYPES = ["text", "long_text", "numbers", "status", "date", "people", "checkbox", "dropdown", "link", "email", "phone", "rating"] as const;
export type FormColumnType = (typeof FORM_COLUMN_TYPES)[number];
/** Non-column question kinds. */
export const FORM_SPECIAL_KINDS = ["name", "section"] as const;

export const isFormColumnType = (t: string): boolean => (FORM_COLUMN_TYPES as readonly string[]).includes(t);
export const isFormKind = (k: string): boolean => isFormColumnType(k) || (FORM_SPECIAL_KINDS as readonly string[]).includes(k);

/** True when an answer counts as "not answered" (empty string, empty list, unchecked box). */
export function isEmptyAnswer(v: unknown): boolean {
  if (v === null || v === undefined || v === "" || v === false) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("checked" in o) return !o.checked;
    if ("url" in o) return !String(o.url ?? "").trim();
  }
  return false;
}

const asText = (v: unknown): string => (Array.isArray(v) ? v.map(String).join(",") : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? ""));

/** Evaluate one showWhen rule against the answers given so far. */
export function ruleMatches(rule: NonNullable<QuestionLogic["showWhen"]>[number], answers: Record<string, unknown>): boolean {
  const a = answers[rule.questionId];
  switch (rule.op) {
    case "is_empty": return isEmptyAnswer(a);
    case "not_empty": return !isEmptyAnswer(a);
    case "equals": {
      if (Array.isArray(a)) return a.map(String).includes(String(rule.value));
      if (typeof a === "boolean") return String(a) === String(rule.value);
      return asText(a).toLowerCase() === asText(rule.value).toLowerCase();
    }
    case "not_equals": return !ruleMatches({ ...rule, op: "equals" }, answers);
    case "contains": return asText(a).toLowerCase().includes(asText(rule.value).toLowerCase());
    default: return true;
  }
}

export interface QuestionLike { id: string; hidden: boolean; kind: string; settings: { logic?: QuestionLogic } & Record<string, unknown> }

/**
 * Ids of the questions that are shown for these answers. Questions are walked in order; a rule that
 * depends on a question that is itself not shown sees an empty answer. `hidden` questions are never shown.
 */
export function visibleQuestionIds(questions: QuestionLike[], answers: Record<string, unknown>): Set<string> {
  const visible = new Set<string>();
  const effective: Record<string, unknown> = {};
  for (const q of questions) {
    if (q.hidden) continue;
    const rules = q.settings.logic?.showWhen ?? [];
    let show = true;
    if (rules.length) {
      const results = rules.map((r) => ruleMatches(r, effective));
      show = q.settings.logic?.match === "any" ? results.some(Boolean) : results.every(Boolean);
    }
    if (!show) continue;
    visible.add(q.id);
    if (q.id in answers) effective[q.id] = answers[q.id];
  }
  return visible;
}

/* ------------------------------------------------------------------ rate limiting */

export interface RateLimitOptions { max: number; windowMs: number }
export type RateLimitStore = Map<string, number[]>;
export const DEFAULT_RATE_LIMIT: RateLimitOptions = { max: 5, windowMs: 60_000 };

/** Sliding-window limiter. Records the hit when allowed. `retryAfterSec` is set when blocked. */
export function checkRateLimit(store: RateLimitStore, key: string, now = Date.now(), opts: RateLimitOptions = DEFAULT_RATE_LIMIT): { ok: boolean; retryAfterSec: number } {
  const hits = (store.get(key) ?? []).filter((t) => now - t < opts.windowMs);
  if (hits.length >= opts.max) {
    store.set(key, hits);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hits[0] + opts.windowMs - now) / 1000)) };
  }
  hits.push(now);
  store.set(key, hits);
  if (store.size > 5000) for (const [k, v] of store) if (!v.some((t) => now - t < opts.windowMs)) store.delete(k);
  return { ok: true, retryAfterSec: 0 };
}

const g = globalThis as unknown as { __formRateStore?: RateLimitStore };
/** Process-wide store used by the public submit route. */
export const globalRateStore = (): RateLimitStore => (g.__formRateStore ??= new Map());

/** Embed snippet for a published form. */
export const embedCode = (origin: string, token: string, height = 700): string =>
  `<iframe src="${origin}/f/${token}" width="100%" height="${height}" style="border:0" title="Form" loading="lazy"></iframe>`;
