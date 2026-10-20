/**
 * Idempotent building blocks for the workspace templates. Everything is looked up by natural keys
 * (names, column keys), so running a template twice never creates duplicates and never overwrites
 * what a user changed (labels, values). Built on the boards/columns/groups services.
 */
import { and, eq } from "drizzle-orm";
import type { Actor } from "../../../lib/actor";
import { db } from "../../../db/client";
import { boards, columns, folders, workspaces, type BoardKind } from "../../../db/schema/core";
import * as boardsSvc from "../boards";
import * as columnsSvc from "../columns";
import * as foldersSvc from "../folders";
import * as groupsSvc from "../groups";
import * as workspacesSvc from "../workspaces";
import { getColumnLogic } from "../../columns/registry";
import type { ColumnRow } from "../_shared";

export interface ColSpec { key: string; title: string; type: string; settings?: Record<string, unknown>; scope?: "item" | "subitem"; width?: number }
export interface GroupSpec { title: string; color: string }
export const label = (id: number, text: string, color: string, isDone = false) => ({ id, text, color, index: id, isDone });
export const dropdownLabels = (...texts: string[]) => ({ labels: texts.map((text, i) => ({ id: i + 1, text })) });

export function ensureWorkspace(sys: Actor, name: string, opts: { color?: string; description?: string; kind?: "open" | "closed" } = {}): { id: string; created: boolean } {
  const ex = db.select().from(workspaces).where(and(eq(workspaces.accountId, sys.accountId), eq(workspaces.name, name), eq(workspaces.state, "active"))).get();
  if (ex) return { id: ex.id, created: false };
  return { id: workspacesSvc.create(sys, { name, color: opts.color ?? null, description: opts.description ?? null, kind: opts.kind ?? "open" }).id, created: true };
}

export function ensureFolder(sys: Actor, workspaceId: string, name: string): string {
  const ex = db.select().from(folders).where(and(eq(folders.workspaceId, workspaceId), eq(folders.name, name))).get();
  return ex?.id ?? foldersSvc.create(sys, { workspaceId, name }).id;
}

/** Find or create a board (empty columns apart from Name) and make sure its groups exist, in order. */
export function ensureBoard(sys: Actor, workspaceId: string, name: string, opts: { description?: string; folderId?: string; groups?: GroupSpec[]; kind?: BoardKind } = {}): { id: string; created: boolean } {
  const ex = db.select().from(boards).where(and(eq(boards.workspaceId, workspaceId), eq(boards.name, name), eq(boards.state, "active"))).get();
  let id = ex?.id;
  const created = !ex;
  if (!id) {
    id = boardsSvc.create(sys, { workspaceId, name, description: opts.description ?? null, folderId: opts.folderId ?? null, kind: opts.kind ?? "board", emptyColumns: true }).id;
    const first = groupsSvc.list(sys, id)[0];
    const g0 = opts.groups?.[0];
    if (first && g0) groupsSvc.update(sys, first.id, { title: g0.title, color: g0.color });
  } else if (opts.folderId && ex!.folderId !== opts.folderId && !ex!.folderId) {
    boardsSvc.update(sys, id, { folderId: opts.folderId });
  }
  const have = new Set(groupsSvc.list(sys, id).map((g) => g.title.toLowerCase()));
  for (const g of opts.groups ?? []) if (!have.has(g.title.toLowerCase())) groupsSvc.create(sys, id, { title: g.title, color: g.color });
  return { id, created };
}

const findColumn = (boardId: string, spec: ColSpec): ColumnRow | undefined => {
  const scope = spec.scope ?? "item";
  const rows = db.select().from(columns).where(and(eq(columns.boardId, boardId), eq(columns.scope, scope))).all();
  return rows.find((c) => c.key === spec.key) ?? rows.find((c) => c.type === spec.type && c.title.toLowerCase() === spec.title.toLowerCase());
};

/** Ensure the columns exist (matched by key, then by title+type). Existing columns keep their settings. */
export function ensureColumns(sys: Actor, boardId: string, specs: ColSpec[]): Record<string, ColumnRow> {
  const out: Record<string, ColumnRow> = {};
  for (const spec of specs) {
    let col = findColumn(boardId, spec);
    if (!col) col = columnsSvc.create(sys, boardId, { title: spec.title, type: spec.type, key: spec.key, settings: spec.settings, scope: spec.scope ?? "item", width: spec.width });
    out[spec.key] = col;
  }
  return out;
}

export function setColumnSettings(colId: string, patch: Record<string, unknown>): ColumnRow {
  const cur = db.select().from(columns).where(eq(columns.id, colId)).get()!;
  const logic = getColumnLogic(cur.type);
  const merged = { ...cur.settings, ...patch };
  return db.update(columns).set({ settings: logic.normalizeSettings ? logic.normalizeSettings(merged) : merged }).where(eq(columns.id, colId)).returning().get();
}

/** Make sure a status/dropdown column has every wanted label (by text); keeps user-added labels. */
export function ensureLabels(colId: string, wanted: { id?: number; text: string; color?: string; isDone?: boolean }[]): void {
  const cur = db.select().from(columns).where(eq(columns.id, colId)).get()!;
  const have = ((cur.settings.labels as { id: number; text: string; color?: string; index?: number }[] | undefined) ?? []);
  const next: { id: number; text: string; color?: string; index?: number; isDone?: boolean }[] = [...have];
  for (const w of wanted) {
    if (next.some((l) => l.text.toLowerCase() === w.text.toLowerCase())) continue;
    const id = w.id !== undefined && !next.some((l) => l.id === w.id) ? w.id : next.reduce((m, l) => Math.max(m, l.id), -1) + 1;
    next.push(cur.type === "status" ? { id, text: w.text, color: w.color ?? "#c4c4c4", index: next.length, isDone: !!w.isDone } : { id, text: w.text });
  }
  if (next.length !== have.length) setColumnSettings(colId, { labels: next });
}

export function addDropdownLabel(colId: string, text: string): number {
  ensureLabels(colId, [{ text }]);
  const col = db.select().from(columns).where(eq(columns.id, colId)).get()!;
  return (col.settings.labels as { id: number; text: string }[]).find((l) => l.text.toLowerCase() === text.toLowerCase())!.id;
}

/**
 * Connect two boards two-way: ensures a board_relation column on each side, pointing at the other
 * board, paired through peerColumnId (so values stay in sync when edited from either side).
 */
export function ensureRelationPair(sys: Actor, a: { boardId: string; key: string; title: string }, b: { boardId: string; key: string; title: string }, opts: { allowMultipleA?: boolean; allowMultipleB?: boolean } = {}): [ColumnRow, ColumnRow] {
  const ca = ensureColumns(sys, a.boardId, [{ key: a.key, title: a.title, type: "board_relation" }])[a.key];
  const cb = ensureColumns(sys, b.boardId, [{ key: b.key, title: b.title, type: "board_relation" }])[b.key];
  const na = setColumnSettings(ca.id, { boardIds: [b.boardId], peerColumnId: cb.id, allowMultiple: opts.allowMultipleA ?? true });
  const nb = setColumnSettings(cb.id, { boardIds: [a.boardId], peerColumnId: ca.id, allowMultiple: opts.allowMultipleB ?? true });
  return [na, nb];
}

export const boardByName = (accountId: string, workspaceName: string, name: string): { id: string; workspaceId: string } | undefined => {
  const ws = db.select().from(workspaces).where(and(eq(workspaces.accountId, accountId), eq(workspaces.name, workspaceName), eq(workspaces.state, "active"))).get();
  if (!ws) return undefined;
  const b = db.select().from(boards).where(and(eq(boards.workspaceId, ws.id), eq(boards.name, name), eq(boards.state, "active"))).get();
  return b ? { id: b.id, workspaceId: ws.id } : undefined;
};

export const keyOf = (boardId: string, key: string, scope: "item" | "subitem" = "item"): ColumnRow | undefined =>
  db.select().from(columns).where(and(eq(columns.boardId, boardId), eq(columns.key, key), eq(columns.scope, scope))).get();
