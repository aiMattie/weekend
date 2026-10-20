/**
 * Read-path decoration. Everything the UI, REST, GraphQL and MCP read about items goes through
 * `decorateItems` (called by items.list/get/listSubitems and getBoardFull), which
 *  - removes values of columns the actor may not view (column permissions),
 *  - computes mirror, formula, progress, auto_number, item_id, creation_log, last_updated, item_assignees,
 *  - adds display names to tags / board_relation / dependency / doc values (`tags`, `items`, `name`).
 * Computed values are NEVER stored; stored values are never modified here.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Actor } from "../../lib/actor";
import { can } from "../../lib/permissions";
import { db } from "../../db/client";
import { activityLog, columns, items } from "../../db/schema/core";
import { docs } from "../../db/schema/docs";
import { tags } from "../../db/schema/columns";
import { buildMirrorValue, type MirrorEntry } from "../columns/computed/mirror";
import { runFormula, FormulaError, type Val } from "../columns/computed/formula-lang";
import { scalarOf } from "../columns/computed/scalars";
import { buildProgress, isDoneLabel } from "../columns/computed/progress";
import { statusLabels } from "../columns/labels";
import { getColumnLogic } from "../columns/registry";
import type { AggregateFn } from "../columns/util";
import { relationIds, type RelationValue } from "../columns/relation-base";
import type { PersonRef } from "../columns/people";
import type { FormatContext } from "../columns/types";
import { hiddenColumnIds } from "../../lib/permissions-data";
import { formatContext, type ColumnRow, type ItemRow } from "./_shared";

const DECORATED = new Set(["tags", "board_relation", "dependency", "doc", "mirror", "formula", "progress", "auto_number", "item_id", "creation_log", "last_updated", "item_assignees"]);
const MAX_DEPTH = 2;

const matchCol = (cols: ColumnRow[], ref: string | undefined): ColumnRow | undefined =>
  ref ? cols.find((c) => c.id === ref) ?? cols.find((c) => c.key === ref) : undefined;

/** Decorate items of any number of boards. Returns new row objects (same order). */
export function decorateItems<T extends ItemRow>(actor: Actor, rows: T[], depth = 0): T[] {
  if (!rows.length) return rows;
  const byBoard = new Map<string, T[]>();
  for (const r of rows) byBoard.set(r.boardId, [...(byBoard.get(r.boardId) ?? []), r]);
  const done = new Map<string, T>();
  for (const [boardId, list] of byBoard) for (const r of decorateBoard(actor, boardId, list, depth)) done.set(r.id, r);
  return rows.map((r) => done.get(r.id) ?? r);
}

function decorateBoard<T extends ItemRow>(actor: Actor, boardId: string, rows: T[], depth: number): T[] {
  const allCols = db.select().from(columns).where(and(eq(columns.boardId, boardId), eq(columns.archived, false))).orderBy(asc(columns.position)).all();
  const hidden = hiddenColumnIds(actor, boardId);
  const needs = allCols.some((c) => DECORATED.has(c.type));
  if (!needs && !hidden.size) return rows;

  const colsOf = (scope: "item" | "subitem") => allCols.filter((c) => c.scope === scope && !hidden.has(c.id));
  const itemCols = colsOf("item");
  const subCols = colsOf("subitem");
  const has = (type: string) => allCols.some((c) => c.type === type && !hidden.has(c.id));

  // ---- batch loads
  const tagIds = new Set<string>();
  const linkIds = new Set<string>();
  const docIds = new Set<string>();
  for (const r of rows) {
    for (const c of r.parentItemId ? subCols : itemCols) {
      const v = r.values[c.id] as Record<string, unknown> | undefined;
      if (!v) continue;
      if (c.type === "tags") for (const t of (v.tag_ids as string[] | undefined) ?? []) tagIds.add(String(t));
      else if (c.type === "board_relation" || c.type === "dependency") for (const i of relationIds(v as unknown as RelationValue)) linkIds.add(i);
      else if (c.type === "doc") for (const f of (v.files as { objectId: string }[] | undefined) ?? []) docIds.add(String(f.objectId));
    }
  }
  const relIdsByCol = (r: ItemRow, c: ColumnRow): string[] => relationIds(r.values[c.id] as RelationValue | undefined);

  const tagMap = new Map<string, { id: string; name: string; color: string }>();
  if (tagIds.size) for (const t of db.select().from(tags).where(inArray(tags.id, [...tagIds])).all()) tagMap.set(t.id, { id: t.id, name: t.name, color: t.color });

  const docMap = new Map<string, string>();
  if (docIds.size) for (const d of db.select({ id: docs.id, title: docs.title }).from(docs).where(inArray(docs.id, [...docIds])).all()) docMap.set(d.id, d.title);

  const linked = new Map<string, ItemRow>();
  if (linkIds.size) for (const l of db.select().from(items).where(and(inArray(items.id, [...linkIds]), eq(items.state, "active"))).all()) linked.set(l.id, l);
  const viewable = new Map<string, boolean>();
  const canSee = (bid: string) => {
    if (!viewable.has(bid)) viewable.set(bid, bid === boardId || can(actor, "board:view", { boardId: bid }));
    return viewable.get(bid)!;
  };
  // linked rows decorated lazily (only when a mirror needs their computed values)
  let decoratedLinked: Map<string, ItemRow> | null = null;
  const linkedDecorated = (): Map<string, ItemRow> => {
    if (!decoratedLinked) {
      const vis = [...linked.values()].filter((l) => canSee(l.boardId));
      decoratedLinked = new Map((depth >= MAX_DEPTH ? vis : decorateItems(actor, vis, depth + 1)).map((l) => [l.id, l]));
    }
    return decoratedLinked;
  };
  const linkedCols = new Map<string, ColumnRow[]>();
  const colsOfBoard = (bid: string): ColumnRow[] => {
    if (!linkedCols.has(bid)) linkedCols.set(bid, bid === boardId ? allCols : db.select().from(columns).where(eq(columns.boardId, bid)).all());
    return linkedCols.get(bid)!;
  };

  const rowIds = rows.map((r) => r.id);
  const needSubs = has("progress") || has("item_assignees");
  const children = needSubs ? db.select().from(items).where(and(inArray(items.parentItemId, rowIds), eq(items.state, "active"))).all() : [];
  const childrenOf = (id: string) => children.filter((c) => c.parentItemId === id);

  let ranks: Map<string, number> | null = null;
  if (has("auto_number")) {
    ranks = new Map();
    db.select({ id: items.id, parent: items.parentItemId }).from(items).where(eq(items.boardId, boardId)).all()
      .sort((a, b) => Number(a.id) - Number(b.id))
      .reduce((n, r) => { if (!r.parent) ranks!.set(r.id, ++n); return n; }, 0);
  }

  const lastActor = new Map<string, string | null>();
  if (has("last_updated")) {
    for (const a of db.select({ itemId: activityLog.itemId, userId: activityLog.userId }).from(activityLog).where(inArray(activityLog.itemId, rowIds)).orderBy(desc(activityLog.createdAt)).all()) {
      if (a.itemId && !lastActor.has(a.itemId)) lastActor.set(a.itemId, a.userId);
    }
  }

  let fmt: FormatContext | undefined;
  const fctx = () => (fmt ??= formatContext(actor.accountId));

  // ---- per row
  return rows.map((r) => {
    const cols = r.parentItemId ? subCols : itemCols;
    const values: Record<string, unknown> = { ...r.values };
    for (const h of hidden) delete values[h];
    const names = (ids: string[]) => ids.map((id) => linked.get(id)).filter((l): l is ItemRow => !!l && canSee(l.boardId)).map((l) => ({ id: l.id, name: l.name, boardId: l.boardId }));

    for (const c of cols) {
      const v = values[c.id] as Record<string, unknown> | undefined;
      switch (c.type) {
        case "tags":
          if (v) values[c.id] = { ...v, tags: ((v.tag_ids as string[] | undefined) ?? []).map((id) => tagMap.get(String(id))).filter(Boolean) };
          break;
        case "board_relation":
        case "dependency":
          if (v) values[c.id] = { ...v, items: names(relationIds(v as unknown as RelationValue)) };
          break;
        case "doc":
          if (v) values[c.id] = { ...v, files: ((v.files as { objectId: string }[] | undefined) ?? []).map((f) => ({ ...f, name: docMap.get(String(f.objectId)) ?? (f as { name?: string }).name })) };
          break;
        case "item_id": values[c.id] = r.id; break;
        case "creation_log": values[c.id] = { at: r.createdAt, userId: r.creatorId }; break;
        case "last_updated": values[c.id] = { at: r.updatedAt, userId: lastActor.get(r.id) ?? r.creatorId }; break;
        case "auto_number": { const n = ranks?.get(r.id); if (n !== undefined) values[c.id] = n + Number(c.settings.startAt ?? 1) - 1; break; }
        case "item_assignees": {
          const seen = new Set<string>();
          const out: PersonRef[] = [];
          const addFrom = (row: ItemRow, pcols: ColumnRow[]) => {
            for (const pc of pcols) if (pc.type === "people") for (const p of ((row.values[pc.id] as { personsAndTeams?: PersonRef[] } | undefined)?.personsAndTeams ?? [])) {
              if (!seen.has(`${p.kind}:${p.id}`)) { seen.add(`${p.kind}:${p.id}`); out.push(p); }
            }
          };
          addFrom(r, cols);
          for (const ch of childrenOf(r.id)) addFrom(ch, subCols);
          if (out.length) values[c.id] = { personsAndTeams: out };
          break;
        }
        case "progress": {
          const p = progressFor(c, r, cols, childrenOf(r.id), linkedDecorated, colsOfBoard, relIdsByCol, allCols, subCols);
          if (p) values[c.id] = p;
          break;
        }
        case "mirror": {
          const m = mirrorFor(actor, c, r, allCols, relIdsByCol, linkedDecorated, colsOfBoard, canSee);
          if (m) values[c.id] = m;
          break;
        }
        default:
      }
    }
    // formulas last: they may read every other (already decorated) column
    const formulaCols = cols.filter((c) => c.type === "formula");
    if (formulaCols.length) {
      const memo = new Map<string, unknown>();
      const stack = new Set<string>();
      const evalCol = (c: ColumnRow): unknown => {
        if (memo.has(c.id)) return memo.get(c.id);
        if (stack.has(c.id)) throw new FormulaError(`Circular reference via "${c.title}"`);
        stack.add(c.id);
        const res = runFormula(String(c.settings.formula ?? ""), {
          ref(name) {
            const low = name.toLowerCase();
            const target = cols.find((x) => x.title.toLowerCase() === low) ?? cols.find((x) => x.key.toLowerCase() === low) ?? cols.find((x) => x.id === name);
            if (!target) {
              if (low === "name" || low === "item name") return r.name;
              throw new FormulaError(`Unknown column {${name}}`);
            }
            if (target.type === "name") return r.name;
            const raw = target.type === "formula" ? evalCol(target) : values[target.id];
            return scalarOf(getColumnLogic(target.type), { id: target.id, key: target.key, title: target.title, type: target.type, settings: target.settings }, raw ?? null, fctx()) as Val;
          },
        });
        stack.delete(c.id);
        memo.set(c.id, res);
        return res;
      };
      for (const c of formulaCols) {
        const res = evalCol(c) as ReturnType<typeof runFormula>;
        if (res.kind !== "empty" || res.error) values[c.id] = res;
      }
    }
    return { ...r, values };
  });
}

type RelIds = (r: ItemRow, c: ColumnRow) => string[];

function statusColumnOf(cols: ColumnRow[], ref: string | undefined): ColumnRow | undefined {
  return matchCol(cols, ref) ?? cols.find((c) => c.type === "status");
}

function progressFor(c: ColumnRow, r: ItemRow, _cols: ColumnRow[], kids: ItemRow[], linked: () => Map<string, ItemRow>, colsOfBoard: (b: string) => ColumnRow[], relIds: RelIds, allCols: ColumnRow[], subCols: ColumnRow[]) {
  let pool: { row: ItemRow; col: ColumnRow | undefined }[];
  if (c.settings.source === "relation") {
    const rel = matchCol(allCols, String(c.settings.relationColumnId ?? ""));
    if (!rel) return null;
    const l = linked();
    pool = relIds(r, rel).map((id) => l.get(id)).filter((x): x is ItemRow => !!x).map((row) => ({ row, col: statusColumnOf(colsOfBoard(row.boardId).filter((x) => x.scope === "item"), String(c.settings.columnId ?? "")) }));
  } else {
    const col = statusColumnOf(subCols, String(c.settings.columnId ?? ""));
    pool = kids.map((row) => ({ row, col }));
  }
  const total = pool.length;
  const done = pool.filter(({ row, col }) => {
    if (!col) return false;
    const idx = (row.values[col.id] as { index?: number } | undefined)?.index;
    const label = statusLabels(col.settings).find((l) => l.id === idx);
    return !!label && isDoneLabel(label);
  }).length;
  return buildProgress(done, total);
}

function mirrorFor(actor: Actor, c: ColumnRow, r: ItemRow, allCols: ColumnRow[], relIds: RelIds, linked: () => Map<string, ItemRow>, colsOfBoard: (b: string) => ColumnRow[], canSee: (b: string) => boolean) {
  const rel = matchCol(allCols, String(c.settings.relationColumnId ?? ""));
  const targetRef = String(c.settings.targetColumnId ?? "");
  if (!rel || !targetRef) return null;
  const l = linked();
  const entries: MirrorEntry[] = [];
  let target: ColumnRow | undefined;
  for (const id of relIds(r, rel)) {
    const row = l.get(id);
    if (!row || !canSee(row.boardId)) continue;
    const tcol = matchCol(colsOfBoard(row.boardId).filter((x) => x.scope === "item"), targetRef);
    if (!tcol) continue;
    if (hiddenColumnIds(actor, row.boardId, [tcol.id]).has(tcol.id)) continue;
    target ??= tcol;
    entries.push({ itemId: row.id, name: row.name, value: row.values[tcol.id] ?? null });
  }
  const ref = target ? { id: target.id, key: target.key, title: target.title, type: target.type, settings: target.settings } : null;
  if (!ref && !entries.length) return null;
  return buildMirrorValue(ref, entries, (String(c.settings.aggregate ?? "none") as AggregateFn));
}
