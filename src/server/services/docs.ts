/**
 * WorkDocs service. A doc is Tiptap/ProseMirror JSON (`blocks`) in a workspace or attached to an
 * item (doc column). Used by REST, the UI and the MCP tools (create_doc / update_doc / read_docs).
 *
 * Access: workspace docs follow workspace permissions (view / create_board = edit); item docs follow
 * the board (board:view / board:edit_items). visibility "private" narrows that to owner + doc_members.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { can } from "../../lib/permissions";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { boards, items, users, workspaces } from "../../db/schema/core";
import { docComments, docMembers, docs, docVersions, type DocJson } from "../../db/schema/docs";
import { docToMarkdown, docToText, ensureBlockIds, extractMentions, markdownToDoc } from "../../modules/boards-extra/docs/serialize";
import { emptyDoc, type PMDoc } from "../../modules/boards-extra/docs/types";
import { notify, parse } from "./_shared";

export type DocRow = typeof docs.$inferSelect;
export type DocAccess = "none" | "view" | "edit";
export type DocDto = DocRow & { access: DocAccess; members: { userId: string; role: "editor" | "viewer"; name: string }[] };
export type DocSummary = Omit<DocRow, "blocks"> & { access: DocAccess; ownerName: string | null; itemName: string | null; excerpt: string };

/** How old the last snapshot may be before a save snapshots the previous state again. */
export const VERSION_INTERVAL_MS = 5 * 60 * 1000;
const MAX_VERSIONS = 50;

const docJsonSchema = z.object({ type: z.literal("doc"), content: z.array(z.record(z.string(), z.unknown())).optional() }).passthrough();
const blocksField = docJsonSchema.refine((d) => JSON.stringify(d).length < 8_000_000, "Doc is too large");
const visibilitySchema = z.enum(["main", "private"]);

const createInput = z.object({
  workspaceId: idSchema.optional(),
  itemId: idSchema.optional(),
  columnId: z.string().max(64).optional(),
  title: z.string().trim().max(255).optional(),
  markdown: z.string().max(2_000_000).optional(),
  blocks: blocksField.optional(),
  cover: z.string().max(2_000_000).nullish(),
  icon: z.string().max(16).nullish(),
  visibility: visibilitySchema.optional(),
});

const updateInput = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  blocks: blocksField.optional(),
  markdown: z.string().max(2_000_000).optional(),
  appendMarkdown: z.string().max(2_000_000).optional(),
  cover: z.string().max(2_000_000).nullish(),
  icon: z.string().max(16).nullish(),
  visibility: visibilitySchema.optional(),
});

const listInput = z.object({ workspaceId: idSchema.optional(), itemId: idSchema.optional(), limit: z.number().int().min(1).max(500).default(200) });

/* ------------------------------------------------------------ access */

function getRow(docId: string): DocRow {
  const d = db.select().from(docs).where(eq(docs.id, docId)).get();
  if (!d || d.state === "deleted") throw new NotFoundError("Doc");
  return d;
}

export function accessOf(actor: Actor, d: DocRow): DocAccess {
  if (actor.isSystem || actor.role === "admin") return "edit";
  let base: DocAccess = "none";
  if (d.boardId) {
    if (can(actor, "board:edit_items", { boardId: d.boardId })) base = "edit";
    else if (can(actor, "board:view", { boardId: d.boardId })) base = "view";
  } else if (can(actor, "workspace:view", { workspaceId: d.workspaceId })) {
    base = can(actor, "workspace:create_board", { workspaceId: d.workspaceId }) ? "edit" : "view";
  }
  if (base === "none" || d.visibility === "main") return base;
  if (d.ownerId === actor.id) return base;
  const m = db.select().from(docMembers).where(and(eq(docMembers.docId, d.id), eq(docMembers.userId, actor.id))).get();
  if (!m) return "none";
  return m.role === "editor" ? base : "view";
}

function requireAccess(actor: Actor, docId: string, need: "view" | "edit"): DocRow {
  const d = getRow(docId);
  const a = accessOf(actor, d);
  if (a === "none" || (need === "edit" && a !== "edit")) {
    if (a === "none") throw new NotFoundError("Doc");
    throw new ForbiddenError("You can only view this doc");
  }
  return d;
}

const isOwnerOrAdmin = (actor: Actor, d: DocRow) => actor.isSystem || actor.role === "admin" || d.ownerId === actor.id;

function membersOf(docId: string): DocDto["members"] {
  return db.select({ userId: docMembers.userId, role: docMembers.role, name: users.name }).from(docMembers)
    .innerJoin(users, eq(users.id, docMembers.userId)).where(eq(docMembers.docId, docId)).all();
}

/* ------------------------------------------------------------ helpers */

function toDto(actor: Actor, d: DocRow): DocDto {
  return { ...d, access: accessOf(actor, d), members: membersOf(d.id) };
}

function resolveInitialBlocks(input: { markdown?: string; blocks?: unknown }): PMDoc {
  if (input.blocks) return input.blocks as PMDoc;
  if (input.markdown !== undefined) return markdownToDoc(input.markdown);
  return emptyDoc();
}

/** Notify users that are newly mentioned in `after` compared to `before`. */
function notifyMentions(actor: Actor, d: DocRow, before: PMDoc | null, after: PMDoc): void {
  const prev = new Set(extractMentions(before));
  const fresh = extractMentions(after).filter((id) => !prev.has(id));
  if (!fresh.length) return;
  const valid = db.select({ id: users.id }).from(users).where(and(inArray(users.id, fresh), eq(users.accountId, actor.accountId))).all();
  for (const u of valid) {
    notify(actor, u.id, {
      type: "mention", title: { key: "notif.docMention", vars: { actor: actor.name ?? "?", item: d.title } },
      body: docToText(after).slice(0, 200), boardId: d.boardId ?? undefined, itemId: d.itemId ?? undefined, link: `/docs/${d.id}`,
    });
  }
}

function snapshot(d: DocRow, userId: string | null): void {
  db.insert(docVersions).values({ docId: d.id, title: d.title, blocks: d.blocks, userId }).run();
  const all = db.select({ id: docVersions.id }).from(docVersions).where(eq(docVersions.docId, d.id)).orderBy(desc(docVersions.createdAt), desc(docVersions.id)).all();
  if (all.length > MAX_VERSIONS) db.delete(docVersions).where(inArray(docVersions.id, all.slice(MAX_VERSIONS).map((v) => v.id))).run();
}

/* ------------------------------------------------------------ queries */

export function list(actor: Actor, query: unknown = {}): DocSummary[] {
  const q = parse(listInput, query);
  if (q.workspaceId && !actor.isSystem) {
    if (!can(actor, "workspace:view", { workspaceId: q.workspaceId })) throw new ForbiddenError();
  }
  const rows = db.select({
    id: docs.id, workspaceId: docs.workspaceId, itemId: docs.itemId, boardId: docs.boardId, columnId: docs.columnId, title: docs.title,
    cover: docs.cover, icon: docs.icon, visibility: docs.visibility, state: docs.state, ownerId: docs.ownerId, position: docs.position,
    createdAt: docs.createdAt, updatedAt: docs.updatedAt, blocks: docs.blocks,
  }).from(docs)
    .where(and(eq(docs.state, "active"), q.workspaceId ? eq(docs.workspaceId, q.workspaceId) : undefined, q.itemId ? eq(docs.itemId, q.itemId) : undefined))
    .orderBy(desc(docs.updatedAt), desc(docs.id)).all();
  const owners = new Map(db.select({ id: users.id, name: users.name }).from(users).where(eq(users.accountId, actor.accountId)).all().map((u) => [u.id, u.name]));
  const itemIds = [...new Set(rows.map((r) => r.itemId).filter(Boolean) as string[])];
  const itemNames = new Map(itemIds.length ? db.select({ id: items.id, name: items.name }).from(items).where(inArray(items.id, itemIds)).all().map((i) => [i.id, i.name]) : []);
  const out: DocSummary[] = [];
  for (const r of rows) {
    const { blocks, ...rest } = r;
    const access = accessOf(actor, { ...rest, blocks } as DocRow);
    if (access === "none") continue;
    out.push({ ...rest, access, ownerName: r.ownerId ? owners.get(r.ownerId) ?? null : null, itemName: r.itemId ? itemNames.get(r.itemId) ?? null : null, excerpt: docToText(blocks as PMDoc).slice(0, 160) });
    if (out.length >= q.limit) break;
  }
  return out;
}

export function get(actor: Actor, docId: string): DocDto {
  return toDto(actor, requireAccess(actor, docId, "view"));
}

const readInput = z.object({
  ids: z.array(idSchema).max(100).optional(),
  workspaceId: idSchema.optional(),
  itemId: idSchema.optional(),
  format: z.enum(["markdown", "blocks", "both"]).default("markdown"),
});

export interface ReadDoc {
  id: string; title: string; workspaceId: string; itemId: string | null; url: string; updatedAt: string; visibility: DocRow["visibility"];
  markdown?: string; blocks?: DocJson;
}

/** MCP read_docs: docs by id, or all docs of a workspace / item, as markdown and/or block JSON. */
export function read(actor: Actor, input: unknown = {}): ReadDoc[] {
  const q = parse(readInput, input);
  let rows: DocRow[];
  if (q.ids?.length) {
    rows = db.select().from(docs).where(and(inArray(docs.id, q.ids), eq(docs.state, "active"))).all();
  } else {
    const ids = list(actor, { workspaceId: q.workspaceId, itemId: q.itemId }).map((d) => d.id);
    rows = ids.length ? db.select().from(docs).where(inArray(docs.id, ids)).all() : [];
  }
  return rows.filter((d) => accessOf(actor, d) !== "none").map((d) => ({
    id: d.id, title: d.title, workspaceId: d.workspaceId, itemId: d.itemId, url: `/docs/${d.id}`, updatedAt: d.updatedAt, visibility: d.visibility,
    ...(q.format !== "blocks" ? { markdown: docToMarkdown(d.blocks as PMDoc, { mentions: "link" }) } : {}),
    ...(q.format !== "markdown" ? { blocks: d.blocks } : {}),
  }));
}

export function toMarkdown(actor: Actor, docId: string): string {
  const d = requireAccess(actor, docId, "view");
  return `# ${d.title}\n\n${docToMarkdown(d.blocks as PMDoc)}`;
}

/* ------------------------------------------------------------ mutations */

export function create(actor: Actor, input: unknown): DocDto {
  const d = parse(createInput, input);
  let workspaceId = d.workspaceId;
  let boardId: string | null = null;
  let title = d.title || "Naamloos document";
  if (d.itemId) {
    const it = db.select().from(items).where(eq(items.id, d.itemId)).get();
    if (!it || it.state === "deleted") throw new NotFoundError("Item");
    if (!can(actor, "board:edit_items", { boardId: it.boardId })) throw new ForbiddenError();
    boardId = it.boardId;
    workspaceId = db.select({ w: boards.workspaceId }).from(boards).where(eq(boards.id, it.boardId)).get()!.w;
    if (!d.title) title = it.name;
  } else {
    if (!workspaceId) throw new ValidationError("workspaceId or itemId is required");
    const ws = db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).get();
    if (!ws) throw new NotFoundError("Workspace");
    if (!can(actor, "workspace:create_board", { workspaceId })) throw new ForbiddenError();
  }
  const blocks = ensureBlockIds(resolveInitialBlocks(d)) as DocJson;
  const row = db.insert(docs).values({
    workspaceId: workspaceId!, itemId: d.itemId ?? null, boardId, columnId: d.columnId ?? null, title, blocks,
    cover: d.cover ?? null, icon: d.icon ?? null, visibility: d.visibility ?? "main", ownerId: actor.isSystem ? null : actor.id,
  }).returning().get();
  notifyMentions(actor, row, null, blocks as PMDoc);
  return toDto(actor, row);
}

/** The doc attached to an item (optionally per doc column); created on first use. */
export function getOrCreateForItem(actor: Actor, input: unknown): DocDto {
  const d = parse(z.object({ itemId: idSchema, columnId: z.string().max(64).optional() }), input);
  const found = db.select().from(docs)
    .where(and(eq(docs.itemId, d.itemId), eq(docs.state, "active"), d.columnId ? eq(docs.columnId, d.columnId) : undefined))
    .orderBy(asc(docs.createdAt)).get();
  if (found) return get(actor, found.id);
  return create(actor, { itemId: d.itemId, columnId: d.columnId });
}

export function update(actor: Actor, docId: string, input: unknown): DocDto {
  const p = parse(updateInput, input);
  const cur = requireAccess(actor, docId, "edit");
  if (p.visibility && p.visibility !== cur.visibility && !isOwnerOrAdmin(actor, cur)) throw new ForbiddenError("Only the owner can change sharing");
  const set: Partial<typeof docs.$inferInsert> = {};
  if (p.title !== undefined) set.title = p.title;
  if (p.cover !== undefined) set.cover = p.cover;
  if (p.icon !== undefined) set.icon = p.icon;
  if (p.visibility !== undefined) set.visibility = p.visibility;
  let next: PMDoc | null = null;
  if (p.blocks) next = p.blocks as PMDoc;
  else if (p.markdown !== undefined) next = markdownToDoc(p.markdown);
  if (p.appendMarkdown) {
    const base = next ?? (cur.blocks as PMDoc);
    next = { type: "doc", content: [...(base.content ?? []).filter((n, i, a) => !(a.length === 1 && n.type === "paragraph" && !n.content?.length)), ...(markdownToDoc(p.appendMarkdown).content ?? [])] };
  }
  if (next) {
    next = ensureBlockIds(next);
    set.blocks = next as DocJson;
    const last = db.select({ createdAt: docVersions.createdAt }).from(docVersions).where(eq(docVersions.docId, docId)).orderBy(desc(docVersions.createdAt), desc(docVersions.id)).get();
    const changed = JSON.stringify(cur.blocks) !== JSON.stringify(next);
    if (changed && (!last || Date.now() - Date.parse(last.createdAt) > VERSION_INTERVAL_MS)) snapshot(cur, actor.isSystem ? null : actor.id);
  }
  if (!Object.keys(set).length) return toDto(actor, cur);
  const row = db.update(docs).set(set).where(eq(docs.id, docId)).returning().get();
  if (next) notifyMentions(actor, row, cur.blocks as PMDoc, next);
  return toDto(actor, row);
}

/** Soft delete. */
export function remove(actor: Actor, docId: string): void {
  const d = requireAccess(actor, docId, "edit");
  if (!isOwnerOrAdmin(actor, d) && d.visibility === "private") throw new ForbiddenError();
  db.update(docs).set({ state: "deleted" }).where(eq(docs.id, docId)).run();
}

export function setMembers(actor: Actor, docId: string, input: unknown): DocDto {
  const members = parse(z.array(z.object({ userId: idSchema, role: z.enum(["editor", "viewer"]).default("editor") })).max(200), input);
  const d = requireAccess(actor, docId, "edit");
  if (!isOwnerOrAdmin(actor, d)) throw new ForbiddenError("Only the owner can change sharing");
  const valid = new Set(db.select({ id: users.id }).from(users).where(eq(users.accountId, actor.accountId)).all().map((u) => u.id));
  db.transaction((tx) => {
    tx.delete(docMembers).where(eq(docMembers.docId, docId)).run();
    for (const m of members) if (valid.has(m.userId) && m.userId !== d.ownerId) tx.insert(docMembers).values({ docId, userId: m.userId, role: m.role }).run();
  });
  return get(actor, docId);
}

/* ------------------------------------------------------------ versions */

export function listVersions(actor: Actor, docId: string) {
  requireAccess(actor, docId, "view");
  return db.select({ id: docVersions.id, title: docVersions.title, createdAt: docVersions.createdAt, userId: docVersions.userId, userName: users.name })
    .from(docVersions).leftJoin(users, eq(users.id, docVersions.userId)).where(eq(docVersions.docId, docId))
    .orderBy(desc(docVersions.createdAt), desc(docVersions.id)).all();
}

/** Snapshot the current state on demand ("Save version"). */
export function createVersion(actor: Actor, docId: string): { id: string } {
  const d = requireAccess(actor, docId, "edit");
  snapshot(d, actor.isSystem ? null : actor.id);
  return { id: db.select({ id: docVersions.id }).from(docVersions).where(eq(docVersions.docId, docId)).orderBy(desc(docVersions.createdAt), desc(docVersions.id)).get()!.id };
}

export function getVersion(actor: Actor, docId: string, versionId: string) {
  requireAccess(actor, docId, "view");
  const v = db.select().from(docVersions).where(and(eq(docVersions.id, versionId), eq(docVersions.docId, docId))).get();
  if (!v) throw new NotFoundError("Version");
  return v;
}

/** Restore a version; the current state is snapshotted first so nothing is lost. */
export function restoreVersion(actor: Actor, docId: string, versionId: string): DocDto {
  const d = requireAccess(actor, docId, "edit");
  const v = getVersion(actor, docId, versionId);
  snapshot(d, actor.isSystem ? null : actor.id);
  const row = db.update(docs).set({ title: v.title, blocks: v.blocks }).where(eq(docs.id, docId)).returning().get();
  return toDto(actor, row);
}

/* ------------------------------------------------------------ comments */

export type DocCommentDto = typeof docComments.$inferSelect & { authorName: string | null };

export function listComments(actor: Actor, docId: string): DocCommentDto[] {
  requireAccess(actor, docId, "view");
  return db.select({
    id: docComments.id, docId: docComments.docId, blockId: docComments.blockId, parentId: docComments.parentId, userId: docComments.userId,
    body: docComments.body, resolved: docComments.resolved, createdAt: docComments.createdAt, authorName: users.name,
  }).from(docComments).leftJoin(users, eq(users.id, docComments.userId)).where(eq(docComments.docId, docId)).orderBy(asc(docComments.createdAt), asc(docComments.id)).all();
}

/** `@Full Name` in a comment mentions that user (longest name wins). */
export function mentionedUserIds(accountId: string, body: string): string[] {
  const text = body.toLowerCase();
  const all = db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.accountId, accountId), eq(users.isActive, true))).all();
  return all.filter((u) => text.includes(`@${u.name.toLowerCase()}`)).map((u) => u.id);
}

export function addComment(actor: Actor, docId: string, input: unknown): DocCommentDto {
  const c = parse(z.object({ body: z.string().trim().min(1).max(5000), blockId: z.string().max(64).nullish(), parentId: idSchema.nullish() }), input);
  const d = requireAccess(actor, docId, "view");
  if (c.parentId) {
    const parent = db.select().from(docComments).where(and(eq(docComments.id, c.parentId), eq(docComments.docId, docId))).get();
    if (!parent) throw new NotFoundError("Comment");
  }
  const row = db.insert(docComments).values({ docId, blockId: c.blockId ?? null, parentId: c.parentId ?? null, userId: actor.isSystem ? null : actor.id, body: c.body }).returning().get();
  for (const uid of mentionedUserIds(actor.accountId, c.body)) {
    notify(actor, uid, { type: "mention", title: { key: "notif.commentMention", vars: { actor: actor.name ?? "?", item: d.title } }, body: c.body.slice(0, 200), boardId: d.boardId ?? undefined, itemId: d.itemId ?? undefined, link: `/docs/${d.id}` });
  }
  return { ...row, authorName: actor.name ?? null };
}

export function resolveComment(actor: Actor, docId: string, commentId: string, resolved = true): DocCommentDto {
  requireAccess(actor, docId, "view");
  const cur = db.select().from(docComments).where(and(eq(docComments.id, commentId), eq(docComments.docId, docId))).get();
  if (!cur) throw new NotFoundError("Comment");
  db.update(docComments).set({ resolved }).where(eq(docComments.id, commentId)).run();
  return listComments(actor, docId).find((x) => x.id === commentId)!;
}

export function removeComment(actor: Actor, docId: string, commentId: string): void {
  requireAccess(actor, docId, "view");
  const cur = db.select().from(docComments).where(and(eq(docComments.id, commentId), eq(docComments.docId, docId))).get();
  if (!cur) throw new NotFoundError("Comment");
  if (!actor.isSystem && actor.role !== "admin" && cur.userId !== actor.id) throw new ForbiddenError("You can only delete your own comments");
  db.delete(docComments).where(eq(docComments.parentId, commentId)).run();
  db.delete(docComments).where(eq(docComments.id, commentId)).run();
}
