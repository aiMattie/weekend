/** Jira Cloud REST v3 shapes (only what the migration reads) and the source abstraction. */
export interface JUser { accountId: string; displayName: string; emailAddress?: string | null }
export interface JSprint { id: number; name: string; state: "closed" | "active" | "future"; startDate?: string; endDate?: string; completeDate?: string; goal?: string }
export interface JAttachment { id: string; filename: string; mimeType?: string; size?: number; content: string; created?: string; author?: JUser | null }
export interface JIssue {
  id: string; key: string;
  fields: {
    summary: string; description?: unknown;
    issuetype: { name: string; subtask?: boolean; hierarchyLevel?: number };
    status: { name: string; statusCategory?: { key: "new" | "indeterminate" | "done" } };
    priority?: { name: string } | null;
    project: { key: string; name: string };
    parent?: { key: string; fields?: { summary?: string; issuetype?: { name: string } } } | null;
    assignee?: JUser | null; reporter?: JUser | null;
    created: string; updated: string; resolutiondate?: string | null; statuscategorychangedate?: string | null;
    labels?: string[]; attachment?: JAttachment[]; timeoriginalestimate?: number | null;
    [custom: `customfield_${number}`]: unknown;
  };
}
export interface JComment { id: string; author?: JUser | null; body: unknown; created: string; updated?: string }
export interface JWorklog { id: string; issueKey?: string; author?: JUser | null; started: string; timeSpentSeconds: number; comment?: unknown }
export interface JProject { key: string; name: string; id: string; archived?: boolean; projectTypeKey?: string; insight?: { totalIssueCount?: number; lastIssueUpdateTime?: string } }
export interface JField { id: string; name: string; custom?: boolean; schema?: { type?: string; custom?: string } }

export interface IssueQuery {
  project: string;
  /** open issues + issues resolved on/after this ISO date */
  openOrDoneSince: string;
  /** optional extra filter (--since): only issues updated on/after this date */
  updatedSince?: string;
  /** custom field ids to fetch on top of the standard fields (sprint, epic link, story points) */
  fields?: string[];
}

/** Everything the migration needs from Jira. Live implementation: JiraClient; tests: the fixture source. */
export interface JiraSource {
  projects(): Promise<JProject[]>;
  fields(): Promise<JField[]>;
  /** issues in scope for a project (open or recently done) */
  issues(q: IssueQuery): Promise<JIssue[]>;
  /** projects with at least one issue updated on/after `since` */
  activeProjectKeys(since: string): Promise<string[]>;
  comments(issueKey: string): Promise<JComment[]>;
  worklogs(issueKey: string): Promise<JWorklog[]>;
  download(url: string): Promise<Uint8Array>;
  /** total number of issues matching the migration scope (verification) */
  countIssues(q: IssueQuery): Promise<number>;
}
