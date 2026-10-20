/** Export a board (or a selection / one group) to CSV or Excel. */
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { items } from "../../db/schema/core";
import { getColumnLogic } from "../columns/registry";
import { activeGroups } from "./groups";
import { boardColumns, formatContext, parse, requireBoard, type ColumnRow, type ItemRow } from "./_shared";

const input = z.object({
  format: z.enum(["csv", "xlsx"]).default("xlsx"),
  /** limit to these items (their subitems come along) */
  itemIds: z.array(idSchema).max(10000).optional(),
  groupId: idSchema.optional(),
  /** items in display order from the table (after filters/sort); overrides default order */
  includeSubitems: z.boolean().default(true),
});

export interface ExportFile { filename: string; mimeType: string; bytes: Buffer }

const safeName = (s: string) => s.replace(/[^\p{L}\p{N}_ -]+/gu, "").trim().replace(/\s+/g, "_") || "board";

/** Tabular model shared by csv and xlsx: header + rows of plain strings/numbers. */
export function boardTable(actor: Actor, boardId: string, raw: unknown = {}): { name: string; header: string[]; rows: (string | number)[][]; subHeader: string[]; subRows: (string | number)[][] } {
  const d = parse(input, raw);
  const board = requireBoard(actor, boardId, "board:view");
  const fmt = formatContext(actor.accountId);
  const cols = boardColumns(boardId, "item").filter((c) => !c.archived && c.type !== "name");
  const subCols = boardColumns(boardId, "subitem").filter((c) => !c.archived && c.type !== "name");
  const groupTitle = new Map(activeGroups(boardId).map((g) => [g.id, g.title]));
  let rows = db.select().from(items).where(and(eq(items.boardId, boardId), eq(items.state, "active"))).orderBy(asc(items.position)).all();
  const order = new Map(activeGroups(boardId).map((g, i) => [g.id, i]));
  const top = rows.filter((r) => !r.parentItemId && (!d.groupId || r.groupId === d.groupId) && (!d.itemIds || d.itemIds.includes(r.id)));
  top.sort((a, b) => (order.get(a.groupId ?? "") ?? 0) - (order.get(b.groupId ?? "") ?? 0) || a.position - b.position);
  // keep the table order when the client sent explicit ids
  if (d.itemIds) top.sort((a, b) => d.itemIds!.indexOf(a.id) - d.itemIds!.indexOf(b.id));
  rows = rows.filter((r) => r.parentItemId && top.some((t) => t.id === r.parentItemId));
  const cell = (col: ColumnRow, it: ItemRow): string | number => {
    const logic = getColumnLogic(col.type);
    const v = (it.values[col.id] ?? null) as never;
    if (col.type === "numbers") { const n = Number((v as unknown) as number); return v === null || Number.isNaN(n) ? "" : n; }
    return logic.format(v, col, fmt);
  };
  const header = ["Group", "Name", ...cols.map((c) => c.title)];
  const out = top.map((it) => [groupTitle.get(it.groupId ?? "") ?? "", it.name, ...cols.map((c) => cell(c, it))]);
  const subHeader = ["Parent item", "Name", ...subCols.map((c) => c.title)];
  const nameOf = new Map(top.map((t) => [t.id, t.name]));
  const subOut = d.includeSubitems ? rows.map((it) => [nameOf.get(it.parentItemId!) ?? "", it.name, ...subCols.map((c) => cell(c, it))]) : [];
  return { name: board.name, header, rows: out, subHeader, subRows: subOut };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportBoard(actor: Actor, boardId: string, raw: unknown = {}): Promise<ExportFile> {
  const d = parse(input, raw);
  const t = boardTable(actor, boardId, raw);
  const base = safeName(t.name);
  if (d.format === "csv") {
    const lines = [t.header, ...t.rows].map((r) => r.map(csvCell).join(","));
    return { filename: `${base}.csv`, mimeType: "text/csv; charset=utf-8", bytes: Buffer.from(`﻿${lines.join("\r\n")}\r\n`, "utf8") };
  }
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = actor.name ?? "Weekend";
  const ws = wb.addWorksheet(t.name.slice(0, 31) || "Board");
  ws.addRow(t.header).font = { bold: true };
  for (const r of t.rows) ws.addRow(r);
  ws.columns.forEach((c) => { c.width = 22; });
  if (t.subRows.length) {
    const sub = wb.addWorksheet("Subitems");
    sub.addRow(t.subHeader).font = { bold: true };
    for (const r of t.subRows) sub.addRow(r);
    sub.columns.forEach((c) => { c.width = 22; });
  }
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return { filename: `${base}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: buf };
}

