import { z } from "zod";
import { getColumnLogic } from "@/server/columns/registry";
import { asRef, collectEntries, columnFor, fmtCtx, findColumnAnywhere, type Entry } from "../columns-util";
import type { WidgetContext, WidgetDefinition } from "../types";
import { baseShape } from "./common";

const schema = z.object({
  ...baseShape,
  columnIds: z.array(z.string()).default([]),
  sortColumnId: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  limit: z.number().int().min(1).max(500).default(50),
});
export type ItemsSettings = z.infer<typeof schema>;

export interface ItemRowData { id: string; boardId: string; boardName: string; name: string; cells: { text: string; color?: string }[] }
export interface ItemsData { columns: string[]; rows: ItemRowData[]; total: number }

function cellOf(ctx: WidgetContext, e: Entry, refId: string): { text: string; color?: string } {
  const ref = findColumnAnywhere(ctx, refId);
  const col = columnFor(e.board, ref);
  if (!ref || !col) return { text: "" };
  const v = e.item.values[col.id] ?? null;
  const text = getColumnLogic(col.type).format(v as never, asRef(col), fmtCtx(ctx));
  let color: string | undefined;
  if (col.type === "status") color = (col.settings.labels as { id: number; color: string }[] | undefined)?.find((l) => l.id === (v as { index?: number } | null)?.index)?.color;
  return { text, color };
}

export function itemsQuery(ctx: WidgetContext, s: ItemsSettings): ItemsData {
  let entries = collectEntries(ctx, s);
  const colIds = s.columnIds.length ? s.columnIds : defaultColumns(ctx, s);
  if (s.sortColumnId) {
    const ref = findColumnAnywhere(ctx, s.sortColumnId);
    const key = (e: Entry): string | number | null => {
      const col = columnFor(e.board, ref);
      if (!ref || !col) return null;
      const l = getColumnLogic(col.type);
      return l.sortKey ? l.sortKey((e.item.values[col.id] ?? null) as never, asRef(col), fmtCtx(ctx)) : null;
    };
    entries = [...entries].sort((a, b) => {
      const ka = key(a), kb = key(b);
      if (ka === kb) return 0;
      if (ka === null) return 1;
      if (kb === null) return -1;
      return (ka < kb ? -1 : 1) * (s.sortDir === "asc" ? 1 : -1);
    });
  }
  return {
    columns: colIds.map((id) => findColumnAnywhere(ctx, id)?.title ?? ""),
    total: entries.length,
    rows: entries.slice(0, s.limit).map((e) => ({ id: e.item.id, boardId: e.board.id, boardName: e.board.name, name: e.item.name, cells: colIds.map((id) => cellOf(ctx, e, id)) })),
  };
}

/** Without a configuration: status + people + first date of the first selected board. */
function defaultColumns(ctx: WidgetContext, s: ItemsSettings): string[] {
  const board = ctx.boards.find((b) => !s.boardIds.length || s.boardIds.includes(b.id));
  if (!board) return [];
  return ["status", "people", "date"].map((t) => board.columns.find((c) => c.type === t)?.id).filter(Boolean) as string[];
}

const fields: WidgetDefinition["fields"] = [
  { key: "boardIds", kind: "boards" }, { key: "columnIds", kind: "columns" }, { key: "sortColumnId", kind: "column" },
  { key: "sortDir", kind: "select", options: [{ value: "asc", label: "asc" }, { value: "desc", label: "desc" }] },
  { key: "limit", kind: "number" }, { key: "filters", kind: "filters" },
];

export const listWidget: WidgetDefinition<ItemsSettings> = {
  type: "list", label: "List", description: "Compact list of items with a few columns.", category: "lists", icon: "Bullets",
  defaultLayout: { w: 4, h: 6, minW: 3, minH: 3 }, configSchema: schema, fields, query: itemsQuery,
};
export const tableWidget: WidgetDefinition<ItemsSettings> = {
  type: "table", label: "Table", description: "Table of items from one or more boards with chosen columns.", category: "lists", icon: "Table",
  defaultLayout: { w: 8, h: 6, minW: 4, minH: 3 }, configSchema: schema, fields, query: itemsQuery,
};
