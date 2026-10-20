/**
 * Generates the synthetic Jira fixtures (no real customer data). Dates are fixed around 2026-10-06
 * so tests are deterministic:  npx tsx scripts/fixtures/jira/generate.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

const dir = path.dirname(new URL(import.meta.url).pathname);
const U = {
  J1: { accountId: "acc-builder", displayName: "Builder Developer", emailAddress: "dev1@example.com" },
  J2: { accountId: "acc-reviewer", displayName: "Reviewer Dev" },
  J3: { accountId: "acc-coordinator", displayName: "Coordinator Pm", emailAddress: "pm2@example.com" },
  J4: { accountId: "acc-unknown", displayName: "Unknown Person" },
};
const adf = (...paras: string[]) => ({ type: "doc", version: 1, content: paras.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] })) });
const adfRich = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "Belangrijk", marks: [{ type: "strong" }] }, { type: "text", text: " en " }, { type: "text", text: "link", marks: [{ type: "link", attrs: { href: "https://example.test/x" } }] }] }, { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "punt een" }] }] }] }] };

const S1 = { id: 11, name: "Sprint 1", state: "closed", startDate: "2026-09-07T08:00:00.000Z", endDate: "2026-09-18T17:00:00.000Z", completeDate: "2026-09-18T16:30:00.000Z", goal: "Fundament" };
const S2 = { id: 12, name: "Sprint 2", state: "active", startDate: "2026-09-21T08:00:00.000Z", endDate: "2026-10-02T17:00:00.000Z" };
const S3 = { id: 13, name: "Sprint 3", state: "future" };

type P = { key: string; name: string };
const issue = (p: P, n: number, o: { type: string; summary: string; status: string; cat: "new" | "indeterminate" | "done"; prio?: string; assignee?: keyof typeof U; reporter?: keyof typeof U; created?: string; updated?: string; resolved?: string; parent?: { key: string; type: string }; sprints?: unknown[]; sp?: number; est?: number; labels?: string[]; desc?: unknown; attachments?: unknown[]; epicLink?: string; subtask?: boolean }) => ({
  id: String(10000 + n + p.key.charCodeAt(0) * 100), key: `${p.key}-${n}`,
  fields: {
    summary: o.summary, description: o.desc ?? null,
    issuetype: { name: o.type, subtask: !!o.subtask, hierarchyLevel: o.type === "Epic" ? 1 : o.subtask ? -1 : 0 },
    status: { name: o.status, statusCategory: { key: o.cat } }, priority: o.prio ? { name: o.prio } : null,
    project: { key: p.key, name: p.name },
    parent: o.parent ? { key: o.parent.key, fields: { issuetype: { name: o.parent.type } } } : null,
    assignee: o.assignee ? U[o.assignee] : null, reporter: U[o.reporter ?? "J3"],
    created: o.created ?? "2026-08-20T09:00:00.000+0200", updated: o.updated ?? "2026-10-02T10:00:00.000+0200", resolutiondate: o.resolved ?? null,
    labels: o.labels ?? [], attachment: o.attachments ?? [], timeoriginalestimate: o.est ?? null,
    customfield_10020: o.sprints ?? null, customfield_10016: o.sp ?? null, customfield_10014: o.epicLink ?? null,
  },
});

const A = { key: "ALPHA", name: "Alpha Klant" }, B = { key: "BETA", name: "Beta BV" }, I = { key: "INT", name: "Example Intern" }, OLD = { key: "OLD", name: "Oude Klant" };
const attach = { id: "att-1", filename: "spec.pdf", mimeType: "application/pdf", size: 11, content: "https://fixture.atlassian.net/secure/attachment/att-1/spec.pdf", created: "2026-09-01T10:00:00.000+0200", author: U.J1 };

const issues: Record<string, unknown[]> = {
  ALPHA: [
    issue(A, 1, { type: "Epic", summary: "MVP bouwen", status: "In Progress", cat: "indeterminate", assignee: "J3" }),
    issue(A, 2, { type: "Story", summary: "Login scherm", status: "To Do", cat: "new", prio: "High", assignee: "J1", parent: { key: "ALPHA-1", type: "Epic" }, sprints: [S1, S2], sp: 5, desc: adfRich, attachments: [attach] }),
    issue(A, 3, { type: "Bug", summary: "Crash bij upload", status: "In Progress", cat: "indeterminate", prio: "Highest", assignee: "J2", parent: { key: "ALPHA-1", type: "Epic" }, sprints: [S2], est: 7200 }),
    issue(A, 4, { type: "Task", summary: "Documentatie", status: "Done", cat: "done", prio: "Low", assignee: "J1", parent: { key: "ALPHA-1", type: "Epic" }, sprints: [S1], resolved: "2026-09-26T12:00:00.000+0200", updated: "2026-09-26T12:00:00.000+0200" }),
    issue(A, 5, { type: "Sub-task", summary: "Wireframe", status: "Done", cat: "done", assignee: "J1", parent: { key: "ALPHA-2", type: "Story" }, subtask: true, resolved: "2026-09-10T12:00:00.000+0200" }),
    issue(A, 6, { type: "Task", summary: "Wachten op API-sleutel", status: "Waiting on customer", cat: "indeterminate", prio: "Low", assignee: "J4" }),
    issue(A, 7, { type: "Task", summary: "Oude taak (te oud)", status: "Done", cat: "done", resolved: "2026-06-01T12:00:00.000+0200", updated: "2026-06-01T12:00:00.000+0200" }),
    issue(A, 8, { type: "Story", summary: "Rapportage", status: "In Review", cat: "indeterminate", prio: "Medium", assignee: "J2", sprints: [S3], epicLink: "ALPHA-1" }),
  ],
  BETA: [
    issue(B, 1, { type: "Epic", summary: "Support", status: "Done", cat: "done", resolved: "2026-09-06T12:00:00.000+0200" }),
    issue(B, 2, { type: "Task", summary: "Strippenkaart afboeken", status: "Awaiting feedback", cat: "indeterminate", prio: "Medium", assignee: "J3", parent: { key: "BETA-1", type: "Epic" } }),
    issue(B, 3, { type: "Task", summary: "Meerwerk dashboard", status: "To Do", cat: "new", labels: ["meerwerk"], assignee: "J1" }),
  ],
  INT: [issue(I, 1, { type: "Task", summary: "Intern overleg", status: "To Do", cat: "new", assignee: "J2" })],
  OLD: [issue(OLD, 1, { type: "Task", summary: "Verlaten project", status: "To Do", cat: "new", updated: "2026-03-01T10:00:00.000+0200" })],
};

const comments: Record<string, unknown[]> = {
  "ALPHA-2": [
    { id: "c1", author: U.J3, body: adf("Graag ook SSO meenemen"), created: "2026-09-02T09:00:00.000+0200" },
    { id: "c2", author: U.J4, body: adf("Akkoord vanuit de klant"), created: "2026-09-03T09:00:00.000+0200" },
  ],
  "ALPHA-3": [{ id: "c3", author: U.J2, body: adf("Reproduceerbaar met bestanden > 10MB"), created: "2026-09-25T09:00:00.000+0200" }],
};

const wl = (issueKey: string, who: keyof typeof U, started: string, hours: number, id: string) => ({ id, issueKey, author: U[who], started: `${started}T09:00:00.000+0200`, timeSpentSeconds: hours * 3600 });
const worklogs: Record<string, unknown[]> = {
  "ALPHA-2": [wl("ALPHA-2", "J1", "2026-10-01", 2, "w1"), wl("ALPHA-2", "J1", "2026-10-02", 3, "w2"), wl("ALPHA-2", "J3", "2026-10-02", 1, "w3")],
  "ALPHA-3": [wl("ALPHA-3", "J2", "2026-10-05", 4, "w4"), wl("ALPHA-3", "J1", "2026-09-28", 2, "w5")],
  "ALPHA-5": [wl("ALPHA-5", "J1", "2026-10-02", 1, "w6")],
  "ALPHA-6": [wl("ALPHA-6", "J4", "2026-10-03", 1.5, "w7")],
  "BETA-3": [wl("BETA-3", "J1", "2026-10-04", 6, "w8")],
  "INT-1": [wl("INT-1", "J2", "2026-10-02", 2, "w9")],
};

const projects = [A, B, I, OLD].map((p, i) => ({ id: String(100 + i), key: p.key, name: p.name, projectTypeKey: "software", archived: false }));
const fields = [
  { id: "customfield_10020", name: "Sprint", custom: true, schema: { type: "array", custom: "com.pyxis.greenhopper.jira:gh-sprint" } },
  { id: "customfield_10016", name: "Story point estimate", custom: true, schema: { type: "number" } },
  { id: "customfield_10014", name: "Epic Link", custom: true, schema: { type: "any", custom: "com.pyxis.greenhopper.jira:gh-epic-link" } },
  { id: "summary", name: "Summary", custom: false },
];

for (const [name, data] of Object.entries({ projects, fields, issues, comments, worklogs })) writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data, null, 2) + "\n");
console.log("fixtures written to", dir);
