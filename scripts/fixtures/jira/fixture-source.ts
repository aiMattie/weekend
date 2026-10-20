/** A JiraSource backed by the recorded JSON fixtures (same semantics as the live JQL of JiraClient). */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { IssueQuery, JComment, JField, JIssue, JProject, JWorklog, JiraSource } from "../../../src/server/services/migration/jira-types";

const dir = path.dirname(new URL(import.meta.url).pathname);
const load = <T>(n: string): T => JSON.parse(readFileSync(path.join(dir, `${n}.json`), "utf8")) as T;

export function fixtureSource(overrides: { issues?: Record<string, JIssue[]> } = {}): JiraSource & { downloads: string[] } {
  const projects = load<JProject[]>("projects");
  const issues = overrides.issues ?? load<Record<string, JIssue[]>>("issues");
  const comments = load<Record<string, JComment[]>>("comments");
  const worklogs = load<Record<string, JWorklog[]>>("worklogs");
  const fields = load<JField[]>("fields");
  const inScope = (i: JIssue, q: IssueQuery) =>
    (i.fields.status.statusCategory?.key !== "done" || (i.fields.resolutiondate ?? i.fields.statuscategorychangedate ?? "") >= q.openOrDoneSince) && (!q.updatedSince || i.fields.updated.slice(0, 10) >= q.updatedSince);
  const downloads: string[] = [];
  return {
    downloads,
    projects: async () => projects,
    fields: async () => fields,
    issues: async (q) => (issues[q.project] ?? []).filter((i) => inScope(i, q)),
    countIssues: async (q) => (issues[q.project] ?? []).filter((i) => inScope(i, q)).length,
    activeProjectKeys: async (since) => Object.entries(issues).filter(([, list]) => list.some((i) => i.fields.updated.slice(0, 10) >= since)).map(([k]) => k),
    comments: async (k) => comments[k] ?? [],
    worklogs: async (k) => (worklogs[k] ?? []).map((w) => ({ ...w, issueKey: k })),
    download: async (url) => { downloads.push(url); return new TextEncoder().encode("hello pdf!!"); },
  };
}
