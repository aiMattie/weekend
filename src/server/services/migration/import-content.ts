/** Importer steps for content: items + subitems, relation values, updates, assets (metadata), docs. */
import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { assets, items, updates } from "../../../db/schema/core";
import { docs as docsTable } from "../../../db/schema/docs";
import type { Actor } from "../../../lib/actor";
import * as docsSvc from "../docs";
import { mondayBlocksToTiptap } from "./monday-docs";
import { htmlToText, sanitizeHtml } from "../../../lib/sanitize";
import { columnExt, type BoardPlans, type ImportEnv } from "./import-structure";
import type { MAsset, MItem, MondaySnapshot } from "./monday-types";
import { translateValue, type PlanColumn, type ValueCtx } from "./monday-values";
import { hashOf } from "./refs";

export interface PendingDownload { assetId: string; asset: MAsset; boardId: string }

const itemRef = (env: ImportEnv, id: string) => env.tracker.lookup("item", id) ?? env.tracker.lookup("subitem", id);

function valueCtx(env: ImportEnv, colIds: Map<string, string>): ValueCtx {
  const { tracker } = env;
  return {
    userId: (id) => tracker.lookup("user", String(id)),
    assetId: (id) => tracker.lookup("asset", String(id)),
    itemId: (id) => itemRef(env, String(id)),
    columnRef: (p) => ({ id: colIds.get(`${p.scope}:${p.mondayId}`) ?? p.key, key: p.key, title: p.title, type: p.type, settings: p.settings }),
  };
}

function buildValues(env: ImportEnv, plans: PlanColumn[], item: MItem, scope: "item" | "subitem", mode: "plain" | "relations", ctx: ValueCtx, colIds: Map<string, string>, label: string): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const cv of item.column_values) {
    const plan = plans.find((p) => p.mondayId === cv.id && p.scope === scope);
    if (!plan || (plan.type === "board_relation") !== (mode === "relations")) continue;
    const r = translateValue(plan, cv, ctx);
    if (r.warning) env.tracker.warn(`${label}: ${r.warning}`);
    const id = colIds.get(`${scope}:${plan.mondayId}`);
    if (r.value !== undefined && id) values[id] = r.value;
  }
  return values;
}

function columnIds(env: ImportEnv, mondayBoardId: string, plans: PlanColumn[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of plans) {
    const id = env.tracker.lookup("column", columnExt(mondayBoardId, p.scope, p.mondayId));
    if (id) m.set(`${p.scope}:${p.mondayId}`, id);
  }
  return m;
}

/** Items and subitems of every imported board. Relation values come later (`importRelations`). */
export function importItems(env: ImportEnv, planned: BoardPlans, pending: PendingDownload[]): void {
  const { tracker } = env;
  for (const [boardId, { board, plans }] of planned) {
    const colIds = columnIds(env, board.id, plans);
    const ctx = valueCtx(env, colIds);
    const bItems = env.snap.boards.find((b) => b.id === board.id)?.items ?? [];
    const posByGroup = new Map<string, number>();
    const nextPos = (k: string) => { const n = (posByGroup.get(k) ?? 0) + 1000; posByGroup.set(k, n); return n; };
    for (const it of bItems) {
      // assets first, so file column values can reference them; they are linked to the item afterwards
      importAssets(env, it, boardId, pending);
      const groupId = it.group ? tracker.lookup("group", it.group.id) ?? null : null;
      const label = `item "${it.name}" in "${board.name}"`;
      const parentId = writeItem(env, "item", it, boardId, groupId, null, buildValues(env, plans, it, "item", "plain", ctx, colIds, label), nextPos(it.group?.id ?? ""), label);
      linkAssets(env, it, parentId);
      const subPos = new Map<string, number>();
      for (const s of it.subitems ?? []) {
        const slabel = `subitem "${s.name}" of ${label}`;
        const sp = (subPos.get(it.id) ?? 0) + 1000;
        subPos.set(it.id, sp);
        writeItem(env, "subitem", s, boardId, groupId, parentId, buildValues(env, plans, s, "subitem", "plain", ctx, colIds, slabel), sp, slabel);
      }
    }
  }
}

function writeItem(env: ImportEnv, type: "item" | "subitem", it: MItem, boardId: string, groupId: string | null, parentId: string | null, values: Record<string, unknown>, position: number, label: string): string {
  const { tracker } = env;
  const creatorId = it.creator ? tracker.lookup("user", it.creator.id) ?? null : null;
  const real = (id: string | null) => (id && !tracker.isPlaceholder(id) ? id : null);
  const state = it.state === "archived" ? "archived" : "active";
  return tracker.upsert(type, it.id, hashOf([it.name, it.group?.id, it.state, it.column_values.map((c) => [c.id, c.value]), parentId]), label, {
    exists: (id) => !!db.select().from(items).where(eq(items.id, id)).get(),
    create: () => db.insert(items).values({
      boardId, groupId, parentItemId: real(parentId), name: it.name, values, position, state, creatorId: real(creatorId),
      ...(it.created_at ? { createdAt: it.created_at } : {}), updatedAt: it.updated_at ?? it.created_at ?? new Date().toISOString(),
    }).returning().get().id,
    update: (id) => {
      const cur = db.select().from(items).where(eq(items.id, id)).get();
      if (!cur) return;
      db.update(items).set({ name: it.name, groupId, position, state, values: { ...cur.values, ...values }, updatedAt: it.updated_at ?? new Date().toISOString() }).where(eq(items.id, id)).run();
    },
  });
}

/** Write board_relation values once all items of all boards exist. */
export function importRelations(env: ImportEnv, planned: BoardPlans): void {
  if (!env.tracker.apply) return;
  for (const { board, plans } of planned.values()) {
    const rel = plans.filter((p) => p.type === "board_relation");
    if (!rel.length) continue;
    const colIds = columnIds(env, board.id, plans);
    const ctx = valueCtx(env, colIds);
    for (const it of env.snap.boards.find((b) => b.id === board.id)?.items ?? []) {
      for (const [scope, mi] of [["item", it], ...(it.subitems ?? []).map((s) => ["subitem", s] as const)] as ["item" | "subitem", MItem][]) {
        const values = buildValues(env, plans, mi, scope, "relations", ctx, colIds, `item "${mi.name}"`);
        const id = itemRef(env, mi.id);
        if (!id || !Object.keys(values).length) continue;
        const cur = db.select().from(items).where(eq(items.id, id)).get();
        if (cur && JSON.stringify(Object.keys(values).map((k) => cur.values[k])) !== JSON.stringify(Object.values(values))) {
          db.update(items).set({ values: { ...cur.values, ...values } }).where(eq(items.id, id)).run();
        }
      }
    }
  }
}

const itemAssets = (it: MItem) => [...(it.assets ?? []), ...(it.subitems ?? []).flatMap((s) => s.assets ?? [])];

function importAssets(env: ImportEnv, it: MItem, boardId: string, pending: PendingDownload[]): void {
  for (const a of itemAssets(it)) writeAsset(env, a, boardId, null, null, pending);
}

function linkAssets(env: ImportEnv, it: MItem, itemId: string): void {
  if (!env.tracker.apply) return;
  for (const a of itemAssets(it)) {
    const id = env.tracker.lookup("asset", a.id);
    if (id) db.update(assets).set({ itemId }).where(eq(assets.id, id)).run();
  }
}

function writeAsset(env: ImportEnv, a: MAsset, boardId: string, itemId: string | null, updateId: string | null, pending: PendingDownload[]): void {
  const { tracker } = env;
  const uploader = a.uploaded_by ? tracker.lookup("user", a.uploaded_by.id) ?? null : null;
  const real = (id: string | null) => (id && !tracker.isPlaceholder(id) ? id : null);
  const id = tracker.upsert("asset", a.id, hashOf([a.name, a.file_size, a.file_extension]), `asset "${a.name}"`, {
    exists: (x) => !!db.select().from(assets).where(eq(assets.id, x)).get(),
    create: () => db.insert(assets).values({ boardId, itemId: real(itemId), updateId: real(updateId), name: a.name, mimeType: mimeOf(a), size: a.file_size ?? 0, path: "", uploadedBy: real(uploader) }).returning().get().id,
    update: (x) => { db.update(assets).set({ name: a.name, size: a.file_size ?? 0 }).where(eq(assets.id, x)).run(); },
  });
  if (pending.some((p) => p.assetId === id)) return;
  if (tracker.isPlaceholder(id)) { pending.push({ assetId: id, asset: a, boardId }); return; }
  const row = db.select().from(assets).where(eq(assets.id, id)).get();
  if (row && !row.path) pending.push({ assetId: id, asset: a, boardId });
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", pdf: "application/pdf", txt: "text/plain", csv: "text/csv", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip: "application/zip" };
const mimeOf = (a: MAsset) => MIME[(a.file_extension ?? a.name.split(".").pop() ?? "").toLowerCase().replace(".", "")] ?? "application/octet-stream";

export function importUpdates(env: ImportEnv, planned: BoardPlans, pending: PendingDownload[]): void {
  const { tracker } = env;
  for (const [boardId, { board }] of planned) {
    const list = env.snap.boards.find((b) => b.id === board.id)?.updates ?? [];
    const real = (id: string | null | undefined) => (id && !tracker.isPlaceholder(id) ? id : null);
    const write = (u: { id: string; body: string; created_at?: string; creator?: { id: string } | null }, itemId: string, parentId: string | null) => {
      const body = sanitizeHtml(u.body || "");
      const text = htmlToText(body);
      if (!text && !/<img|<a /.test(body)) return undefined;
      const userId = u.creator ? tracker.lookup("user", u.creator.id) ?? null : null;
      return tracker.upsert("update", u.id, hashOf([u.body, itemId, parentId]), `update ${u.id} on "${board.name}"`, {
        exists: (x) => !!db.select().from(updates).where(eq(updates.id, x)).get(),
        create: () => db.insert(updates).values({ itemId, boardId, userId: real(userId), parentUpdateId: real(parentId), body, bodyText: text, ...(u.created_at ? { createdAt: u.created_at } : {}) }).returning().get().id,
        update: (x) => { db.update(updates).set({ body, bodyText: text }).where(eq(updates.id, x)).run(); },
      });
    };
    for (const u of list) {
      const itemId = u.item_id ? itemRef(env, u.item_id) : undefined;
      if (!itemId) { tracker.warn(`update ${u.id} on "${board.name}": item not imported, skipped`); continue; }
      const uid = write(u, itemId, null);
      for (const a of u.assets ?? []) writeAsset(env, a, boardId, itemId, uid ?? null, pending);
      if (uid) for (const r of u.replies ?? []) write(r, itemId, uid);
    }
  }
}

/** Optional override (tests / other modules); by default docs go through the docs service as Tiptap JSON. */
export interface DocImport { mondayId: string; objectId: string; name: string; kind?: string; workspaceId: string; blocks: MondaySnapshot["docs"][number]["blocks"]; docId?: string }
export type DocImporter = (doc: DocImport) => string;
let docImporter: DocImporter | null = null;
export const registerDocImporter = (fn: DocImporter | null): void => { docImporter = fn; };

const defaultDocImporter = (actor: Actor): DocImporter => (d) => {
  const blocks = mondayBlocksToTiptap(d.blocks);
  if (d.docId) { docsSvc.update(actor, d.docId, { title: d.name, blocks }); return d.docId; }
  return docsSvc.create(actor, { workspaceId: d.workspaceId, title: d.name, blocks }).id;
};

export function importDocs(env: ImportEnv, actor: Actor): number {
  const { tracker, snap } = env;
  const importer = docImporter ?? defaultDocImporter(actor);
  for (const d of snap.docs) {
    const wsId = tracker.lookup("workspace", d.workspace_id ?? "main");
    if (!wsId) continue;
    const base = { mondayId: d.id, objectId: d.object_id, name: d.name, kind: d.doc_kind, workspaceId: wsId, blocks: d.blocks };
    tracker.upsert("doc", d.id, hashOf([d.name, d.blocks]), `doc "${d.name}"`, {
      exists: (x) => !!db.select().from(docsTable).where(eq(docsTable.id, x)).get(),
      create: () => importer(base),
      update: (x) => { importer({ ...base, docId: x }); },
    });
  }
  return 0;
}
