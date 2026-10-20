/** Phase A of the Jira migration: read everything needed from the source (async, read-only). */
import { discoverFields, sinceDate, type FieldIds } from "./jira-map";
import type { JComment, JIssue, JProject, JWorklog, JiraSource } from "./jira-types";

export interface ProjectData { project: JProject; issues: JIssue[]; comments: Map<string, JComment[]> }
export interface JiraSnapshot { fields: FieldIds; projects: ProjectData[]; worklogs: (JWorklog & { issueKey: string; projectKey: string })[]; activeSince: string; doneSince: string }

export interface FetchJiraOptions { projects?: string[]; since?: string; doneDays?: number; activeDays?: number; now?: Date; log?: (m: string) => void }

export async function fetchJiraSnapshot(src: JiraSource, o: FetchJiraOptions = {}): Promise<JiraSnapshot> {
  const say = o.log ?? (() => {});
  const doneSince = sinceDate(o.doneDays ?? 90, o.now);
  const activeSince = sinceDate(o.activeDays ?? 60, o.now);
  const all = await src.projects();
  const keys = o.projects?.length ? o.projects.map((k) => k.toUpperCase()) : await src.activeProjectKeys(activeSince);
  const wanted = all.filter((p) => keys.includes(p.key.toUpperCase()) && !p.archived);
  const missing = keys.filter((k) => !all.some((p) => p.key.toUpperCase() === k));
  if (missing.length) say(`unknown project key(s): ${missing.join(", ")}`);
  const fields = discoverFields(await src.fields());
  const custom = [fields.sprint, fields.epicLink, fields.storyPoints].filter((f): f is string => !!f);
  const projects: ProjectData[] = [];
  const worklogs: JiraSnapshot["worklogs"] = [];
  for (const project of wanted) {
    const issues = await src.issues({ project: project.key, openOrDoneSince: doneSince, updatedSince: o.since, fields: custom });
    say(`${project.key}: ${issues.length} issues`);
    const comments = new Map<string, JComment[]>();
    for (const i of issues) {
      const c = await src.comments(i.key);
      if (c.length) comments.set(i.key, c);
      for (const w of await src.worklogs(i.key)) worklogs.push({ ...w, issueKey: i.key, projectKey: project.key });
    }
    projects.push({ project, issues, comments });
  }
  return { fields, projects, worklogs, activeSince, doneSince };
}
