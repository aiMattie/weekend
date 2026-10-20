/**
 * Server-side column behaviour that needs the database. Called by items.ts / columns.ts at fixed
 * points (additive one-liners there):
 *   beforeChange   column permissions, relation / dependency / file validation
 *   resolveValue   turns commands (time tracking start/stop/...) into stored values
 *   afterChange    two-way board_relation sync, refresh of boards that mirror this item
 *   onColumnCreated / onColumnUpdated / onColumnDeleted   peer columns, label cleanup
 */
import { and, eq, inArray, like } from "drizzle-orm";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, ValidationError } from "../../lib/errors";
import { can } from "../../lib/permissions";
import { db } from "../../db/client";
import { assets, boards, columns, items } from "../../db/schema/core";
import { dropdownLabels, statusLabels } from "../columns/labels";
import { applyTimeCommand, isTimeCommand, type TimeValue } from "../columns/time_tracking";
import { makeRelationValue, relationIds, type RelationValue } from "../columns/relation-base";
import type { FileValue } from "../columns/file";
import { insertColumnRow } from "./columns"; // cyclic with columns.ts, only used at call time
import { record, type ColumnRow, type ItemRow } from "./_shared";

const boardIdsOf = (c: ColumnRow): string[] => ((c.settings.boardIds as string[] | undefined) ?? []).map(String);

/* ------------------------------------------------------------------ values */

export function resolveValue(actor: Actor, col: ColumnRow, from: unknown, to: unknown): unknown {
  if (col.type === "time_tracking" && isTimeCommand(to)) return applyTimeCommand((from as TimeValue | null) ?? null, to, actor.isSystem ? null : actor.id);
  return to;
}

/** Throws when `actor` may not write `to` into `col` of an item (itemId null = item is being created). */
export function beforeChange(actor: Actor, boardId: string, itemId: string | null, col: ColumnRow, to: unknown): void {
  if (!actor.isSystem && !can(actor, "column:edit", { boardId, columnId: col.id, ...(itemId ? { itemId } : {}) })) {
    throw new ForbiddenError(`You are not allowed to edit column "${col.title}"`);
  }
  if (to === null || to === undefined) return;
  switch (col.type) {
    case "board_relation": return checkRelation(actor, col, to as RelationValue);
    case "dependency": return checkDependency(boardId, itemId, col, to as RelationValue);
    case "file": return checkFiles(boardId, to as FileValue);
    default:
  }
}

function checkRelation(actor: Actor, col: ColumnRow, v: RelationValue): void {
  const ids = relationIds(v);
  if (!ids.length) return;
  const allowed = boardIdsOf(col);
  if (!allowed.length) throw new ValidationError(`Column "${col.title}" is not connected to a board yet`);
  const rows = db.select({ id: items.id, boardId: items.boardId, state: items.state }).from(items).where(inArray(items.id, ids)).all();
  for (const id of ids) {
    const r = rows.find((x) => x.id === id);
    if (!r || r.state === "deleted") throw new ValidationError(`Linked item ${id} does not exist`);
    if (!allowed.includes(r.boardId)) throw new ValidationError(`Item ${id} is not on a board connected to "${col.title}"`);
    if (!actor.isSystem && !can(actor, "board:view", { boardId: r.boardId })) throw new ForbiddenError("No access to the linked board");
  }
}

function checkDependency(boardId: string, itemId: string | null, col: ColumnRow, v: RelationValue): void {
  const ids = relationIds(v);
  if (!ids.length) return;
  if (itemId && ids.includes(itemId)) throw new ValidationError("An item cannot depend on itself");
  const rows = db.select({ id: items.id, boardId: items.boardId, state: items.state, values: items.values }).from(items).where(inArray(items.id, ids)).all();
  for (const id of ids) {
    const r = rows.find((x) => x.id === id);
    if (!r || r.state === "deleted") throw new ValidationError(`Dependency item ${id} does not exist`);
    if (r.boardId !== boardId) throw new ValidationError("Dependencies must be items of the same board");
  }
  if (!itemId) return;
  // cycle check: following dependencies from every new target must never reach this item again
  const edges = new Map<string, string[]>();
  for (const r of db.select({ id: items.id, values: items.values }).from(items).where(and(eq(items.boardId, boardId), eq(items.state, "active"))).all()) {
    edges.set(r.id, relationIds(r.values[col.id] as RelationValue | undefined));
  }
  edges.set(itemId, ids);
  const seen = new Set<string>();
  const stack = [...ids];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === itemId) throw new ValidationError("This dependency would create a cycle");
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...(edges.get(n) ?? []));
  }
}

function checkFiles(boardId: string, v: FileValue): void {
  const ids = v.files.filter((f) => f.fileType === "ASSET" && f.assetId).map((f) => f.assetId!);
  if (!ids.length) return;
  const rows = db.select({ id: assets.id, boardId: assets.boardId }).from(assets).where(inArray(assets.id, ids)).all();
  for (const id of ids) {
    const r = rows.find((x) => x.id === id);
    if (!r) throw new ValidationError(`File ${id} does not exist (upload it through /api/v1/assets first)`);
    if (r.boardId && r.boardId !== boardId) throw new ValidationError(`File ${id} belongs to another board`);
  }
}

/* ------------------------------------------------------------------ relation sync */

/** Direct write of a relation value (no hooks, no permission check) + SSE/activity events. */
function writeRelation(actor: Actor, itemId: string, col: ColumnRow, ids: string[]): void {
  const row = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!row) return;
  const from = (row.values[col.id] as RelationValue | undefined) ?? null;
  const to = makeRelationValue(ids);
  if (JSON.stringify(relationIds(from)) === JSON.stringify(ids)) return;
  const values = { ...row.values };
  if (to) values[col.id] = to;
  else delete values[col.id];
  db.update(items).set({ values }).where(eq(items.id, itemId)).run();
  record(actor, { type: "column_value.changed", boardId: row.boardId, itemId, columnId: col.id, columnType: col.type, from, to }, { event: "change_column_value", itemId, columnId: col.id, data: { name: row.name, columnTitle: col.title, columnType: col.type, via: "peer_sync" } });
}

const relIdsOf = (itemId: string, col: ColumnRow): string[] => {
  const row = db.select({ values: items.values }).from(items).where(eq(items.id, itemId)).get();
  return relationIds(row?.values[col.id] as RelationValue | undefined);
};

function syncPeer(actor: Actor, item: ItemRow, col: ColumnRow, from: unknown, to: unknown): void {
  const peerId = col.settings.peerColumnId as string | undefined;
  if (!peerId) return;
  const peer = db.select().from(columns).where(eq(columns.id, peerId)).get();
  if (!peer || peer.settings.peerColumnId !== col.id) return; // stale pointer (e.g. duplicated board): treat as one-way
  const before = relationIds(from as RelationValue | null);
  const after = relationIds(to as RelationValue | null);
  for (const id of before.filter((x) => !after.includes(x))) writeRelation(actor, id, peer, relIdsOf(id, peer).filter((x) => x !== item.id));
  for (const id of after.filter((x) => !before.includes(x))) {
    const cur = relIdsOf(id, peer);
    if (cur.includes(item.id)) continue;
    if (peer.settings.allowMultiple === false) {
      for (const old of cur) writeRelation(actor, old, col, relIdsOf(old, col).filter((x) => x !== id)); // the old partner loses this link
      writeRelation(actor, id, peer, [item.id]);
    } else writeRelation(actor, id, peer, [...cur, item.id]);
  }
}

/** Items on other boards that show this item through a relation/mirror get an `item.updated` so their UI refreshes. */
function touchDependents(actor: Actor, item: ItemRow): void {
  const rels = db.select().from(columns).where(eq(columns.type, "board_relation")).all().filter((c) => boardIdsOf(c).includes(item.boardId) && c.boardId !== item.boardId);
  for (const c of rels) {
    const hits = db.select({ id: items.id, boardId: items.boardId }).from(items).where(and(eq(items.boardId, c.boardId), like(items.values, `%"${item.id}"%`))).all();
    for (const h of hits) record(actor, { type: "item.updated", boardId: h.boardId, itemId: h.id }, null);
  }
}

export function afterChange(actor: Actor, item: ItemRow, col: ColumnRow, from: unknown, to: unknown): void {
  if (col.type === "board_relation") syncPeer(actor, item, col, from, to);
  touchDependents(actor, item);
}

/* ------------------------------------------------------------------ column lifecycle */

function setSettings(colId: string, settings: Record<string, unknown>): ColumnRow {
  return db.update(columns).set({ settings }).where(eq(columns.id, colId)).returning().get();
}

/** Make `col` (board_relation with exactly one target board) two-way, creating the peer column when needed. */
function ensurePeer(actor: Actor, col: ColumnRow): ColumnRow {
  const targets = boardIdsOf(col);
  if (col.type !== "board_relation" || targets.length !== 1 || targets[0] === col.boardId) return col;
  const requested = col.settings.peerColumnId as string | undefined;
  let peer = requested ? db.select().from(columns).where(eq(columns.id, requested)).get() : undefined;
  if (peer && (peer.type !== "board_relation" || peer.boardId !== targets[0] || (peer.settings.peerColumnId && peer.settings.peerColumnId !== col.id))) {
    // duplicated column or invalid request: one-way copy
    const { peerColumnId: _p, ...rest } = col.settings; // eslint-disable-line @typescript-eslint/no-unused-vars
    return setSettings(col.id, rest);
  }
  if (!peer) {
    if (col.settings.twoWay === false) return col;
    if (!actor.isSystem && !can(actor, "board:edit_structure", { boardId: targets[0] })) return col;
    const src = db.select({ name: boards.name }).from(boards).where(eq(boards.id, col.boardId)).get();
    peer = insertColumnRow(targets[0], { title: src?.name ?? "Connected board", type: "board_relation", scope: "item", settings: { boardIds: [col.boardId], allowMultiple: true, peerColumnId: col.id } }, { keyBase: "board_relation" });
  } else {
    setSettings(peer.id, { ...peer.settings, boardIds: [col.boardId], peerColumnId: col.id });
  }
  const next = setSettings(col.id, { ...col.settings, peerColumnId: peer.id });
  backfillPeer(actor, next, peer);
  return next;
}

/** Make existing links symmetric when two columns get paired. */
function backfillPeer(actor: Actor, a: ColumnRow, b: ColumnRow): void {
  const links = (col: ColumnRow): [string, string][] => db.select({ id: items.id, values: items.values }).from(items).where(eq(items.boardId, col.boardId)).all()
    .flatMap((r) => relationIds(r.values[col.id] as RelationValue | undefined).map((t): [string, string] => [r.id, t]));
  for (const [from, to] of links(a)) if (!relIdsOf(to, b).includes(from)) writeRelation(actor, to, b, [...relIdsOf(to, b), from]);
  for (const [from, to] of links(b)) if (!relIdsOf(to, a).includes(from)) writeRelation(actor, to, a, [...relIdsOf(to, a), from]);
}

export function onColumnCreated(actor: Actor, col: ColumnRow): void {
  if (col.type === "board_relation") ensurePeer(actor, col);
}

export function onColumnUpdated(actor: Actor, prev: ColumnRow, next: ColumnRow): void {
  if (next.type === "board_relation") {
    const was = JSON.stringify(boardIdsOf(prev));
    const now = JSON.stringify(boardIdsOf(next));
    let cur = next;
    if (was !== now && prev.settings.peerColumnId) {
      const old = db.select().from(columns).where(eq(columns.id, String(prev.settings.peerColumnId))).get();
      if (old) { const { peerColumnId: _d, ...rest } = old.settings; setSettings(old.id, rest); } // eslint-disable-line @typescript-eslint/no-unused-vars
      if (next.settings.peerColumnId === prev.settings.peerColumnId) { const { peerColumnId: _e, ...rest } = next.settings; cur = setSettings(next.id, rest); } // eslint-disable-line @typescript-eslint/no-unused-vars
    }
    if (!cur.settings.peerColumnId || was !== now) ensurePeer(actor, cur);
    return;
  }
  // removed labels: clear the values that pointed at them
  const key = next.type === "status" ? "status" : next.type === "dropdown" ? "dropdown" : null;
  if (!key) return;
  const ids = (c: ColumnRow) => (key === "status" ? statusLabels(c.settings).map((l) => l.id) : dropdownLabels(c.settings).map((l) => l.id));
  const gone = ids(prev).filter((id) => !ids(next).includes(id));
  if (!gone.length) return;
  for (const r of db.select({ id: items.id, values: items.values }).from(items).where(eq(items.boardId, next.boardId)).all()) {
    const v = r.values[next.id] as { index?: number; ids?: number[] } | undefined;
    if (!v) continue;
    const values = { ...r.values };
    if (key === "status") { if (typeof v.index === "number" && gone.includes(v.index)) delete values[next.id]; else continue; }
    else {
      const rest = (v.ids ?? []).filter((i) => !gone.includes(i));
      if (rest.length === (v.ids ?? []).length) continue;
      if (rest.length) values[next.id] = { ids: rest }; else delete values[next.id];
    }
    db.update(items).set({ values }).where(eq(items.id, r.id)).run();
  }
}

export function onColumnDeleted(_actor: Actor, col: ColumnRow): void {
  const peerId = col.settings.peerColumnId as string | undefined;
  if (!peerId) return;
  const peer = db.select().from(columns).where(eq(columns.id, peerId)).get();
  if (peer) { const { peerColumnId: _p, ...rest } = peer.settings; setSettings(peer.id, rest); } // eslint-disable-line @typescript-eslint/no-unused-vars
}
