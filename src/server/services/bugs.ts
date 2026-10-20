/**
 * Bugs board: time to resolution. When a bug reaches a Done status the columns "Opgelost op" and
 * "Tijd tot oplossing (dagen)" are filled; reopening clears them. `stats` feeds the bug overview view.
 */
import { and, eq } from "drizzle-orm";
import { systemActor, type Actor } from "../../lib/actor";
import { db } from "../../db/client";
import { boards, items, workspaces } from "../../db/schema/core";
import { nowIso } from "../../lib/time";
import * as itemsSvc from "./items";
import { boardColumns, requireBoard } from "./_shared";
import { devColumns, getDevSettings, readTask } from "./dev-config";
import { average, dayOf, round } from "./sprint-metrics";

const col = (boardId: string, key: string) => boardColumns(boardId, "item").find((c) => c.key === key);

/** Hook (called on every item change on dev source boards): maintain resolution columns of bugs. */
export function syncBug(itemId: string): void {
  const it = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!it || it.state !== "active" || it.parentItemId) return;
  const b = db.select().from(boards).where(eq(boards.id, it.boardId)).get();
  if (!b || getDevSettings(b)?.role !== "bugs") return;
  const resolved = col(b.id, "opgelost_op");
  const days = col(b.id, "oplostijd");
  if (!resolved || !days) return;
  const t = readTask(it, devColumns(b.id));
  const has = !!it.values[resolved.id];
  if (t.isDone && !has) {
    const now = nowIso();
    const d = round((Date.parse(now) - Date.parse(it.createdAt)) / 86_400_000);
    itemsSvc.changeMultipleColumnValues(botActor(b.workspaceId), itemId, { [resolved.id]: { date: dayOf(now) }, [days.id]: d });
  } else if (!t.isDone && has) {
    itemsSvc.changeMultipleColumnValues(botActor(b.workspaceId), itemId, { [resolved.id]: null, [days.id]: null });
  }
}

function botActor(workspaceId: string): Actor {
  const accountId = db.select({ a: workspaces.accountId }).from(workspaces).where(eq(workspaces.id, workspaceId)).get()!.a;
  return systemActor(accountId, "system");
}

export interface BugRow { id: string; name: string; status: string; isDone: boolean; prioriteit: string | null; klant: string | null; createdAt: string; resolvedOn: string | null; days: number | null }
export interface BugStats { boardId: string; open: number; resolved: number; averageDays: number | null; medianDays: number | null; byPriority: { prioriteit: string; open: number; resolved: number; averageDays: number | null }[]; bugs: BugRow[] }

export function stats(actor: Actor, boardId: string): BugStats {
  requireBoard(actor, boardId, "board:view");
  const cols = devColumns(boardId);
  const resolvedCol = col(boardId, "opgelost_op");
  const daysCol = col(boardId, "oplostijd");
  const rows = db.select().from(items).where(and(eq(items.boardId, boardId), eq(items.state, "active"))).all().filter((i) => !i.parentItemId);
  const bugs: BugRow[] = rows.map((r) => {
    const t = readTask(r, cols);
    const d = daysCol ? r.values[daysCol.id] : undefined;
    const rv = resolvedCol ? (r.values[resolvedCol.id] as { date?: string } | undefined) : undefined;
    return { id: r.id, name: r.name, status: t.status, isDone: t.isDone, prioriteit: t.prioriteit, klant: t.klant, createdAt: r.createdAt, resolvedOn: rv?.date ?? null, days: typeof d === "number" ? d : null };
  });
  const solved = bugs.filter((b) => b.isDone && b.days !== null).map((b) => b.days as number).sort((a, b) => a - b);
  const mid = Math.floor(solved.length / 2);
  const prios = [...new Set(bugs.map((b) => b.prioriteit ?? "-"))].sort();
  return {
    boardId, open: bugs.filter((b) => !b.isDone).length, resolved: bugs.filter((b) => b.isDone).length,
    averageDays: average(solved), medianDays: solved.length ? (solved.length % 2 ? solved[mid] : round((solved[mid - 1] + solved[mid]) / 2)) : null,
    byPriority: prios.map((p) => {
      const g = bugs.filter((b) => (b.prioriteit ?? "-") === p);
      return { prioriteit: p, open: g.filter((b) => !b.isDone).length, resolved: g.filter((b) => b.isDone).length, averageDays: average(g.filter((b) => b.isDone && b.days !== null).map((b) => b.days as number)) };
    }),
    bugs: bugs.sort((a, b) => Number(a.isDone) - Number(b.isDone) || b.createdAt.localeCompare(a.createdAt)),
  };
}
