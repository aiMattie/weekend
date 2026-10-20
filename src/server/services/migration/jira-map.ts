/** Pure Jira -> monday mapping rules (plan section 7) and worklog aggregation. No database access. */
import type { JField, JIssue, JSprint, JWorklog } from "./jira-types";

export type TaskStatus = "Backlog" | "Ready" | "In progress" | "Review" | "Wacht op klant" | "Done" | "Blocked";
export type TaskType = "Feature" | "Bug" | "Chore" | "Onderzoek";
export type Priority = "P1" | "P2" | "P3" | "P4";

/** To Do/In Progress/Done -> Ready/In progress/Done; Waiting on/Awaiting -> Wacht op klant (plan 7). */
export function mapStatus(name: string, category?: string): TaskStatus {
  const n = name.toLowerCase();
  if (/wait|awaiting|wacht|on hold|pending|customer|klant/.test(n)) return "Wacht op klant";
  if (/block|impediment|stuck/.test(n)) return "Blocked";
  if (category === "done" || /^(done|closed|resolved|afgerond|gesloten|released|klaar)$/.test(n)) return "Done";
  if (/review|testing|qa|verif|acceptance/.test(n)) return "Review";
  if (/progress|doing|develop|uitvoering|bezig/.test(n) || category === "indeterminate") return "In progress";
  if (/backlog/.test(n)) return "Backlog";
  return "Ready";
}

export function mapPriority(name?: string | null): Priority {
  const n = (name ?? "").toLowerCase();
  if (/highest|blocker|critical|urgent|p1/.test(n)) return "P1";
  if (/high|major|p2/.test(n)) return "P2";
  if (/lowest|trivial|p4/.test(n)) return "P4";
  if (/low|minor/.test(n)) return "P4";
  return "P3";
}

/** Story / Task / Bug -> Taak with Type Feature / Chore / Bug. */
export function mapType(issueType: string): TaskType {
  const n = issueType.toLowerCase();
  if (/bug|defect|incident/.test(n)) return "Bug";
  if (/spike|research|onderzoek|investigat/.test(n)) return "Onderzoek";
  if (/story|feature|improvement|enhancement|new/.test(n)) return "Feature";
  return "Chore";
}

export const isEpic = (i: JIssue) => i.fields.issuetype.name.toLowerCase() === "epic" || i.fields.issuetype.hierarchyLevel === 1;
export const isSubtask = (i: JIssue) => !!i.fields.issuetype.subtask || /sub-?task|subtaak/i.test(i.fields.issuetype.name);

export interface FieldIds { sprint?: string; epicLink?: string; storyPoints?: string }

/** Find custom field ids by schema/name (they differ per Jira instance). */
export function discoverFields(fields: JField[]): FieldIds {
  const by = (pred: (f: JField) => boolean) => fields.find(pred)?.id;
  return {
    sprint: by((f) => f.schema?.custom === "com.pyxis.greenhopper.jira:gh-sprint") ?? by((f) => f.name === "Sprint"),
    epicLink: by((f) => f.schema?.custom === "com.pyxis.greenhopper.jira:gh-epic-link") ?? by((f) => f.name === "Epic Link"),
    storyPoints: by((f) => f.schema?.custom === "com.pyxis.greenhopper.jira:jsw-story-points") ?? by((f) => /^story point/i.test(f.name)),
  };
}

export function epicKeyOf(i: JIssue, ids: FieldIds): string | null {
  const p = i.fields.parent;
  if (p && /epic/i.test(p.fields?.issuetype?.name ?? "")) return p.key;
  const legacy = ids.epicLink ? (i.fields[ids.epicLink as `customfield_${number}`] as string | null | undefined) : null;
  return typeof legacy === "string" && legacy ? legacy : null;
}

export function sprintsOf(i: JIssue, ids: FieldIds): JSprint[] {
  const raw = ids.sprint ? i.fields[ids.sprint as `customfield_${number}`] : undefined;
  return Array.isArray(raw) ? (raw as JSprint[]).filter((s) => s && typeof s.id === "number") : [];
}

/** The sprint a task lives in now: the active one, else a future one, else the most recent closed sprint. */
export function currentSprint(sprints: JSprint[]): JSprint | null {
  const rank = (s: JSprint) => (s.state === "active" ? 3 : s.state === "future" ? 2 : 1);
  return [...sprints].sort((a, b) => rank(b) - rank(a) || (b.startDate ?? "").localeCompare(a.startDate ?? ""))[0] ?? null;
}

/* ------------------------------------------------------------------ team sprint cadence */

/**
 * monday dev works with one team sprint per period; Jira often has a sprint per board (per client) running in
 * parallel. With a cadence, every Jira sprint folds into the team sprint whose period contains its start date.
 */
export interface SprintCadence { /** YYYY-MM-DD, the first day of any team sprint */ anchor: string; weeks: number }
export interface SprintPeriod { from: string; to: string; name: string }

const DAY = 86_400_000;
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const utc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const label = (d: string, year: boolean) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}${year ? ` ${d.slice(0, 4)}` : ""}`;

/** The team sprint period that contains `day` (YYYY-MM-DD). Name: "Sprint 5 okt – 1 nov 2026". */
export function sprintPeriod(day: string, c: SprintCadence): SprintPeriod {
  const len = c.weeks * 7;
  const n = Math.floor((utc(day) - utc(c.anchor)) / DAY / len);
  const from = ymd(utc(c.anchor) + n * len * DAY);
  const to = ymd(utc(from) + (len - 1) * DAY);
  return { from, to, name: `Sprint ${label(from, from.slice(0, 4) !== to.slice(0, 4))} – ${label(to, true)}` };
}

/**
 * Period of a Jira sprint. Open work stays in the present: an active sprint is the current period (also when it
 * started earlier and was not closed yet), a future one is never before it (no dates: the next period). A closed
 * sprint belongs to the period of its start date.
 */
export function periodOfSprint(s: JSprint, c: SprintCadence, today: string): SprintPeriod {
  const cur = sprintPeriod(today, c);
  if (s.state === "active") return cur;
  if (s.state === "future") {
    const p = s.startDate ? sprintPeriod(s.startDate.slice(0, 10), c) : null;
    return p && p.from > cur.from ? p : s.startDate ? cur : sprintPeriod(ymd(utc(cur.to) + DAY), c);
  }
  return s.startDate ? sprintPeriod(s.startDate.slice(0, 10), c) : cur;
}

/** planned / active / completed of a period relative to `today`. */
export const periodState = (p: SprintPeriod, today: string): "planned" | "active" | "completed" => (p.to < today ? "completed" : p.from > today ? "planned" : "active");

export function estimateOf(i: JIssue, ids: FieldIds): number | null {
  if (i.fields.timeoriginalestimate) return Math.round((i.fields.timeoriginalestimate / 3600) * 100) / 100;
  const sp = ids.storyPoints ? i.fields[ids.storyPoints as `customfield_${number}`] : null;
  return typeof sp === "number" ? sp : null;
}

/* ------------------------------------------------------------------ worklogs */

export interface HourRow { project: string; klant: string; fase: string; accountId: string; person: string; month: string; hours: number; billable: boolean; meerwerk: boolean; entries: number }

export interface WorklogCtx {
  projectName(projectKey: string): string;
  /** fase (phase) name for an issue: epic -> phase, "" when unknown */
  faseOf(issueKey: string): string;
  isNonBillable(issueKey: string, projectKey: string): boolean;
  isMeerwerk(issueKey: string): boolean;
}

export const monthOf = (iso: string): string => iso.slice(0, 7);

/**
 * Aggregate worklogs of ONE invoicing period (month) per client + phase + person + month
 * (+ billable/meerwerk class, so non-billable hours stay separable). Hours rounded to 2 decimals.
 */
export function aggregateWorklogs(logs: (JWorklog & { issueKey: string; projectKey: string })[], period: { from: string; to: string }, ctx: WorklogCtx): HourRow[] {
  const map = new Map<string, HourRow>();
  for (const w of logs) {
    const day = w.started.slice(0, 10);
    if (day < period.from || day > period.to) continue;
    const accountId = w.author?.accountId ?? "unknown";
    const billable = !ctx.isNonBillable(w.issueKey, w.projectKey);
    const meerwerk = billable && ctx.isMeerwerk(w.issueKey);
    const klant = ctx.projectName(w.projectKey);
    const fase = ctx.faseOf(w.issueKey);
    const month = monthOf(w.started);
    const key = [klant, fase, accountId, month, billable, meerwerk].join("|");
    const row = map.get(key) ?? { project: w.projectKey, klant, fase, accountId, person: w.author?.displayName ?? "Onbekend", month, hours: 0, billable, meerwerk, entries: 0 };
    row.hours += w.timeSpentSeconds / 3600;
    row.entries++;
    map.set(key, row);
  }
  return [...map.values()].map((r) => ({ ...r, hours: Math.round(r.hours * 100) / 100 })).sort((a, b) => a.klant.localeCompare(b.klant) || a.fase.localeCompare(b.fase) || a.person.localeCompare(b.person) || a.month.localeCompare(b.month));
}

/** First and last day of the month containing `date` (YYYY-MM-DD or YYYY-MM). */
export function monthPeriod(date: string): { from: string; to: string; label: string } {
  const [y, m] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const label = `${y}-${String(m).padStart(2, "0")}`;
  return { from: `${label}-01`, to: `${label}-${String(last).padStart(2, "0")}`, label };
}

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** All raw worklogs as CSV (the archive the plan asks for). */
export function worklogsCsv(logs: (JWorklog & { issueKey: string; projectKey: string })[]): string {
  const head = ["project", "issue", "author", "author_account_id", "started", "hours", "seconds", "comment"];
  const lines = logs.map((w) => [w.projectKey, w.issueKey, w.author?.displayName, w.author?.accountId, w.started, (w.timeSpentSeconds / 3600).toFixed(2), w.timeSpentSeconds, typeof w.comment === "string" ? w.comment : ""].map(csvCell).join(","));
  return [head.join(","), ...lines].join("\n") + "\n";
}

export const sinceDate = (days: number, now = new Date()): string => new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
