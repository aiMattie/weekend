/** Aggregations over a board for board_insights and the report prompts. */
import type { Actor } from "@/lib/actor";
import { getColumnLogic } from "@/server/columns/registry";
import { statusLabels } from "@/server/columns/labels";
import { formatContext } from "@/server/services/_shared";
import * as services from "@/server/services";
import { queryBoardItems, type ItemsQueryParams } from "@/server/graphql/items-query";

export interface Insights {
  board: { id: string; name: string };
  total_items: number;
  by_group: { group: string; count: number }[];
  breakdown: Record<string, { title: string; type: string; counts: Record<string, number> }>;
  sums: Record<string, { title: string; sum: number; avg: number; count: number }>;
  overdue: { id: string; name: string; due: string; column: string }[];
  empty_counts: Record<string, number>;
}

export function boardInsights(actor: Actor, boardId: string, opts: { filters?: ItemsQueryParams | null; columnIds?: string[] } = {}): Insights {
  const board = services.boards.get(actor, boardId);
  const cols = services.columns.list(actor, boardId, "item").filter((c) => !c.archived && c.type !== "name" && (!opts.columnIds?.length || opts.columnIds.includes(c.key) || opts.columnIds.includes(c.id)));
  const groups = services.groups.list(actor, boardId);
  const rows = queryBoardItems(actor, boardId, opts.filters ?? null);
  const fmt = formatContext(actor.accountId);
  const today = new Date().toISOString().slice(0, 10);

  const insights: Insights = { board: { id: board.id, name: board.name }, total_items: rows.length, by_group: [], breakdown: {}, sums: {}, overdue: [], empty_counts: {} };
  insights.by_group = groups.map((g) => ({ group: g.title, count: rows.filter((r) => r.groupId === g.id).length }));

  const statusCol = cols.find((c) => c.type === "status");
  for (const col of cols) {
    const logic = getColumnLogic(col.type);
    let empty = 0;
    if (["status", "dropdown", "people", "checkbox"].includes(col.type)) {
      const counts: Record<string, number> = {};
      for (const r of rows) {
        const v = r.values[col.id] ?? null;
        const t = logic.format(v as never, col, fmt);
        if (!t) { empty++; continue; }
        for (const part of col.type === "status" || col.type === "checkbox" ? [t] : t.split(", ")) counts[part] = (counts[part] ?? 0) + 1;
      }
      insights.breakdown[col.key] = { title: col.title, type: col.type, counts };
    } else if (col.type === "numbers") {
      const nums = rows.map((r) => r.values[col.id]).filter((v): v is number => typeof v === "number");
      empty = rows.length - nums.length;
      const sum = nums.reduce((a, b) => a + b, 0);
      insights.sums[col.key] = { title: col.title, sum: Math.round(sum * 1e6) / 1e6, avg: nums.length ? Math.round((sum / nums.length) * 1e6) / 1e6 : 0, count: nums.length };
    } else if (col.type === "date" || col.type === "timeline") {
      for (const r of rows) {
        const v = r.values[col.id] as { date?: string; to?: string } | null | undefined;
        const due = col.type === "date" ? v?.date : v?.to;
        if (!due) { empty++; continue; }
        const done = statusCol ? statusLabels(statusCol.settings).find((l) => l.id === (r.values[statusCol.id] as { index?: number } | undefined)?.index)?.isDone : false;
        if (due < today && !done) insights.overdue.push({ id: r.id, name: r.name, due, column: col.title });
      }
    } else {
      for (const r of rows) if (!logic.format((r.values[col.id] ?? null) as never, col, fmt)) empty++;
    }
    insights.empty_counts[col.key] = empty;
  }
  insights.overdue = insights.overdue.slice(0, 50);
  return insights;
}
