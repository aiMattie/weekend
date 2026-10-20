/**
 * Integrations center backend: connection records for Slack, Teams, GitHub, Gmail/Outlook, Jira and
 * generic webhooks. Slack/Teams are outgoing chat webhooks; GitHub/Jira/mail/webhook are inbound
 * adapters on a per-integration secret URL (POST /api/public/hooks/<token>) that create items.
 * Everything not configured reports "not connected".
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { systemActor, type Actor } from "../../lib/actor";
import { NotFoundError, ValidationError } from "../../lib/errors";
import { assertCan } from "../../lib/permissions";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { integrations, type IntegrationKind } from "../../db/schema/webhooks";
import { getBoardRow, parse } from "./_shared";
import * as items from "./items";
import * as updates from "./updates";
import { accountOfBoard, postSigned } from "./webhooks";
import { textToHtml } from "../automations/blocks/helpers";

export type Integration = typeof integrations.$inferSelect;
interface Txt { nl: string; en: string }

export interface IntegrationCatalogEntry {
  kind: IntegrationKind;
  name: string;
  description: Txt;
  /** inbound = creates items from outside, chat = outgoing message webhook, outbound = see webhook endpoints */
  mode: "inbound" | "chat" | "outbound";
  fields: { key: string; label: Txt; secret?: boolean; placeholder?: string }[];
}

export const INTEGRATION_CATALOG: IntegrationCatalogEntry[] = [
  { kind: "slack", name: "Slack", mode: "chat", description: { nl: "Stuur berichten naar een Slack-kanaal via een inkomende webhook-URL.", en: "Post messages to a Slack channel through an incoming webhook URL." }, fields: [{ key: "webhookUrl", label: { nl: "Webhook-URL", en: "Webhook URL" }, secret: true, placeholder: "https://hooks.slack.com/services/..." }] },
  { kind: "teams", name: "Microsoft Teams", mode: "chat", description: { nl: "Stuur berichten naar een Teams-kanaal via een workflow- of connector-webhook.", en: "Post messages to a Teams channel through a workflow or connector webhook." }, fields: [{ key: "webhookUrl", label: { nl: "Webhook-URL", en: "Webhook URL" }, secret: true }] },
  { kind: "github", name: "GitHub", mode: "inbound", description: { nl: "Maak items aan uit issues en pull requests (webhook in de repo-instellingen).", en: "Create items from issues and pull requests (repo webhook)." }, fields: [{ key: "secret", label: { nl: "Webhook-secret", en: "Webhook secret" }, secret: true }] },
  { kind: "jira", name: "Jira", mode: "inbound", description: { nl: "Maak items aan uit Jira-issues via een Jira-webhook.", en: "Create items from Jira issues via a Jira webhook." }, fields: [] },
  { kind: "gmail", name: "Gmail", mode: "inbound", description: { nl: "Maak items aan uit doorgestuurde e-mails (via een filter, Apps Script of Zapier/Make naar de webhook-URL).", en: "Create items from forwarded emails (filter, Apps Script or Zapier/Make to the webhook URL)." }, fields: [] },
  { kind: "outlook", name: "Outlook", mode: "inbound", description: { nl: "Maak items aan uit e-mails via een Power Automate-flow naar de webhook-URL.", en: "Create items from emails via a Power Automate flow to the webhook URL." }, fields: [] },
  { kind: "webhook_in", name: "Inkomende webhook", mode: "inbound", description: { nl: "Elke JSON-POST maakt een item aan. Koppel velden aan kolommen.", en: "Every JSON POST creates an item. Map fields to columns." }, fields: [] },
  { kind: "webhook_out", name: "Uitgaande webhook", mode: "outbound", description: { nl: "Stuur board-events naar een eigen URL, ondertekend met HMAC.", en: "Send board events to your own URL, signed with HMAC." }, fields: [] },
];

const KINDS = INTEGRATION_CATALOG.map((c) => c.kind) as [IntegrationKind, ...IntegrationKind[]];

const createInput = z.object({
  kind: z.enum(KINDS),
  name: z.string().trim().min(1).max(120).optional(),
  boardId: idSchema.nullish(),
  config: z.record(z.string(), z.unknown()).default({}),
});
const updateInput = z.object({ name: z.string().trim().min(1).max(120).optional(), boardId: idSchema.nullish(), config: z.record(z.string(), z.unknown()).optional(), active: z.boolean().optional() });

export type IntegrationDto = Omit<Integration, "config"> & { config: Record<string, unknown>; connected: boolean; inboundPath: string | null };

export function isConnected(i: Pick<Integration, "kind" | "config" | "active">): boolean {
  if (!i.active) return false;
  if (i.kind === "slack" || i.kind === "teams") return typeof i.config.webhookUrl === "string" && /^https?:\/\//.test(i.config.webhookUrl);
  if (i.kind === "webhook_in" || i.kind === "github" || i.kind === "jira" || i.kind === "gmail" || i.kind === "outlook") return !!i.config.boardId;
  return true;
}

const toDto = (i: Integration): IntegrationDto => ({ ...i, connected: isConnected(i), inboundPath: i.token ? `/api/public/hooks/${i.token}` : null });

export function catalog(): IntegrationCatalogEntry[] { return INTEGRATION_CATALOG; }

export function list(actor: Actor): IntegrationDto[] {
  assertCan(actor, "account:manage");
  return db.select().from(integrations).where(eq(integrations.accountId, actor.accountId)).orderBy(asc(integrations.createdAt)).all().map(toDto);
}

function load(actor: Actor, id: string): Integration {
  const i = db.select().from(integrations).where(eq(integrations.id, id)).get();
  if (!i || i.accountId !== actor.accountId) throw new NotFoundError("Integration");
  assertCan(actor, "account:manage");
  return i;
}
export const get = (actor: Actor, id: string): IntegrationDto => toDto(load(actor, id));

export function create(actor: Actor, input: unknown): IntegrationDto {
  assertCan(actor, "account:manage");
  const d = parse(createInput, input);
  const entry = INTEGRATION_CATALOG.find((c) => c.kind === d.kind)!;
  if (d.boardId) accountOfBoard(d.boardId);
  const boardId = d.boardId ?? (d.config.boardId as string | undefined) ?? null;
  const config = { ...d.config, ...(boardId ? { boardId } : {}) };
  const row = db.insert(integrations).values({
    accountId: actor.accountId, boardId, kind: d.kind, name: d.name ?? entry.name, config,
    token: entry.mode === "inbound" ? randomBytes(20).toString("hex") : null, createdBy: actor.isSystem ? null : actor.id,
  }).returning().get();
  return toDto(row);
}

export function update(actor: Actor, id: string, input: unknown): IntegrationDto {
  const d = parse(updateInput, input);
  const cur = load(actor, id);
  const config = d.config ? { ...cur.config, ...d.config } : cur.config;
  if (d.boardId) config.boardId = d.boardId;
  const row = db.update(integrations).set({ ...(d.name ? { name: d.name } : {}), ...(d.active !== undefined ? { active: d.active } : {}), ...(d.boardId !== undefined ? { boardId: d.boardId } : {}), config }).where(eq(integrations.id, id)).returning().get();
  return toDto(row);
}

export function remove(actor: Actor, id: string): void {
  load(actor, id);
  db.delete(integrations).where(eq(integrations.id, id)).run();
}

export function regenerateToken(actor: Actor, id: string): IntegrationDto {
  load(actor, id);
  return toDto(db.update(integrations).set({ token: randomBytes(20).toString("hex") }).where(eq(integrations.id, id)).returning().get());
}

/* ------------------------------------------------------------ chat (Slack / Teams) */

/** Post a message through a Slack/Teams integration. Used by the chat_message action. */
export async function sendChat(accountId: string, integrationId: string, text: string): Promise<void> {
  const i = db.select().from(integrations).where(and(eq(integrations.id, integrationId), eq(integrations.accountId, accountId))).get();
  if (!i) throw new NotFoundError("Integration");
  if (!isConnected(i)) throw new ValidationError(`${i.name} is not connected (no webhook URL)`);
  const url = String(i.config.webhookUrl);
  const payload = i.kind === "teams" ? { "@type": "MessageCard", "@context": "http://schema.org/extensions", summary: text.slice(0, 80), text } : { text };
  await postSigned(url, payload, { event: "chat_message" });
  db.update(integrations).set({ lastEventAt: new Date().toISOString() }).where(eq(integrations.id, i.id)).run();
}

export function listChatTargets(actor: Actor): { id: string; name: string; kind: string; connected: boolean }[] {
  return db.select().from(integrations).where(eq(integrations.accountId, actor.accountId)).all()
    .filter((i) => i.kind === "slack" || i.kind === "teams").map((i) => ({ id: i.id, name: i.name, kind: i.kind, connected: isConnected(i) }));
}

/* ------------------------------------------------------------ inbound adapters */

const dig = (obj: unknown, path: string): unknown => path.replace(/^\$\.?/, "").split(".").filter(Boolean).reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
const str = (v: unknown): string => (v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v));

interface Extracted { name: string; text?: string; skip?: string }

function extract(kind: IntegrationKind, headers: Headers, body: Record<string, unknown>): Extracted {
  if (kind === "github") {
    const ev = headers.get("x-github-event") ?? "";
    if (ev === "ping") return { name: "", skip: "ping" };
    const action = str(body.action);
    if (ev === "issues" && ["opened", "reopened"].includes(action)) return { name: `#${str(dig(body, "issue.number"))} ${str(dig(body, "issue.title"))}`, text: `${str(dig(body, "issue.html_url"))}\n\n${str(dig(body, "issue.body"))}` };
    if (ev === "pull_request" && ["opened", "reopened", "ready_for_review"].includes(action)) return { name: `PR #${str(dig(body, "pull_request.number"))} ${str(dig(body, "pull_request.title"))}`, text: `${str(dig(body, "pull_request.html_url"))}\n\n${str(dig(body, "pull_request.body"))}` };
    return { name: "", skip: `event ${ev}/${action} ignored` };
  }
  if (kind === "jira") {
    const key = str(dig(body, "issue.key"));
    const summary = str(dig(body, "issue.fields.summary"));
    if (!key && !summary) return { name: "", skip: "not a jira issue payload" };
    return { name: `${key} ${summary}`.trim(), text: str(dig(body, "issue.fields.description")) };
  }
  if (kind === "gmail" || kind === "outlook") {
    const subject = str(body.subject) || str(dig(body, "message.subject")) || "(geen onderwerp)";
    return { name: subject, text: `Van: ${str(body.from ?? dig(body, "message.from"))}\n\n${str(body.body ?? body.text ?? dig(body, "message.body"))}` };
  }
  const name = str(body.name ?? body.title ?? body.subject ?? body.text) || "Webhook item";
  return { name, text: typeof body.description === "string" ? body.description : undefined };
}

export function verifyGithubSignature(secret: string, raw: string, header: string | null): boolean {
  const m = /^sha256=([0-9a-f]{64})$/.exec(header ?? "");
  if (!m) return false;
  return timingSafeEqual(Buffer.from(createHmac("sha256", secret).update(raw).digest("hex")), Buffer.from(m[1]));
}

/** Public entry: token + raw body. Returns what happened; throws ValidationError/NotFound for the route to map. */
export function receiveInbound(token: string, headers: Headers, raw: string): { ok: true; itemId?: string; skipped?: string } {
  const i = db.select().from(integrations).where(eq(integrations.token, token)).get();
  if (!i || !i.active) throw new NotFoundError("Webhook");
  let body: Record<string, unknown> = {};
  try { const p = raw.trim() ? JSON.parse(raw) : {}; body = p && typeof p === "object" && !Array.isArray(p) ? p : { value: p }; } catch { throw new ValidationError("Body must be JSON"); }
  if (i.kind === "github" && i.config.secret && !verifyGithubSignature(String(i.config.secret), raw, headers.get("x-hub-signature-256"))) throw new ValidationError("Invalid signature");
  const boardId = String(i.config.boardId ?? "");
  if (!boardId) throw new ValidationError("Integration has no board");
  getBoardRow(boardId);
  const ex = extract(i.kind, headers, body);
  db.update(integrations).set({ lastEventAt: new Date().toISOString() }).where(eq(integrations.id, i.id)).run();
  if (ex.skip) return { ok: true, skipped: ex.skip };
  const actor = systemActor(i.accountId, "api");
  const values: Record<string, unknown> = {};
  const mapping = (i.config.mapping ?? {}) as Record<string, string>;
  for (const [col, path] of Object.entries(mapping)) { const v = dig(body, path); if (v !== undefined) values[col] = v; }
  const item = items.create(actor, { boardId, groupId: (i.config.groupId as string | undefined) || undefined, name: (mapping.name ? str(dig(body, mapping.name)) : "") || ex.name, values: Object.fromEntries(Object.entries(values).filter(([k]) => k !== "name")) });
  if (ex.text?.trim()) updates.create(actor, { itemId: item.id, body: textToHtml(ex.text.slice(0, 5000)) });
  return { ok: true, itemId: item.id };
}
