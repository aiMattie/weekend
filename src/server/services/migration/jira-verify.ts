/** Verification report after a Jira migration: counts Jira vs clone per project and a field-by-field sample. */
import { and, eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { assets, items, updates } from "../../../db/schema/core";
import { sprints as sprintsTable } from "../../../db/schema/sprints";
import { relationIds, type RelationValue } from "../../columns/relation-base";
import { currentSprint, epicKeyOf, estimateOf, isEpic, isSubtask, mapPriority, mapStatus, mapType, periodOfSprint, sprintsOf, type FieldIds, type SprintCadence } from "./jira-map";
import type { JiraSnapshot } from "./jira-snapshot";
import type { JiraTargets, UserMapper } from "./jira-targets";
import { adfToHtml } from "./adf";
import { getRef } from "./refs";
import { keyOf } from "./template-kit";

export interface ProjectCheck { key: string; /** independent recount in Jira at verification time (null when no live source) */ jiraRecount: number | null; jira: { epics: number; tasks: number; subtasks: number; total: number }; clone: { epics: number; tasks: number; subtasks: number; total: number }; ok: boolean }
export interface SampleCheck { key: string; ok: boolean; diffs: string[] }
export interface VerifyReport { perProject: ProjectCheck[]; sample: SampleCheck[]; ok: boolean }

function cloneItem(key: string) {
  const ref = getRef("jira", "issue", key);
  return ref ? db.select().from(items).where(and(eq(items.id, ref.entityId), eq(items.state, "active"))).get() : undefined;
}

const labelText = (boardId: string, colKey: string, v: unknown): string => {
  const col = keyOf(boardId, colKey);
  if (!col || !v) return "";
  const labels = (col.settings.labels as { id: number; text: string }[] | undefined) ?? [];
  const o = v as { index?: number; ids?: number[] };
  return o.index !== undefined ? labels.find((l) => l.id === o.index)?.text ?? "" : (o.ids ?? []).map((i) => labels.find((l) => l.id === i)?.text).filter(Boolean).join(", ");
};

export function verifyJira(snap: JiraSnapshot, targets: JiraTargets, users: UserMapper, fields: FieldIds, opts: { sample?: number; rng?: () => number; recount?: Record<string, number>; cadence?: SprintCadence | null; today?: string } = {}): VerifyReport {
  const perProject: ProjectCheck[] = [];
  for (const pd of snap.projects) {
    const jira = { epics: pd.issues.filter(isEpic).length, tasks: pd.issues.filter((i) => !isEpic(i) && !isSubtask(i)).length, subtasks: pd.issues.filter(isSubtask).length, total: pd.issues.length };
    const clone = { epics: 0, tasks: 0, subtasks: 0, total: 0 };
    for (const i of pd.issues) {
      const it = cloneItem(i.key);
      if (!it) continue;
      clone.total++;
      if (it.parentItemId) clone.subtasks++;
      else if (it.boardId === targets.dev?.boards.epics) clone.epics++;
      else clone.tasks++;
    }
    perProject.push({ key: pd.project.key, jiraRecount: opts.recount?.[pd.project.key] ?? null, jira, clone, ok: (opts.recount?.[pd.project.key] ?? jira.total) === jira.total && JSON.stringify(jira) === JSON.stringify(clone) });
  }
  const tasks = snap.projects.flatMap((p) => p.issues.filter((i) => !isEpic(i) && !isSubtask(i)).map((i) => ({ i, p })));
  const rng = opts.rng ?? Math.random;
  const pool = [...tasks];
  const picked: typeof tasks = [];
  for (let n = opts.sample ?? 10; n > 0 && pool.length; n--) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const sample: SampleCheck[] = picked.map(({ i, p }) => {
    const diffs: string[] = [];
    const it = cloneItem(i.key);
    if (!it) return { key: i.key, ok: false, diffs: ["missing in clone"] };
    const b = it.boardId;
    const eq1 = (field: string, want: unknown, got: unknown) => { if (JSON.stringify(want ?? "") !== JSON.stringify(got ?? "")) diffs.push(`${field}: Jira ${JSON.stringify(want)} <> monday ${JSON.stringify(got)}`); };
    const val = (key: string) => it.values[keyOf(b, key)?.id ?? ""];
    eq1("summary", i.fields.summary, it.name);
    eq1("status", mapStatus(i.fields.status.name, i.fields.status.statusCategory?.key), labelText(b, "status", val("status")));
    eq1("type", mapType(i.fields.issuetype.name), labelText(b, "type", val("type")));
    eq1("prioriteit", mapPriority(i.fields.priority?.name), labelText(b, "prioriteit", val("prioriteit")));
    eq1("klant", p.project.name, labelText(b, "klant", val("klant")));
    eq1("jira_key", i.key, val("jira_key"));
    eq1("schatting", estimateOf(i, fields), val("schatting") ?? null);
    const assignee = users.map(i.fields.assignee);
    eq1("eigenaar", assignee, (val("eigenaar") as { personsAndTeams?: { id: string }[] } | undefined)?.personsAndTeams?.[0]?.id ?? null);
    const ek = epicKeyOf(i, fields);
    const epicId = relationIds(val("epic") as RelationValue | undefined)[0];
    const epicRow = epicId ? db.select().from(items).where(eq(items.id, epicId)).get() : undefined;
    eq1("epic", ek, epicRow ? String(epicRow.values[keyOf(epicRow.boardId, "jira_key")?.id ?? ""] ?? "") || null : null);
    const sp = sprintsOf(i, fields);
    const cur = currentSprint(sp);
    const sid = (val("sprint") as { sprintId?: string } | undefined)?.sprintId;
    eq1("sprint", cur ? (opts.cadence ? periodOfSprint(cur, opts.cadence, opts.today ?? new Date().toISOString().slice(0, 10)).name : cur.name) : null, sid ? db.select().from(sprintsTable).where(eq(sprintsTable.id, sid)).get()?.name ?? null : null);
    const comments = (p.comments.get(i.key) ?? []).filter((c) => adfToHtml(c.body)).length;
    const wantUpdates = comments + (adfToHtml(i.fields.description) ? 1 : 0);
    eq1("updates", wantUpdates, db.select().from(updates).where(eq(updates.itemId, it.id)).all().length);
    eq1("attachments", (i.fields.attachment ?? []).length, db.select().from(assets).where(eq(assets.itemId, it.id)).all().length);
    return { key: i.key, ok: !diffs.length, diffs };
  });
  return { perProject, sample, ok: perProject.every((p) => p.ok) && sample.every((s) => s.ok) };
}
