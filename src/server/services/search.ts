/**
 * Global search over boards, items, updates, docs, users and workspaces.
 *
 *  - Index: SQLite FTS5 table `search_index` (+ `search_map` for O(1) row lookup), created lazily per connection.
 *  - Kept up to date from bus events (item / update / board / workspace / member events) and by a cheap
 *    reconcile per kind on every search (count + newest stamp must match), which also builds the index the first time
 *    and covers docs (no events yet).
 *  - Results are permission filtered AFTER the index lookup (boards, workspaces, docs, items of hidden columns are never leaked).
 *  - Recent searches are stored per user.
 * `search(actor, q)` is what the platform's MCP `search` tool calls.
 */
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { boardVisibilityFilter, workspaceVisibilityFilter } from "../../lib/permissions";
import { subscribe } from "../../lib/events";
import { db, getSqlite, type Sqlite } from "../../db/client";
import { boards, columns, items, updates, users, workspaces } from "../../db/schema/core";
import { docMembers, docs } from "../../db/schema/docs";
import { columnPermissions, recentSearches } from "../../db/schema/audit-log";
import { getColumnLogic } from "../columns/registry";
import { parse } from "./_shared";

export const SEARCH_KINDS = ["board", "item", "update", "doc", "user", "workspace"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export interface SearchHit {
  kind: SearchKind; id: string; title: string; href: string;
  /** text around the match, split into plain and highlighted parts */
  snippet: { text: string; hit: boolean }[];
  boardId?: string; boardName?: string; workspaceId?: string; workspaceName?: string; subtitle?: string;
}
export interface SearchGroup { kind: SearchKind; hits: SearchHit[]; more: boolean }
export interface SearchResult { query: string; groups: SearchGroup[]; total: number }

const HL_OPEN = "\u0001";
const HL_CLOSE = "\u0002";

/* ------------------------------------------------------------------ schema */

const prepared = new WeakSet<Sqlite>();
function sqlite(): Sqlite {
  const s = getSqlite();
  if (!prepared.has(s)) {
    s.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
        title, body, kind UNINDEXED, ref_id UNINDEXED, board_id UNINDEXED, workspace_id UNINDEXED, extra UNINDEXED,
        tokenize = 'unicode61 remove_diacritics 2');
      CREATE TABLE IF NOT EXISTS search_map (
        kind TEXT NOT NULL, ref_id TEXT NOT NULL, fts_rowid INTEGER NOT NULL, stamp TEXT NOT NULL DEFAULT '', board_id TEXT,
        PRIMARY KEY (kind, ref_id));
      CREATE INDEX IF NOT EXISTS search_map_board_idx ON search_map(board_id);`);
    prepared.add(s);
  }
  return s;
}

interface Doc { kind: SearchKind; id: string; title: string; body: string; boardId?: string | null; workspaceId?: string | null; extra?: string | null; stamp: string }

function upsert(d: Doc): void {
  const s = sqlite();
  const old = s.prepare("SELECT fts_rowid FROM search_map WHERE kind = ? AND ref_id = ?").get(d.kind, d.id) as { fts_rowid: number } | undefined;
  if (old) s.prepare("DELETE FROM search_index WHERE rowid = ?").run(old.fts_rowid);
  const r = s.prepare("INSERT INTO search_index (title, body, kind, ref_id, board_id, workspace_id, extra) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(d.title, d.body, d.kind, d.id, d.boardId ?? "", d.workspaceId ?? "", d.extra ?? "");
  s.prepare("INSERT INTO search_map (kind, ref_id, fts_rowid, stamp, board_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT (kind, ref_id) DO UPDATE SET fts_rowid = excluded.fts_rowid, stamp = excluded.stamp, board_id = excluded.board_id")
    .run(d.kind, d.id, Number(r.lastInsertRowid), d.stamp, d.boardId ?? null);
}

function remove(kind: SearchKind, id: string): void {
  const s = sqlite();
  const old = s.prepare("SELECT fts_rowid FROM search_map WHERE kind = ? AND ref_id = ?").get(kind, id) as { fts_rowid: number } | undefined;
  if (!old) return;
  s.prepare("DELETE FROM search_index WHERE rowid = ?").run(old.fts_rowid);
  s.prepare("DELETE FROM search_map WHERE kind = ? AND ref_id = ?").run(kind, id);
}

function removeByBoard(boardId: string): void {
  const s = sqlite();
  for (const r of s.prepare("SELECT kind, ref_id, fts_rowid FROM search_map WHERE board_id = ? AND kind != 'board'").all(boardId) as { kind: string; ref_id: string; fts_rowid: number }[]) {
    s.prepare("DELETE FROM search_index WHERE rowid = ?").run(r.fts_rowid);
    s.prepare("DELETE FROM search_map WHERE kind = ? AND ref_id = ?").run(r.kind, r.ref_id);
  }
}

/* ------------------------------------------------------------------ document builders */

type Item = typeof items.$inferSelect;

/** Text of an item: name + readable values of every column that is not view-restricted. */
function itemDoc(it: Item, ctx: BoardCtx): Doc {
  const cols = ctx.columns(it.boardId);
  const parts: string[] = [];
  for (const c of cols) {
    const v = it.values[c.id];
    if (v === undefined || v === null || c.type === "name") continue;
    try {
      const text = getColumnLogic(c.type).format(v, c, undefined);
      if (text) parts.push(text);
    } catch { /* unreadable value: skip */ }
  }
  return { kind: "item", id: it.id, title: it.name, body: parts.join(" \n"), boardId: it.boardId, workspaceId: ctx.workspaceOf(it.boardId), extra: it.parentItemId ?? "", stamp: it.updatedAt };
}

interface BoardCtx { columns: (boardId: string) => (typeof columns.$inferSelect)[]; workspaceOf: (boardId: string) => string | null }

function boardCtx(): BoardCtx {
  const restricted = new Set(db.select({ id: columnPermissions.columnId, v: columnPermissions.view }).from(columnPermissions).all().filter((r) => r.v.mode !== "everyone").map((r) => r.id));
  const cache = new Map<string, ReturnType<BoardCtx["columns"]>>();
  const ws = new Map<string, string>();
  return {
    columns: (boardId) => {
      let c = cache.get(boardId);
      if (!c) { c = db.select().from(columns).where(eq(columns.boardId, boardId)).all().filter((x) => !restricted.has(x.id)); cache.set(boardId, c); }
      return c;
    },
    workspaceOf: (boardId) => {
      if (!ws.has(boardId)) ws.set(boardId, db.select({ w: boards.workspaceId }).from(boards).where(eq(boards.id, boardId)).get()?.w ?? "");
      return ws.get(boardId) || null;
    },
  };
}

function docText(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== "object") return out;
  const n = node as { text?: unknown; content?: unknown[]; attrs?: { label?: unknown } };
  if (typeof n.text === "string") out.push(n.text);
  if (typeof n.attrs?.label === "string") out.push(n.attrs.label);
  for (const c of n.content ?? []) docText(c, out);
  return out;
}

/* ------------------------------------------------------------------ reconcile (build + repair) */

const SOURCES: Record<SearchKind, () => Doc[]> = {
  workspace: () => db.select().from(workspaces).where(eq(workspaces.state, "active")).all()
    .map((w) => ({ kind: "workspace", id: w.id, title: w.name, body: w.description ?? "", workspaceId: w.id, stamp: w.updatedAt })),
  board: () => db.select().from(boards).where(eq(boards.state, "active")).all()
    .map((b) => ({ kind: "board", id: b.id, title: b.name, body: b.description ?? "", boardId: b.id, workspaceId: b.workspaceId, stamp: b.updatedAt })),
  user: () => db.select().from(users).where(eq(users.isActive, true)).all()
    .map((u) => ({ kind: "user", id: u.id, title: u.name, body: [u.email, u.title, u.phone].filter(Boolean).join(" "), stamp: u.updatedAt })),
  item: () => {
    const ctx = boardCtx();
    const active = new Set(db.select({ id: boards.id }).from(boards).where(eq(boards.state, "active")).all().map((b) => b.id));
    return db.select().from(items).where(eq(items.state, "active")).all().filter((i) => active.has(i.boardId)).map((i) => itemDoc(i, ctx));
  },
  update: () => {
    const active = new Set(db.select({ id: boards.id }).from(boards).where(eq(boards.state, "active")).all().map((b) => b.id));
    const itemIds = new Set(db.select({ id: items.id }).from(items).where(eq(items.state, "active")).all().map((i) => i.id));
    const ws = new Map(db.select({ id: boards.id, w: boards.workspaceId }).from(boards).all().map((b) => [b.id, b.w]));
    return db.select().from(updates).all().filter((u) => active.has(u.boardId) && itemIds.has(u.itemId))
      .map((u) => ({ kind: "update", id: u.id, title: "", body: u.bodyText, boardId: u.boardId, workspaceId: ws.get(u.boardId) ?? null, extra: u.itemId, stamp: u.editedAt ?? u.createdAt }));
  },
  doc: () => db.select().from(docs).where(eq(docs.state, "active")).all()
    .map((d) => ({ kind: "doc", id: d.id, title: d.title, body: docText(d.blocks).join(" "), boardId: d.boardId, workspaceId: d.workspaceId, extra: d.itemId ?? "", stamp: d.updatedAt })),
};

/** Make the index of one kind match the database: add missing / changed rows, drop stale ones. */
export function reconcile(kind: SearchKind): number {
  const s = sqlite();
  const src = SOURCES[kind]();
  const map = new Map((s.prepare("SELECT ref_id, stamp FROM search_map WHERE kind = ?").all(kind) as { ref_id: string; stamp: string }[]).map((r) => [r.ref_id, r.stamp]));
  let changed = 0;
  s.exec("BEGIN");
  try {
    for (const d of src) {
      if (map.get(d.id) !== d.stamp) { upsert(d); changed++; }
      map.delete(d.id);
    }
    for (const id of map.keys()) { remove(kind, id); changed++; }
    s.exec("COMMIT");
  } catch (e) {
    s.exec("ROLLBACK");
    throw e;
  }
  return changed;
}

function sourceFingerprint(kind: SearchKind): string {
  switch (kind) {
    case "workspace": { const r = getSqlite().prepare("SELECT count(*) n, max(updated_at) m FROM workspaces WHERE state = 'active'").get() as { n: number; m: string }; return `${r.n}|${r.m}`; }
    case "board": { const r = getSqlite().prepare("SELECT count(*) n, max(updated_at) m FROM boards WHERE state = 'active'").get() as { n: number; m: string }; return `${r.n}|${r.m}`; }
    case "user": { const r = getSqlite().prepare("SELECT count(*) n, max(updated_at) m FROM users WHERE is_active = 1").get() as { n: number; m: string }; return `${r.n}|${r.m}`; }
    case "item": { const r = getSqlite().prepare("SELECT count(*) n, max(i.updated_at) m FROM items i JOIN boards b ON b.id = i.board_id WHERE i.state = 'active' AND b.state = 'active'").get() as { n: number; m: string }; return `${r.n}|${r.m}`; }
    case "update": { const r = getSqlite().prepare("SELECT count(*) n, max(coalesce(u.edited_at, u.created_at)) m FROM updates u JOIN items i ON i.id = u.item_id JOIN boards b ON b.id = u.board_id WHERE i.state = 'active' AND b.state = 'active'").get() as { n: number; m: string }; return `${r.n}|${r.m}`; }
    case "doc": { const r = getSqlite().prepare("SELECT count(*) n, max(updated_at) m FROM docs WHERE state = 'active'").get() as { n: number; m: string }; return `${r.n}|${r.m}`; }
  }
}

function indexFingerprint(kind: SearchKind): string {
  const r = sqlite().prepare("SELECT count(*) n, max(stamp) m FROM search_map WHERE kind = ?").get(kind) as { n: number; m: string | null };
  return `${r.n}|${r.m}`;
}

/** Cheap freshness check + repair, run before every search. */
export function ensureFresh(kinds: readonly SearchKind[] = SEARCH_KINDS): void {
  sqlite();
  for (const k of kinds) {
    try { if (sourceFingerprint(k) !== indexFingerprint(k)) reconcile(k); } catch (e) { console.error("[search] reconcile failed", k, e instanceof Error ? e.message : e); }
  }
}

/** Rebuild everything (admin tool / tests). */
export function reindexAll(): void {
  const s = sqlite();
  s.exec("DELETE FROM search_index; DELETE FROM search_map;");
  for (const k of SEARCH_KINDS) reconcile(k);
}

/** Re-index the items of a board (after column permissions changed). */
export function reindexBoard(boardId: string): void {
  const ctx = boardCtx();
  for (const it of db.select().from(items).where(and(eq(items.boardId, boardId), eq(items.state, "active"))).all()) upsert(itemDoc(it, ctx));
}

/* ------------------------------------------------------------------ querying */

/** Turn free text into a safe FTS5 expression: every word is a quoted prefix term (AND). */
export function toMatch(q: string): string | null {
  const words = q.normalize("NFKC").split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 8);
  return words.length ? words.map((w) => `"${w}"*`).join(" ") : null;
}

const searchInput = z.object({
  q: z.string().trim().min(1).max(200),
  kinds: z.array(z.enum(SEARCH_KINDS)).optional(),
  /** hits per kind */
  limit: z.coerce.number().int().min(1).max(50).default(8),
});

interface Raw { kind: SearchKind; ref_id: string; title: string; board_id: string; workspace_id: string; extra: string; snip: string }

function parts(snip: string): { text: string; hit: boolean }[] {
  const out: { text: string; hit: boolean }[] = [];
  let hit = false;
  for (const seg of snip.split(new RegExp(`(${HL_OPEN}|${HL_CLOSE})`))) {
    if (seg === HL_OPEN) hit = true;
    else if (seg === HL_CLOSE) hit = false;
    else if (seg) out.push({ text: seg, hit });
  }
  return out;
}

/** Permission filtered, grouped search. */
export function search(actor: Actor, input: unknown): SearchResult {
  const d = parse(searchInput, typeof input === "string" ? { q: input } : input);
  const match = toMatch(d.q);
  const kinds = d.kinds ?? [...SEARCH_KINDS];
  if (!match) return { query: d.q, groups: [], total: 0 };
  ensureFresh(kinds);
  const s = sqlite();

  const boardOk = boardVisibilityFilter(actor);
  const wsOk = workspaceVisibilityFilter(actor);
  const boardRows = new Map(db.select().from(boards).where(eq(boards.state, "active")).all().map((b) => [b.id, b]));
  const wsRows = new Map(db.select().from(workspaces).where(eq(workspaces.state, "active")).all().map((w) => [w.id, w]));
  const boardAllowed = new Map<string, boolean>();
  const canBoard = (id: string): boolean => {
    if (!boardAllowed.has(id)) { const b = boardRows.get(id); boardAllowed.set(id, !!b && boardOk(b)); }
    return boardAllowed.get(id)!;
  };
  const isGuest = actor.role === "guest" && !actor.isSystem;
  const itemBoard = new Map<string, string>();

  const groups: SearchGroup[] = [];
  const stmt = s.prepare(`SELECT kind, ref_id, title, board_id, workspace_id, extra,
      snippet(search_index, 1, '${HL_OPEN}', '${HL_CLOSE}', ' … ', 14) AS snip
    FROM search_index WHERE search_index MATCH ? AND kind = ? ORDER BY bm25(search_index, 8.0, 1.0) LIMIT 300`);

  for (const kind of kinds) {
    const raws = stmt.all(`{title body} : (${match})`, kind) as Raw[];
    const hits: SearchHit[] = [];
    let more = false;
    for (const r of raws) {
      let ok = false;
      switch (kind) {
        case "workspace": { const w = wsRows.get(r.ref_id); ok = !!w && wsOk(w); break; }
        case "board": ok = canBoard(r.ref_id); break;
        case "item":
        case "update": ok = !!r.board_id && canBoard(r.board_id); break;
        case "user": ok = !isGuest || r.ref_id === actor.id; break;
        case "doc": ok = docAllowed(actor, r.ref_id, r.board_id, r.workspace_id, canBoard, wsOk, wsRows); break;
      }
      if (!ok) continue;
      if (hits.length >= d.limit) { more = true; break; }
      const b = r.board_id ? boardRows.get(r.board_id) : undefined;
      const wsId = b?.workspaceId ?? r.workspace_id;
      const w = wsId ? wsRows.get(wsId) : undefined;
      const base = { kind, id: r.ref_id, snippet: parts(r.snip), boardId: b?.id, boardName: b?.name, workspaceId: w?.id, workspaceName: w?.name };
      if (kind === "workspace") hits.push({ ...base, title: r.title, href: `/workspaces/${r.ref_id}` });
      else if (kind === "board") hits.push({ ...base, title: r.title, href: `/boards/${r.ref_id}`, subtitle: w?.name });
      else if (kind === "item") hits.push({ ...base, title: r.title, href: `/boards/${r.board_id}?item=${r.ref_id}`, subtitle: [w?.name, b?.name].filter(Boolean).join(" / ") });
      else if (kind === "update") {
        if (!itemBoard.has(r.extra)) itemBoard.set(r.extra, db.select({ n: items.name }).from(items).where(eq(items.id, r.extra)).get()?.n ?? "");
        hits.push({ ...base, title: itemBoard.get(r.extra) || "Update", href: `/boards/${r.board_id}?item=${r.extra}`, subtitle: [w?.name, b?.name].filter(Boolean).join(" / ") });
      } else if (kind === "doc") hits.push({ ...base, title: r.title, href: `/docs/${r.ref_id}`, subtitle: w?.name });
      else hits.push({ ...base, title: r.title, href: `/profile/${r.ref_id}` });
    }
    if (hits.length) groups.push({ kind, hits, more });
  }
  return { query: d.q, groups, total: groups.reduce((n, g) => n + g.hits.length, 0) };
}

function docAllowed(
  actor: Actor, docId: string, boardId: string, workspaceId: string,
  canBoard: (id: string) => boolean, wsOk: (w: { id: string; kind: "open" | "closed"; state: string }) => boolean,
  wsRows: Map<string, typeof workspaces.$inferSelect>,
): boolean {
  if (actor.isSystem || actor.role === "admin") return true;
  if (actor.role === "guest") return !!boardId && canBoard(boardId);
  const row = db.select({ visibility: docs.visibility, ownerId: docs.ownerId }).from(docs).where(eq(docs.id, docId)).get();
  if (!row) return false;
  if (row.visibility === "private") {
    return row.ownerId === actor.id || !!db.select({ u: docMembers.userId }).from(docMembers).where(and(eq(docMembers.docId, docId), eq(docMembers.userId, actor.id))).get();
  }
  if (boardId) return canBoard(boardId);
  const w = wsRows.get(workspaceId);
  return !!w && wsOk(w);
}

/* ------------------------------------------------------------------ recent searches */

export function recent(actor: Actor, limit = 8): string[] {
  return db.select({ q: recentSearches.query }).from(recentSearches).where(eq(recentSearches.userId, actor.id)).orderBy(desc(recentSearches.createdAt)).limit(limit).all().map((r) => r.q);
}

export function addRecent(actor: Actor, query: string): void {
  const q = parse(z.string().trim().min(2).max(100), query);
  db.insert(recentSearches).values({ userId: actor.id, query: q, createdAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: [recentSearches.userId, recentSearches.query], set: { createdAt: new Date().toISOString() } }).run();
  const old = db.select({ q: recentSearches.query }).from(recentSearches).where(eq(recentSearches.userId, actor.id)).orderBy(desc(recentSearches.createdAt)).all().slice(20);
  for (const o of old) db.delete(recentSearches).where(and(eq(recentSearches.userId, actor.id), eq(recentSearches.query, o.q))).run();
}

export function clearRecent(actor: Actor): void {
  db.delete(recentSearches).where(eq(recentSearches.userId, actor.id)).run();
}

/* ------------------------------------------------------------------ bus subscriber */

function syncItem(itemId: string): void {
  const it = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!it || it.state !== "active") return remove("item", itemId);
  upsert(itemDoc(it, boardCtx()));
}

const g = globalThis as unknown as { __adminSearchSub?: () => void };
if (!g.__adminSearchSub) {
  g.__adminSearchSub = subscribe((e) => {
    try {
      switch (e.type) {
        case "item.created": case "item.updated": case "item.moved": case "item.duplicated": case "item.archived": case "item.deleted": case "column_value.changed":
          sqlite(); syncItem(e.itemId); break;
        case "update.created": case "update.updated": case "update.deleted": {
          sqlite();
          const u = db.select().from(updates).where(eq(updates.id, e.updateId)).get();
          if (!u) return remove("update", e.updateId);
          upsert({ kind: "update", id: u.id, title: "", body: u.bodyText, boardId: u.boardId, workspaceId: boardCtx().workspaceOf(u.boardId), extra: u.itemId, stamp: u.editedAt ?? u.createdAt });
          break;
        }
        case "board.created": case "board.updated": case "board.archived": case "board.deleted":
          if (e.boardId) { sqlite(); reconcile("board"); if (e.type === "board.deleted" || e.type === "board.archived") removeByBoard(e.boardId); }
          break;
        case "workspace.changed": sqlite(); reconcile("workspace"); reconcile("board"); break;
        case "member.changed": sqlite(); reconcile("user"); break;
        default: break;
      }
    } catch (err) {
      console.error("[search] index update failed", err instanceof Error ? err.message : err);
    }
  });
}
