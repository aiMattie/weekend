/**
 * Git integration: GitHub and Bitbucket webhooks link commits, pull requests and branches to tasks.
 * A task is found by its Jira key (column `jira_key`, e.g. LMS-123) or by its item id written as
 * `weekend-<id>`, `item-<id>`, `task-<id>` or `#<id>` in the branch name, commit message or PR title/body.
 * Webhook secrets are created here (settings UI) and verified with an HMAC-SHA256 of the raw body.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { systemActor, type Actor } from "../../lib/actor";
import { NotFoundError, UnauthorizedError, ValidationError } from "../../lib/errors";
import { nowIso } from "../../lib/time";
import { assertCan } from "../../lib/permissions";
import { db } from "../../db/client";
import { boards, columns, items, workspaces } from "../../db/schema/core";
import { gitIntegrations, gitLinks, type GitLinkKind, type GitProvider } from "../../db/schema/sprints";
import { getItemRow, parse, record, requireBoard } from "./_shared";

export type GitLink = typeof gitLinks.$inferSelect;
export type Integration = Omit<typeof gitIntegrations.$inferSelect, "secret"> & { webhookPath: string; secretPreview: string };

const WEBHOOK_PATH: Record<GitProvider, string> = { github: "/api/integrations/github", bitbucket: "/api/integrations/bitbucket" };

const toDto = (r: typeof gitIntegrations.$inferSelect): Integration => {
  const { secret, ...rest } = r;
  return { ...rest, webhookPath: WEBHOOK_PATH[r.provider], secretPreview: `${secret.slice(0, 4)}...${secret.slice(-2)}` };
};

/* ------------------------------------------------------------------ settings (admins) */

export function listIntegrations(actor: Actor): Integration[] {
  assertCan(actor, "account:manage");
  return db.select().from(gitIntegrations).where(eq(gitIntegrations.accountId, actor.accountId)).orderBy(desc(gitIntegrations.createdAt)).all().map(toDto);
}

const newSecret = () => randomBytes(24).toString("hex");

/** Creates an integration and returns the secret ONCE (it is only shown at creation / rotation). */
export function createIntegration(actor: Actor, input: unknown): Integration & { secret: string } {
  assertCan(actor, "account:manage");
  const d = parse(z.object({ provider: z.enum(["github", "bitbucket"]), name: z.string().trim().min(1).max(100).optional() }), input);
  const secret = newSecret();
  const row = db.insert(gitIntegrations).values({ accountId: actor.accountId, provider: d.provider, name: d.name ?? (d.provider === "github" ? "GitHub" : "Bitbucket"), secret, createdBy: actor.isSystem ? null : actor.id }).returning().get();
  return { ...toDto(row), secret };
}

export function rotateSecret(actor: Actor, id: string): Integration & { secret: string } {
  assertCan(actor, "account:manage");
  const cur = db.select().from(gitIntegrations).where(and(eq(gitIntegrations.id, id), eq(gitIntegrations.accountId, actor.accountId))).get();
  if (!cur) throw new NotFoundError("Integration");
  const secret = newSecret();
  const row = db.update(gitIntegrations).set({ secret }).where(eq(gitIntegrations.id, id)).returning().get();
  return { ...toDto(row), secret };
}

export function removeIntegration(actor: Actor, id: string): void {
  assertCan(actor, "account:manage");
  const cur = db.select().from(gitIntegrations).where(and(eq(gitIntegrations.id, id), eq(gitIntegrations.accountId, actor.accountId))).get();
  if (!cur) throw new NotFoundError("Integration");
  db.delete(gitIntegrations).where(eq(gitIntegrations.id, id)).run();
}

export function linksForItem(actor: Actor, itemId: string): GitLink[] {
  const it = getItemRow(itemId);
  requireBoard(actor, it.boardId, "board:view");
  return db.select().from(gitLinks).where(eq(gitLinks.itemId, itemId)).orderBy(desc(gitLinks.updatedAt)).all();
}

/* ------------------------------------------------------------------ matching */

const JIRA_RE = /\b(?!(?:Weekend|item|pulse|task)-)([A-Za-z][A-Za-z0-9]{1,9}-\d{1,7})\b/gi;
const ITEM_RE = /(?:Weekend|item|pulse|task)[-_#/ ]?(\d{6,})|#(\d{8,})/gi;

export function extractKeys(text: string): { jira: string[]; itemIds: string[] } {
  const jira = new Set<string>();
  const ids = new Set<string>();
  for (const m of text.matchAll(JIRA_RE)) jira.add(m[1].toUpperCase());
  for (const m of text.matchAll(ITEM_RE)) ids.add(m[1] ?? m[2]);
  return { jira: [...jira], itemIds: [...ids] };
}

/** Active items of this account matching the Jira keys / item ids. */
export function findItems(accountId: string, texts: string[]): { id: string; boardId: string }[] {
  const { jira, itemIds } = extractKeys(texts.join("\n"));
  const found = new Map<string, { id: string; boardId: string }>();
  const inAccount = (boardId: string) => db.select({ id: boards.id }).from(boards).innerJoin(workspaces, eq(workspaces.id, boards.workspaceId)).where(and(eq(boards.id, boardId), eq(workspaces.accountId, accountId))).get();
  for (const id of itemIds) {
    const it = db.select().from(items).where(and(eq(items.id, id), eq(items.state, "active"))).get();
    if (it && inAccount(it.boardId)) found.set(it.id, { id: it.id, boardId: it.boardId });
  }
  if (jira.length) {
    const cols = db.select({ id: columns.id, boardId: columns.boardId }).from(columns).where(eq(columns.key, "jira_key")).all().filter((c) => inAccount(c.boardId));
    for (const c of cols) {
      for (const key of jira) {
        const rows = db.select({ id: items.id, boardId: items.boardId }).from(items)
          .where(and(eq(items.boardId, c.boardId), eq(items.state, "active"), sql`upper(json_extract(${items.values}, ${`$."${c.id}"`})) = ${key}`)).all();
        for (const r of rows) found.set(r.id, r);
      }
    }
  }
  return [...found.values()];
}

interface Ref { provider: GitProvider; kind: GitLinkKind; repo: string; externalId: string; title: string; url: string | null; author: string | null; state: string | null; texts: string[] }

function upsertLinks(accountId: string, ref: Ref): number {
  const targets = findItems(accountId, ref.texts);
  const now = nowIso();
  for (const t of targets) {
    db.insert(gitLinks).values({ accountId, itemId: t.id, boardId: t.boardId, provider: ref.provider, kind: ref.kind, repo: ref.repo, externalId: ref.externalId, title: ref.title, url: ref.url, author: ref.author, state: ref.state, updatedAt: now })
      .onConflictDoUpdate({ target: [gitLinks.itemId, gitLinks.provider, gitLinks.repo, gitLinks.kind, gitLinks.externalId], set: { title: ref.title, url: ref.url, state: ref.state, updatedAt: now } }).run();
    record(systemActor(accountId, "system"), { type: "item.updated", boardId: t.boardId, itemId: t.id }, null);
  }
  return targets.length;
}

/* ------------------------------------------------------------------ payload parsing */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const firstLine = (s: string) => s.split("\n")[0].slice(0, 200);

type ParsedRef = Omit<Ref, "provider">;

function parseGithub(event: string, p: Json): ParsedRef[] {
  const repo: string = p.repository?.full_name ?? "unknown";
  const html: string = p.repository?.html_url ?? "";
  const out: ParsedRef[] = [];
  const branch = (name: string) => out.push({ kind: "branch", repo, externalId: name, title: name, url: html ? `${html}/tree/${name}` : null, author: p.sender?.login ?? null, state: null, texts: [name] });
  if (event === "push") {
    const ref: string = p.ref ?? "";
    if (ref.startsWith("refs/heads/") && !p.deleted) branch(ref.slice("refs/heads/".length));
    for (const c of (p.commits ?? []) as Json[]) {
      out.push({ kind: "commit", repo, externalId: c.id, title: firstLine(c.message ?? ""), url: c.url ?? null, author: c.author?.name ?? c.author?.username ?? null, state: null, texts: [c.message ?? "", ref.replace("refs/heads/", "")] });
    }
  } else if (event === "create" && p.ref_type === "branch") {
    branch(p.ref);
  } else if (event === "pull_request" && p.pull_request) {
    const pr = p.pull_request;
    out.push({ kind: "pull_request", repo, externalId: String(pr.number), title: pr.title ?? "", url: pr.html_url ?? null, author: pr.user?.login ?? null, state: pr.merged ? "merged" : pr.state ?? "open", texts: [pr.title ?? "", pr.body ?? "", pr.head?.ref ?? ""] });
    if (pr.head?.ref) branch(pr.head.ref);
  }
  return out;
}

function parseBitbucket(event: string, p: Json): ParsedRef[] {
  const repo: string = p.repository?.full_name ?? "unknown";
  const out: ParsedRef[] = [];
  if (event === "repo:push") {
    for (const ch of (p.push?.changes ?? []) as Json[]) {
      const name: string | undefined = ch.new?.type === "branch" ? ch.new.name : undefined;
      if (name) out.push({ kind: "branch", repo, externalId: name, title: name, url: ch.new?.links?.html?.href ?? null, author: p.actor?.display_name ?? null, state: null, texts: [name] });
      for (const c of (ch.commits ?? []) as Json[]) {
        out.push({ kind: "commit", repo, externalId: c.hash, title: firstLine(c.message ?? ""), url: c.links?.html?.href ?? null, author: c.author?.user?.display_name ?? c.author?.raw ?? null, state: null, texts: [c.message ?? "", name ?? ""] });
      }
    }
  } else if (event.startsWith("pullrequest:") && p.pullrequest) {
    const pr = p.pullrequest;
    const state = ({ OPEN: "open", MERGED: "merged", DECLINED: "closed", SUPERSEDED: "closed" } as Record<string, string>)[pr.state] ?? "open";
    out.push({ kind: "pull_request", repo, externalId: String(pr.id), title: pr.title ?? "", url: pr.links?.html?.href ?? null, author: pr.author?.display_name ?? null, state, texts: [pr.title ?? "", pr.description ?? "", pr.source?.branch?.name ?? ""] });
    if (pr.source?.branch?.name) out.push({ kind: "branch", repo, externalId: pr.source.branch.name, title: pr.source.branch.name, url: null, author: pr.author?.display_name ?? null, state: null, texts: [pr.source.branch.name] });
  }
  return out;
}

/* ------------------------------------------------------------------ webhook entry */

export function signBody(secret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

function signatureMatches(header: string | null, secret: string, rawBody: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(signBody(secret, rawBody));
  const got = Buffer.from(header.trim());
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export interface WebhookInput { provider: GitProvider; rawBody: string; header: (name: string) => string | null }
export interface WebhookResult { ok: true; event: string; refs: number; linked: number }

/** Verify the HMAC against the secrets of the provider, then link refs to tasks. Throws UnauthorizedError on a bad signature. */
export function handleWebhook(input: WebhookInput): WebhookResult {
  const sig = input.header("x-hub-signature-256") ?? input.header("x-hub-signature");
  const integration = db.select().from(gitIntegrations).where(and(eq(gitIntegrations.provider, input.provider), eq(gitIntegrations.active, true))).all()
    .find((i) => signatureMatches(sig, i.secret, input.rawBody));
  if (!integration) throw new UnauthorizedError("Invalid webhook signature");
  const event = (input.provider === "github" ? input.header("x-github-event") : input.header("x-event-key")) ?? "unknown";
  let payload: Json;
  try { payload = JSON.parse(input.rawBody); } catch { throw new ValidationError("Payload is not JSON"); }
  db.update(gitIntegrations).set({ lastEventAt: nowIso() }).where(eq(gitIntegrations.id, integration.id)).run();
  if (event === "ping") return { ok: true, event, refs: 0, linked: 0 };
  const refs = input.provider === "github" ? parseGithub(event, payload) : parseBitbucket(event, payload);
  let linked = 0;
  for (const r of refs) linked += upsertLinks(integration.accountId, { ...r, provider: input.provider } as Ref);
  return { ok: true, event, refs: refs.length, linked };
}
