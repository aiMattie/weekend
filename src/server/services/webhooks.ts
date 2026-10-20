/**
 * Outgoing webhooks: endpoints (per board or account wide), a delivery queue with HMAC signing,
 * retries with backoff and a delivery log. Event names are API style (create_item,
 * change_column_value ...). The bus dispatcher (`startWebhookDispatcher`) turns app events into
 * deliveries; the scheduler tick (and an immediate kick) sends them.
 *
 * Signature: header `X-Webhook-Signature: t=<unix seconds>,v1=<hex hmac-sha256 of "<t>.<body>">`.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { NotFoundError, ValidationError } from "../../lib/errors";
import { subscribe, type AppEvent } from "../../lib/events";
import { assertCan } from "../../lib/permissions";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { items, workspaces } from "../../db/schema/core";
import { webhookDeliveries, webhookEndpoints, type DeliveryStatus } from "../../db/schema/webhooks";
import { getBoardRow, parse, requireBoard } from "./_shared";

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;

export const MAX_ATTEMPTS = 6;
/** seconds to wait after failed attempt 1, 2, ... */
export const RETRY_DELAYS_SEC = [30, 120, 600, 3600, 21_600];
export const retryDelaySec = (attempts: number): number | null => (attempts >= MAX_ATTEMPTS ? null : RETRY_DELAYS_SEC[Math.min(attempts - 1, RETRY_DELAYS_SEC.length - 1)]);

export const WEBHOOK_EVENTS = [
  "create_item", "create_subitem", "change_column_value", "change_status_column_value", "change_specific_column_value",
  "change_subitem_column_value", "item_moved_to_any_group", "item_archived", "item_deleted", "create_update", "button_clicked", "sprint_started", "sprint_completed", "ping",
] as const;

/* ------------------------------------------------------------ signing */

export function sign(secret: string, body: string, timestamp: number): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}
export const signatureHeader = (secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) => `t=${timestamp},v1=${sign(secret, body, timestamp)}`;

/** Receiver side check (also used for inbound GitHub-like checks and by tests). */
export function verifySignature(secret: string, body: string, header: string | null | undefined, opts: { toleranceSec?: number; nowSec?: number } = {}): boolean {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header ?? "");
  if (!m) return false;
  const ts = Number(m[1]);
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > (opts.toleranceSec ?? 300)) return false;
  return timingSafeEqual(Buffer.from(sign(secret, body, ts)), Buffer.from(m[2]));
}

/* ------------------------------------------------------------ transport */

export type WebhookFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>;
const g = globalThis as unknown as { __webhookFetch?: WebhookFetch | null; __webhookDispatcher?: () => void };
/** Tests inject a fetch; null restores the real one. */
export function setWebhookFetch(f: WebhookFetch | null): void { g.__webhookFetch = f; }
const doFetch: WebhookFetch = (url, init) => (g.__webhookFetch ?? (fetch as unknown as WebhookFetch))(url, init);

const urlSchema = z.string().trim().url().refine((u) => /^https?:\/\//i.test(u), "Only http(s) URLs are allowed");

/** One signed POST (no queue). Throws on network errors and non-2xx. Used by the webhook_post action. */
export async function postSigned(url: string, payload: unknown, opts: { secret?: string; headers?: Record<string, string>; event?: string; timeoutMs?: number } = {}): Promise<{ status: number; body: string }> {
  const u = urlSchema.safeParse(url);
  if (!u.success) throw new ValidationError(`Invalid webhook url: ${url}`);
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "weekend/1.0", "X-Webhook-Event": opts.event ?? "automation", ...opts.headers };
  if (opts.secret) headers["X-Webhook-Signature"] = signatureHeader(opts.secret, body);
  const res = await doFetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) });
  const text = (await res.text().catch(() => "")).slice(0, 2000);
  if (res.status < 200 || res.status >= 300) throw new Error(`Webhook responded ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  return { status: res.status, body: text };
}

/* ------------------------------------------------------------ endpoints (CRUD) */

const createInput = z.object({
  boardId: idSchema.nullish(),
  url: urlSchema,
  events: z.array(z.string().min(1)).min(1).default(["*"]),
  event: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  description: z.string().max(500).nullish(),
});
const updateInput = z.object({ url: urlSchema.optional(), events: z.array(z.string().min(1)).min(1).optional(), config: z.record(z.string(), z.unknown()).optional(), description: z.string().max(500).nullish(), active: z.boolean().optional() });

export function accountOfBoard(boardId: string): string {
  const b = getBoardRow(boardId);
  const w = db.select({ accountId: workspaces.accountId }).from(workspaces).where(eq(workspaces.id, b.workspaceId)).get();
  if (!w) throw new NotFoundError("Workspace");
  return w.accountId;
}

function guard(actor: Actor, e: { boardId: string | null; accountId: string }): void {
  if (e.accountId !== actor.accountId) throw new NotFoundError("Webhook");
  if (e.boardId) assertCan(actor, "board:edit_structure", { boardId: e.boardId });
  else assertCan(actor, "account:manage");
}

export function get(actor: Actor, id: string): WebhookEndpoint {
  const e = db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, id)).get();
  if (!e) throw new NotFoundError("Webhook");
  guard(actor, e);
  return e;
}

export function list(actor: Actor, input: { boardId?: string | null } = {}): WebhookEndpoint[] {
  if (input.boardId) {
    requireBoard(actor, input.boardId, "board:edit_structure");
    return db.select().from(webhookEndpoints).where(eq(webhookEndpoints.boardId, input.boardId)).orderBy(asc(webhookEndpoints.createdAt)).all();
  }
  assertCan(actor, "account:manage");
  return db.select().from(webhookEndpoints).where(eq(webhookEndpoints.accountId, actor.accountId)).orderBy(asc(webhookEndpoints.createdAt)).all();
}

export function create(actor: Actor, input: unknown): WebhookEndpoint {
  const d = parse(createInput, input);
  const accountId = d.boardId ? accountOfBoard(d.boardId) : actor.accountId;
  guard(actor, { boardId: d.boardId ?? null, accountId });
  return db.insert(webhookEndpoints).values({
    accountId, boardId: d.boardId ?? null, url: d.url, events: d.event ? [d.event] : d.events, config: d.config,
    secret: `whsec_${randomBytes(24).toString("hex")}`, description: d.description ?? null, createdBy: actor.isSystem ? null : actor.id,
  }).returning().get();
}

export function update(actor: Actor, id: string, input: unknown): WebhookEndpoint {
  const d = parse(updateInput, input);
  get(actor, id);
  return db.update(webhookEndpoints).set(d).where(eq(webhookEndpoints.id, id)).returning().get();
}

export function remove(actor: Actor, id: string): void {
  get(actor, id);
  db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id)).run();
}

export function rotateSecret(actor: Actor, id: string): WebhookEndpoint {
  get(actor, id);
  return db.update(webhookEndpoints).set({ secret: `whsec_${randomBytes(24).toString("hex")}` }).where(eq(webhookEndpoints.id, id)).returning().get();
}

/* ------------------------------------------------------------ deliveries */

export function listDeliveries(actor: Actor, endpointId: string, opts: { limit?: number } = {}): WebhookDelivery[] {
  get(actor, endpointId);
  return db.select().from(webhookDeliveries).where(eq(webhookDeliveries.endpointId, endpointId)).orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id)).limit(Math.min(opts.limit ?? 50, 200)).all();
}

/** Queue one delivery for an endpoint (pending, due now). */
export function enqueue(endpoint: WebhookEndpoint, event: string, payload: Record<string, unknown>, now = new Date()): WebhookDelivery {
  return db.insert(webhookDeliveries).values({ endpointId: endpoint.id, event, payload, status: "pending", nextAttemptAt: now.toISOString() }).returning().get();
}

/** Try one delivery now. Updates the row (success / pending with next attempt / dead). */
export async function deliver(deliveryId: string, now = new Date()): Promise<WebhookDelivery> {
  const del = db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId)).get();
  if (!del) throw new NotFoundError("Delivery");
  const ep = db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, del.endpointId)).get();
  const attempts = del.attempts + 1;
  let patch: Partial<WebhookDelivery>;
  if (!ep) patch = { status: "dead", attempts, error: "endpoint removed", nextAttemptAt: null };
  else {
    const body = JSON.stringify({ ...del.payload, deliveryId: del.id });
    try {
      const r = await postSigned(ep.url, body, { secret: ep.secret, event: del.event, headers: { "X-Webhook-Id": del.id, "X-Webhook-Attempt": String(attempts) } });
      patch = { status: "success", attempts, responseStatus: r.status, responseBody: r.body, error: null, deliveredAt: now.toISOString(), nextAttemptAt: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = /responded (\d+)/.exec(msg)?.[1];
      const delay = retryDelaySec(attempts);
      const st: DeliveryStatus = delay === null ? "dead" : "pending";
      patch = { status: st, attempts, error: msg.slice(0, 500), responseStatus: status ? Number(status) : null, nextAttemptAt: delay === null ? null : new Date(now.getTime() + delay * 1000).toISOString() };
    }
  }
  return db.update(webhookDeliveries).set(patch).where(eq(webhookDeliveries.id, deliveryId)).returning().get();
}

/** Send every delivery that is due. Called by the scheduler tick and right after enqueueing. */
export async function processDue(now = new Date(), limit = 50): Promise<number> {
  const due = db.select({ id: webhookDeliveries.id }).from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.nextAttemptAt, now.toISOString())))
    .orderBy(asc(webhookDeliveries.nextAttemptAt)).limit(limit).all();
  for (const d of due) await deliver(d.id, now).catch((e) => console.error("[webhooks] deliver failed", e));
  return due.length;
}

export async function test(actor: Actor, id: string): Promise<WebhookDelivery> {
  const ep = get(actor, id);
  const del = enqueue(ep, "ping", { event: { type: "ping", app: "weekend", boardId: ep.boardId, triggerTime: new Date().toISOString() } });
  return deliver(del.id);
}

export async function retryDelivery(actor: Actor, deliveryId: string): Promise<WebhookDelivery> {
  const del = db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId)).get();
  if (!del) throw new NotFoundError("Delivery");
  get(actor, del.endpointId);
  db.update(webhookDeliveries).set({ status: "pending", nextAttemptAt: new Date().toISOString(), attempts: Math.min(del.attempts, MAX_ATTEMPTS - 1) }).where(eq(webhookDeliveries.id, deliveryId)).run();
  return deliver(deliveryId);
}

/* ------------------------------------------------------------ bus -> deliveries */

/** Map an app event to webhook events (a column change maps to several). */
export function toWebhookEvents(e: AppEvent): { name: string; columnId?: string; payload: Record<string, unknown> }[] {
  if (!e.boardId) return [];
  const base = { app: "weekend", userId: e.actorId, boardId: e.boardId, triggerTime: e.at };
  const itemOf = (id: string) => db.select().from(items).where(eq(items.id, id)).get();
  switch (e.type) {
    case "item.created": {
      const it = itemOf(e.itemId);
      const name = e.parentItemId ? "create_subitem" : "create_item";
      return [{ name, payload: { event: { ...base, type: name, itemId: e.itemId, pulseId: e.itemId, pulseName: it?.name, groupId: it?.groupId, parentItemId: e.parentItemId ?? undefined } } }];
    }
    case "column_value.changed": {
      const it = itemOf(e.itemId);
      const sub = !!it?.parentItemId;
      const ev = { ...base, itemId: e.itemId, pulseId: e.itemId, pulseName: it?.name, columnId: e.columnId, columnType: e.columnType, value: e.to, previousValue: e.from, groupId: it?.groupId };
      const out = [{ name: sub ? "change_subitem_column_value" : "change_column_value", payload: { event: { ...ev, type: sub ? "update_column_value" : "update_column_value" } } }];
      if (e.columnType === "status") out.push({ name: "change_status_column_value", payload: { event: { ...ev, type: "update_column_value" } } });
      return [...out, { name: "change_specific_column_value", columnId: e.columnId, payload: { event: { ...ev, type: "update_column_value" } } }];
    }
    case "item.moved": return e.parentItemId ? [] : [{ name: "item_moved_to_any_group", payload: { event: { ...base, type: "move_pulse_into_group", itemId: e.itemId, pulseId: e.itemId, groupId: itemOf(e.itemId)?.groupId } } }];
    case "item.archived": return [{ name: "item_archived", payload: { event: { ...base, type: "archive_pulse", itemId: e.itemId, pulseId: e.itemId } } }];
    case "item.deleted": return [{ name: "item_deleted", payload: { event: { ...base, type: "delete_pulse", itemId: e.itemId, pulseId: e.itemId } } }];
    case "update.created": return [{ name: "create_update", payload: { event: { ...base, type: "create_update", itemId: e.itemId, pulseId: e.itemId, updateId: e.updateId } } }];
    case "button.clicked": return [{ name: "button_clicked", payload: { event: { ...base, type: "button_clicked", itemId: e.itemId, columnId: e.columnId } } }];
    case "sprint.started": return [{ name: "sprint_started", payload: { event: { ...base, type: "sprint_started", sprintId: e.sprintId } } }];
    case "sprint.completed": return [{ name: "sprint_completed", payload: { event: { ...base, type: "sprint_completed", sprintId: e.sprintId } } }];
    default: return [];
  }
}

/** Queue deliveries for one app event. Returns the created deliveries. */
export function dispatchEvent(e: AppEvent, now = new Date()): WebhookDelivery[] {
  if (!e.boardId) return [];
  const mapped = toWebhookEvents(e);
  if (!mapped.length) return [];
  let accountId: string;
  try { accountId = accountOfBoard(e.boardId); } catch { return []; }
  const eps = db.select().from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.accountId, accountId), eq(webhookEndpoints.active, true), or(eq(webhookEndpoints.boardId, e.boardId), isNull(webhookEndpoints.boardId))))
    .all();
  const out: WebhookDelivery[] = [];
  for (const ep of eps) {
    for (const m of mapped) {
      const wants = ep.events.includes("*") || ep.events.includes(m.name);
      const colOk = m.name !== "change_specific_column_value" || !ep.config.columnId || String(ep.config.columnId) === m.columnId;
      if (wants && colOk && !(ep.events.includes("*") && m.name === "change_specific_column_value")) out.push(enqueue(ep, m.name, m.payload, now));
    }
  }
  return out;
}

/** Subscribe once to the bus (idempotent across HMR/bundles). */
export function startWebhookDispatcher(): void {
  if (g.__webhookDispatcher) return;
  const un = subscribe((e) => {
    try {
      if (dispatchEvent(e).length) setImmediate(() => void processDue().catch((err) => console.error("[webhooks] processDue failed", err)));
    } catch (err) {
      console.error("[webhooks] dispatch failed", err);
    }
  });
  g.__webhookDispatcher = un;
}

