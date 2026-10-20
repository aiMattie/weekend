/**
 * One-off backfill: imports before 2026-10-08 kept only the CURRENT Jira sprint of a task. This reads the sprint
 * field of every imported issue again (read-only towards Jira) and records the earlier sprints as history rows
 * (`sprint_items`, outcome "carried"). Each Jira sprint maps to the team sprint whose period holds its start date.
 * Idempotent. See docs/decisions/0003-sprint-historie.md.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../db/client";
import { items } from "../../../db/schema/core";
import { sprints } from "../../../db/schema/sprints";
import { devColumns } from "../dev-config";
import { recordPastSprints } from "../sprint-sync";
import { discoverFields, sprintsOf } from "./jira-map";
import type { JiraSource } from "./jira-types";

export interface SprintHistoryBackfill { projects: string[]; issues: number; tasks: number; rows: number; unmatchedSprints: string[] }

export async function backfillJiraSprintHistory(source: JiraSource, o: { tasksBoardId: string; sprintsBoardId: string; apply: boolean; log?: (m: string) => void }): Promise<SprintHistoryBackfill> {
  const say = o.log ?? (() => {});
  const keyCol = devColumns(o.tasksBoardId).jira;
  if (!keyCol) throw new Error("The tasks board has no Jira key column");
  const byKey = new Map<string, string>();
  for (const r of db.select().from(items).where(and(eq(items.boardId, o.tasksBoardId), eq(items.state, "active"), isNull(items.parentItemId))).all()) {
    const k = r.values[keyCol.id];
    if (typeof k === "string" && k) byKey.set(k.toUpperCase(), r.id);
  }
  const team = db.select().from(sprints).where(eq(sprints.boardId, o.sprintsBoardId)).all().filter((s) => s.startsOn && s.endsOn);
  const teamOf = (day: string) => team.find((s) => s.startsOn! <= day && day <= s.endsOn!)?.id;
  const projects = [...new Set([...byKey.keys()].map((k) => k.split("-")[0]))].sort();
  const fields = discoverFields(await source.fields());
  if (!fields.sprint) throw new Error("Jira has no Sprint field");
  const out: SprintHistoryBackfill = { projects, issues: 0, tasks: 0, rows: 0, unmatchedSprints: [] };
  const unmatched = new Set<string>();
  for (const project of projects) {
    const issues = await source.issues({ project, openOrDoneSince: "2000-01-01", fields: [fields.sprint] });
    say(`${project}: ${issues.length} issues`);
    for (const i of issues) {
      const itemId = byKey.get(i.key.toUpperCase());
      if (!itemId) continue;
      out.issues++;
      const ids: string[] = [];
      for (const s of sprintsOf(i, fields)) {
        const id = s.startDate ? teamOf(s.startDate.slice(0, 10)) : undefined;
        if (id) ids.push(id); else unmatched.add(s.name);
      }
      if (!ids.length) continue;
      if (o.apply) {
        const n = recordPastSprints(itemId, ids);
        if (n) { out.tasks++; out.rows += n; }
      } else {
        // dry run: count the completed sprints that have no row yet
        const n = new Set(ids).size;
        if (n > 1) { out.tasks++; out.rows += n - 1; }
      }
    }
  }
  out.unmatchedSprints = [...unmatched].sort();
  return out;
}
