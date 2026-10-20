import type { Task } from "@/server/services/dev-config";

/** How the active sprint board is split into swimlanes (view setting `groupBy`). */
export type SprintGroupBy = "none" | "klant" | "klant_epic";

export interface Swimlane { key: string; title: string; tasks: Task[]; children: Swimlane[] }

const byTitle = (a: Swimlane, b: Swimlane) => a.title.localeCompare(b.title, "nl");

/** Bucket tasks per value; tasks without a value go in a trailing `emptyTitle` bucket. */
function bucket(tasks: Task[], prefix: string, keysOf: (t: Task) => string[], emptyTitle: string): Swimlane[] {
  const map = new Map<string, Task[]>();
  const none: Task[] = [];
  for (const t of tasks) {
    const keys = keysOf(t);
    if (!keys.length) none.push(t);
    for (const k of keys) map.set(k, [...(map.get(k) ?? []), t]);
  }
  const out = [...map].map(([title, ts]) => ({ key: `${prefix}${title}`, title, tasks: ts, children: [] })).sort(byTitle);
  return none.length ? [...out, { key: `${prefix}`, title: emptyTitle, tasks: none, children: [] }] : out;
}

/**
 * Swimlanes per client and, with `klant_epic`, per epic (project) inside a client. A client without
 * any epic-linked task gets no epic sub-lanes.
 */
export function buildSwimlanes(tasks: Task[], groupBy: SprintGroupBy, labels: { noKlant: string; noEpic: string }): Swimlane[] {
  if (groupBy === "none") return [{ key: "all", title: "", tasks, children: [] }];
  return bucket(tasks, "k:", (t) => (t.klant ? [t.klant] : []), labels.noKlant).map((k) => ({
    ...k,
    children: groupBy === "klant_epic" && k.tasks.some((t) => t.epicIds.length) ? bucket(k.tasks, `${k.key}|e:`, (t) => t.epicNames, labels.noEpic) : [],
  }));
}
