/**
 * Epics roadmap: every epic with its phase (Projecten & Fases), klant and how much of its work is done.
 * Tasks link to an epic through the board_relation column `epic` on the task and bug boards.
 */
import { and, eq } from "drizzle-orm";
import type { Actor } from "../../lib/actor";
import { db } from "../../db/client";
import { boards, items } from "../../db/schema/core";
import { statusLabels } from "../columns/labels";
import { boardColumns, requireBoard } from "./_shared";
import { getDevSettings, loadTasks, relationItemIds, sourceBoardsOf } from "./dev-config";
import { round } from "./sprint-metrics";

export interface EpicRow {
  id: string;
  name: string;
  status: string;
  statusColor: string;
  klant: string | null;
  phases: { id: string; name: string }[];
  timeline: { from?: string; to?: string } | null;
  tasks: { total: number; done: number; points: number; donePoints: number; inSprint: number };
  percent: number;
}

export function roadmap(actor: Actor, boardId: string): { boardId: string; epics: EpicRow[] } {
  requireBoard(actor, boardId, "board:view");
  const b = db.select().from(boards).where(eq(boards.id, boardId)).get()!;
  const sb = getDevSettings(b)?.sprintsBoardId;
  const tasks = sb ? loadTasks(sourceBoardsOf(sb)) : [];
  const cols = boardColumns(boardId, "item");
  const col = (k: string) => cols.find((c) => c.key === k);
  const rows = db.select().from(items).where(and(eq(items.boardId, boardId), eq(items.state, "active"))).all().filter((i) => !i.parentItemId);
  const phaseNames = new Map<string, string>();
  const faseCol = col("fase");
  const phaseIds = new Set(rows.flatMap((r) => (faseCol ? relationItemIds(r.values[faseCol.id]) : [])));
  for (const id of phaseIds) { const it = db.select({ name: items.name }).from(items).where(eq(items.id, id)).get(); if (it) phaseNames.set(id, it.name); }
  const st = col("status");
  const kl = col("klant");
  return {
    boardId,
    epics: rows.map((r) => {
      const mine = tasks.filter((t) => t.epicIds.includes(r.id));
      const done = mine.filter((t) => t.isDone);
      const sv = st ? (r.values[st.id] as { index: number } | undefined) : undefined;
      const label = st ? statusLabels(st.settings).find((l) => l.id === sv?.index) : undefined;
      const klIds = kl ? ((r.values[kl.id] as { ids?: number[] } | undefined)?.ids ?? []) : [];
      const tl = col("tijdlijn");
      return {
        id: r.id, name: r.name, status: label?.text ?? "", statusColor: label?.color ?? "#c4c4c4",
        klant: kl ? ((kl.settings.labels as { id: number; text: string }[] | undefined) ?? []).filter((l) => klIds.includes(l.id)).map((l) => l.text).join(", ") || null : null,
        phases: faseCol ? relationItemIds(r.values[faseCol.id]).map((id) => ({ id, name: phaseNames.get(id) ?? id })) : [],
        timeline: tl ? ((r.values[tl.id] as { from?: string; to?: string } | undefined) ?? null) : null,
        tasks: { total: mine.length, done: done.length, points: round(mine.reduce((s, t) => s + t.points, 0)), donePoints: round(done.reduce((s, t) => s + t.points, 0)), inSprint: mine.filter((t) => t.sprintId).length },
        percent: mine.length ? Math.round((done.length / mine.length) * 100) : 0,
      };
    }),
  };
}
