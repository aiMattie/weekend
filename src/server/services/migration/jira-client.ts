/**
 * Live Jira Cloud source. READ-ONLY by construction: only GET requests plus POST to the search
 * endpoint (a read). The API token goes only to the configured Atlassian host (or localhost in tests).
 */
import type { FetchLike } from "./monday-client";
import type { IssueQuery, JComment, JField, JIssue, JProject, JWorklog, JiraSource } from "./jira-types";

export class JiraApiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "JiraApiError"; }
}

const ALLOWED_POST = new Set(["/rest/api/3/search/jql"]);
const FIELDS = "summary,description,issuetype,status,priority,project,parent,assignee,reporter,created,updated,resolutiondate,statuscategorychangedate,labels,attachment,timeoriginalestimate";

export interface JiraClientOptions { baseUrl: string; email: string; apiToken: string; fetch?: FetchLike; sleep?: (ms: number) => Promise<void>; maxRetries?: number }

export const jiraEnvPresent = (env: NodeJS.ProcessEnv = process.env): boolean => !!(env.JIRA_BASE_URL && env.JIRA_EMAIL && env.JIRA_API_TOKEN);

export class JiraClient implements JiraSource {
  private base: string;
  private auth: string;
  private f: FetchLike;
  private sleep: (ms: number) => Promise<void>;
  private maxRetries: number;
  requests = 0;

  constructor(o: JiraClientOptions) {
    const u = new URL(o.baseUrl);
    const local = ["localhost", "127.0.0.1"].includes(u.hostname);
    if (!local && !(u.protocol === "https:" && u.hostname.endsWith(".atlassian.net"))) throw new Error(`Refusing to send Jira credentials to ${u.hostname}`);
    this.base = u.origin;
    this.auth = `Basic ${Buffer.from(`${o.email}:${o.apiToken}`).toString("base64")}`;
    this.f = o.fetch ?? ((url, init) => fetch(url, init as RequestInit) as unknown as ReturnType<FetchLike>);
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = o.maxRetries ?? 5;
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    if (method === "POST" && !ALLOWED_POST.has(path)) throw new Error(`Jira migration is read-only: POST ${path} refused`);
    for (let attempt = 1; ; attempt++) {
      this.requests++;
      const res = await this.f(`${this.base}${path}`, { method, headers: { Authorization: this.auth, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
      if ((res.status === 429 || res.status >= 500) && attempt <= this.maxRetries) {
        const ra = Number(res.headers.get("retry-after"));
        await this.sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(30_000, 1000 * 2 ** attempt));
        continue;
      }
      if (!res.ok) throw new JiraApiError(`Jira ${method} ${path.split("?")[0]} failed: HTTP ${res.status}`, res.status);
      return (await res.json()) as T;
    }
  }

  private async paged<T>(path: string, key: string): Promise<T[]> {
    const out: T[] = [];
    for (let startAt = 0; ; ) {
      const sep = path.includes("?") ? "&" : "?";
      const r = await this.call<Record<string, unknown> & { total?: number; isLast?: boolean }>("GET", `${path}${sep}startAt=${startAt}&maxResults=100`);
      const rows = (r[key] as T[]) ?? [];
      out.push(...rows);
      startAt += rows.length;
      if (!rows.length || r.isLast === true || (r.total !== undefined && startAt >= r.total)) return out;
    }
  }

  projects(): Promise<JProject[]> { return this.paged<JProject>("/rest/api/3/project/search?expand=insight", "values"); }
  /** the account behind the credentials (connection test) */
  myself(): Promise<{ accountId: string; displayName: string; emailAddress?: string; active?: boolean }> { return this.call("GET", "/rest/api/3/myself"); }
  fields(): Promise<JField[]> { return this.call<JField[]>("GET", "/rest/api/3/field"); }

  private jql(q: IssueQuery): string {
    // Done without a resolution happens (team-managed projects, workflows without a resolution screen): use the status change date
    const since = q.openOrDoneSince;
    const parts = [`project = "${q.project}"`, `(statusCategory != Done OR resolutiondate >= "${since}" OR (resolution IS EMPTY AND statusCategoryChangedDate >= "${since}"))`];
    if (q.updatedSince) parts.push(`updated >= "${q.updatedSince}"`);
    return `${parts.join(" AND ")} ORDER BY created ASC`;
  }

  private async search(jql: string, fields: string, max = Infinity): Promise<{ issues: JIssue[]; total?: number }> {
    const issues: JIssue[] = [];
    let token: string | undefined;
    do {
      const r = await this.call<{ issues: JIssue[]; nextPageToken?: string }>("POST", "/rest/api/3/search/jql", { jql, fields: fields.split(","), maxResults: 100, ...(token ? { nextPageToken: token } : {}) });
      issues.push(...r.issues);
      token = r.nextPageToken;
    } while (token && issues.length < max);
    return { issues };
  }

  /** custom fields must be named: /search/jql silently ignores wildcards such as customfield_* */
  async issues(q: IssueQuery): Promise<JIssue[]> { return (await this.search(this.jql(q), [FIELDS, ...(q.fields ?? [])].join(","))).issues; }
  async countIssues(q: IssueQuery): Promise<number> { return (await this.search(this.jql(q), "summary")).issues.length; }

  async activeProjectKeys(since: string): Promise<string[]> {
    const { issues } = await this.search(`updated >= "${since}" ORDER BY updated DESC`, "project");
    return [...new Set(issues.map((i) => i.fields.project.key))];
  }

  comments(key: string): Promise<JComment[]> { return this.paged<JComment>(`/rest/api/3/issue/${encodeURIComponent(key)}/comment`, "comments"); }
  async worklogs(key: string): Promise<JWorklog[]> { return (await this.paged<JWorklog>(`/rest/api/3/issue/${encodeURIComponent(key)}/worklog`, "worklogs")).map((w) => ({ ...w, issueKey: key })); }

  async download(url: string): Promise<Uint8Array> {
    const u = new URL(url);
    if (u.origin !== this.base) throw new Error("Attachment URL is not on the Jira host");
    const res = await this.f(url, { method: "GET", headers: { Authorization: this.auth } });
    if (!res.ok) throw new JiraApiError(`Attachment download failed: HTTP ${res.status}`, res.status);
    return new Uint8Array(await res.arrayBuffer());
  }
}
