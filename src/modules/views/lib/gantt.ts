/**
 * Gantt maths: dependency graph (finish-to-start), pushing successors when a bar moves, and the
 * critical path. Pure and unit-tested; the view only renders the result.
 */
import { rangeLength, type DayRange } from "./dates";

export interface GanttTask { id: string; range: DayRange; /** ids of predecessors (this task depends on them) */ deps: string[] }

/** Item ids a dependency column value points to (`{ linkedPulseIds: [{ linkedPulseId }] }`). */
export function depsFromValue(value: unknown): string[] {
  if (!value) return [];
  const v = value as { linkedPulseIds?: { linkedPulseId?: string | number }[]; item_ids?: (string | number)[] };
  if (Array.isArray(value)) return (value as unknown[]).map(String);
  if (Array.isArray(v.linkedPulseIds)) return v.linkedPulseIds.map((l) => String(l.linkedPulseId)).filter((s) => s && s !== "undefined");
  if (Array.isArray(v.item_ids)) return v.item_ids.map(String);
  return [];
}

export const depsToInput = (ids: string[]) => (ids.length ? { linkedPulseIds: ids.map((id) => ({ linkedPulseId: id })) } : null);

/** successors[id] = tasks that depend on id */
export function successorMap(tasks: GanttTask[]): Map<string, string[]> {
  const ids = new Set(tasks.map((t) => t.id));
  const m = new Map<string, string[]>();
  for (const t of tasks) for (const d of t.deps) if (ids.has(d)) m.set(d, [...(m.get(d) ?? []), t.id]);
  return m;
}

/** True when adding `from -> to` (to depends on from) would create a cycle. */
export function wouldCycle(tasks: GanttTask[], from: string, to: string): boolean {
  if (from === to) return true;
  const succ = successorMap(tasks);
  const seen = new Set<string>();
  const stack = [to];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === from) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(succ.get(cur) ?? []));
  }
  return false;
}

/**
 * Apply a new range to `movedId` and push dependent tasks forward so each successor starts after
 * all of its predecessors end (duration kept; tasks are never pulled back). Returns the changed
 * ranges including the moved task itself.
 */
export function shiftWithDependencies(tasks: GanttTask[], movedId: string, newRange: DayRange): Map<string, DayRange> {
  const byId = new Map(tasks.map((t) => [t.id, { ...t, range: { ...t.range } }]));
  const changed = new Map<string, DayRange>();
  const moved = byId.get(movedId);
  if (!moved) return changed;
  moved.range = { ...newRange };
  changed.set(movedId, moved.range);
  const succ = successorMap(tasks);
  const queue = [movedId];
  let guard = 0;
  while (queue.length && guard++ < 10_000) {
    const id = queue.shift()!;
    const pred = byId.get(id)!;
    for (const sid of succ.get(id) ?? []) {
      const s = byId.get(sid)!;
      if (s.range.start <= pred.range.end) {
        const len = rangeLength(s.range);
        const start = pred.range.end + 1;
        s.range = { start, end: start + len - 1 };
        changed.set(sid, s.range);
        queue.push(sid);
      }
    }
  }
  return changed;
}

/** Critical path: the longest chain (by duration) of dependent tasks. Empty when nothing is linked. */
export function criticalPath(tasks: GanttTask[]): Set<string> {
  const ids = new Set(tasks.map((t) => t.id));
  const linked = new Set<string>();
  for (const t of tasks) for (const d of t.deps) if (ids.has(d)) { linked.add(t.id); linked.add(d); }
  if (!linked.size) return new Set();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const memo = new Map<string, { total: number; prev: string | null }>();
  const visiting = new Set<string>();
  const best = (id: string): { total: number; prev: string | null } => {
    const hit = memo.get(id);
    if (hit) return hit;
    if (visiting.has(id)) return { total: 0, prev: null };
    visiting.add(id);
    const t = byId.get(id)!;
    let top = { total: 0, prev: null as string | null };
    for (const d of t.deps) {
      if (!byId.has(d)) continue;
      const b = best(d);
      if (b.total > top.total) top = { total: b.total, prev: d };
    }
    visiting.delete(id);
    const res = { total: top.total + rangeLength(t.range), prev: top.prev };
    memo.set(id, res);
    return res;
  };
  let endId: string | null = null;
  let max = -1;
  for (const id of linked) {
    const b = best(id);
    // prefer the chain that finishes last when durations tie
    if (b.total > max || (b.total === max && endId && byId.get(id)!.range.end > byId.get(endId)!.range.end)) { max = b.total; endId = id; }
  }
  const path = new Set<string>();
  for (let cur = endId; cur; cur = memo.get(cur)?.prev ?? null) path.add(cur);
  return path;
}
