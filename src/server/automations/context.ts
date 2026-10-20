/** Read helpers for matching, conditions and template variables (read-only db access for the engine). */
import { and, desc, eq } from "drizzle-orm";
import type { AppEvent } from "../../lib/events";
import { db } from "../../db/client";
import { activityLog, boards, columns, groups, items, updates, users } from "../../db/schema/core";
import { getColumnLogic } from "../columns/registry";
import { formatContext, type ColumnRow, type ItemRow } from "../services/_shared";
import { appUrl } from "./notify";
import type { MatchContext } from "./blocks/types";
import type { TriggerSnapshot } from "./model";

export function loadItem(id: string): ItemRow | null {
  const it = db.select().from(items).where(eq(items.id, id)).get();
  return it && it.state !== "deleted" ? it : null;
}
export const loadColumn = (id: string): ColumnRow | null => db.select().from(columns).where(eq(columns.id, id)).get() ?? null;

export function formatValue(accountId: string, column: ColumnRow, value: unknown): string {
  if (value === null || value === undefined) return "";
  try {
    return getColumnLogic(column.type).format(value as never, column, formatContext(accountId)) ?? "";
  } catch {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
}

function isDone(col: ColumnRow, raw: unknown): boolean {
  const idx = (raw as { index?: number } | null)?.index;
  const labels = (col.settings.labels as { id: number; isDone?: boolean }[] | undefined) ?? [];
  return idx !== undefined && !!labels.find((l) => l.id === idx)?.isDone;
}

export function makeMatchContext(accountId: string): MatchContext {
  return {
    accountId,
    column: loadColumn,
    item: loadItem,
    lastMove(itemId) {
      const row = db.select().from(activityLog).where(and(eq(activityLog.itemId, itemId), eq(activityLog.event, "move_item"))).orderBy(desc(activityLog.createdAt), desc(activityLog.id)).limit(1).get();
      if (!row) return null;
      return { fromGroupId: (row.data.fromGroupId as string | null) ?? null, toGroupId: (row.data.toGroupId as string | null) ?? null };
    },
    subitemsDone(parentId) {
      const subs = db.select().from(items).where(and(eq(items.parentItemId, parentId), eq(items.state, "active"))).all();
      if (!subs.length) return { total: 0, done: 0 };
      const parent = loadItem(parentId);
      const statusCols = parent ? db.select().from(columns).where(and(eq(columns.boardId, parent.boardId), eq(columns.scope, "subitem"), eq(columns.type, "status"))).all() : [];
      const col = statusCols[0];
      const done = col ? subs.filter((s) => isDone(col, s.values[col.id])).length : 0;
      return { total: subs.length, done };
    },
    format: (col, v) => formatValue(accountId, col, v),
  };
}

/** Values derived from the event itself ({from}, {to}, {column}, {user} ...). */
export function triggerVars(accountId: string, event: AppEvent | undefined): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!event) return vars;
  if (event.actorId) {
    vars.userId = event.actorId;
    const u = db.select({ name: users.name }).from(users).where(eq(users.id, event.actorId)).get();
    if (u) vars.user = u.name;
  }
  if (event.type === "column_value.changed") {
    const col = loadColumn(event.columnId);
    if (col) {
      vars.column = col.title;
      vars.from = formatValue(accountId, col, event.from);
      vars.to = formatValue(accountId, col, event.to);
    }
  }
  if (event.type === "update.created") {
    const u = db.select({ t: updates.bodyText }).from(updates).where(eq(updates.id, event.updateId)).get();
    if (u) vars.update = u.t;
  }
  return vars;
}

/** Live template variables for an item (fresh at the moment an action runs). */
export function buildVars(accountId: string, boardId: string | null, itemId: string | null | undefined, trigger: TriggerSnapshot, now: Date): Record<string, string> {
  const vars: Record<string, string> = { ...trigger.vars, date: now.toISOString().slice(0, 10), now: now.toISOString() };
  const it = itemId ? loadItem(itemId) : null;
  const bId = it?.boardId ?? boardId;
  if (bId) {
    const b = db.select({ name: boards.name }).from(boards).where(eq(boards.id, bId)).get();
    if (b) { vars.board = b.name; vars.boardId = bId; }
  }
  if (it) {
    vars.item = it.name;
    vars.itemId = it.id;
    vars.link = `${appUrl()}/boards/${it.boardId}?item=${it.id}`;
    if (it.groupId) { const g = db.select({ title: groups.title }).from(groups).where(eq(groups.id, it.groupId)).get(); if (g) vars.group = g.title; }
    if (it.parentItemId) { const p = loadItem(it.parentItemId); if (p) vars.parent = p.name; }
    for (const col of db.select().from(columns).where(eq(columns.boardId, it.boardId)).all()) {
      if (col.type === "name") continue;
      vars[`item.${col.key}`] = formatValue(accountId, col, it.values[col.id]);
    }
  }
  return vars;
}
