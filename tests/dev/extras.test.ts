import { beforeEach, describe, expect, it } from "vitest";
import { createDevWorkspaceTemplate } from "../../src/server/services/dev-template";
import * as bugs from "../../src/server/services/bugs";
import * as devGit from "../../src/server/services/dev-git";
import * as itemsSvc from "../../src/server/services/items";
import * as retros from "../../src/server/services/retros";
import * as sprintsSvc from "../../src/server/services/sprints";
import * as timeEntries from "../../src/server/services/time-entries";
import * as epics from "../../src/server/services/epics";
import { freshCtx, type Ctx } from "../helpers";
import { devSetup } from "./helpers";

let ctx: Ctx;
beforeEach(async () => { ctx = await freshCtx(); });

describe("retrospectives", () => {
  it("cards are grouped per sprint and each user votes once (toggle)", () => {
    const { t, sprint } = devSetup(ctx);
    const s = sprint("Sprint 1");
    const card = retros.addCard(ctx.member, t.boards.retrospectives, { kind: "Improve", text: "Kortere reviews", sprintId: s.id });
    retros.addCard(ctx.member, t.boards.retrospectives, { kind: "Keep", text: "Standup", sprintId: s.id });
    expect(card.sprint).toBe("Sprint 1");
    expect(retros.vote(ctx.member, card.id)).toEqual({ votes: 1, voted: true });
    expect(retros.vote(ctx.admin, card.id)).toEqual({ votes: 2, voted: true });
    expect(retros.vote(ctx.member, card.id)).toEqual({ votes: 1, voted: false });
    const data = retros.list(ctx.admin, t.boards.retrospectives);
    expect(data.cards.find((c) => c.id === card.id)).toMatchObject({ votes: 1, voted: true, kind: "Improve" });
    expect(data.groups.map((g) => g.title)).toContain("Sprint 1");
  });
  it("viewers cannot add cards", () => {
    const { t, sprint } = devSetup(ctx);
    const s = sprint("Sprint 1");
    expect(() => retros.addCard(ctx.viewer, t.boards.retrospectives, { kind: "Keep", text: "x", sprintId: s.id })).toThrow();
  });
});

describe("time entries", () => {
  it("logs hours per item, totals them and only lets owners delete", () => {
    const { mkTask } = devSetup(ctx);
    const id = mkTask("Werk");
    const e1 = timeEntries.create(ctx.member, { itemId: id, hours: 1.5, description: "bouwen" });
    timeEntries.create(ctx.admin, { itemId: id, minutes: 30, billable: false });
    const l = timeEntries.list(ctx.admin, id);
    expect(l.totalMinutes).toBe(120);
    expect(l.billableMinutes).toBe(90);
    expect(l.entries[0].userName).toBeTruthy();
    expect(() => timeEntries.remove(ctx.viewer, e1.id)).toThrow();
    timeEntries.remove(ctx.member, e1.id);
    expect(timeEntries.list(ctx.admin, id).totalMinutes).toBe(30);
    expect(() => timeEntries.create(ctx.member, { itemId: id })).toThrow(/uren/);
    expect(timeEntries.listUnsynced(ctx.admin)).toHaveLength(1);
  });
});

describe("bugs", () => {
  it("fills time to resolution when a bug is done and clears it when reopened", () => {
    const t = createDevWorkspaceTemplate(ctx.accountId);
    const bug = itemsSvc.create(ctx.sys, { boardId: t.boards.bugs, name: "Crash", values: { status: "Ready", prioriteit: "P1" } }).id;
    itemsSvc.changeColumnValue(ctx.sys, bug, "status", "Done");
    let s = bugs.stats(ctx.admin, t.boards.bugs);
    expect(s).toMatchObject({ open: 0, resolved: 1 });
    expect(s.bugs[0].resolvedOn).toBeTruthy();
    expect(s.bugs[0].days).not.toBeNull();
    itemsSvc.changeColumnValue(ctx.sys, bug, "status", "In progress");
    s = bugs.stats(ctx.admin, t.boards.bugs);
    expect(s).toMatchObject({ open: 1, resolved: 0, averageDays: null });
  });
});

describe("epics roadmap", () => {
  it("shows progress of the tasks linked to an epic", () => {
    const { t, mkTask } = devSetup(ctx);
    const epic = itemsSvc.create(ctx.sys, { boardId: t.boards.epics, name: "Epic A" }).id;
    const rel = { linkedPulseIds: [{ linkedPulseId: epic }] };
    mkTask("een", 3, "Done", { epic: rel });
    mkTask("twee", 3, "Ready", { epic: rel });
    mkTask("drie", 3, "Ready");
    const r = epics.roadmap(ctx.admin, t.boards.epics);
    expect(r.epics[0]).toMatchObject({ name: "Epic A", percent: 50, tasks: { total: 2, done: 1, points: 6, donePoints: 3 } });
  });
});

describe("standup + summary + metadata", () => {
  it("generates the standup text and the summary of an active sprint", () => {
    const { t, sprint, mkTask } = devSetup(ctx);
    const s = sprint("Sprint 1");
    const a = mkTask("Login bouwen", 5, "Ready", { eigenaar: [ctx.userIds.dev1] });
    const b = mkTask("Wachten op toegang", 3, "Ready", { eigenaar: [ctx.userIds.dev2] });
    sprintsSvc.assignItem(ctx.sys, a, s.id);
    sprintsSvc.assignItem(ctx.sys, b, s.id);
    sprintsSvc.startSprint(ctx.sys, s.id);
    itemsSvc.changeColumnValue(ctx.sys, a, "status", "In progress");
    itemsSvc.changeColumnValue(ctx.sys, b, "status", "Wacht op klant");
    const st = sprintsSvc.standup(ctx.admin, t.boards.sprints);
    expect(st.text).toContain("Login bouwen");
    expect(st.text).toContain("Wachten op toegang (Wacht op klant)");
    expect(st.people.map((p) => p.name)).toEqual(["Builder", "Reviewer"]);
    const sum = sprintsSvc.summary(ctx.admin, s.id);
    expect(sum.totals).toMatchObject({ count: 2, points: 8, doneCount: 0 });
    expect(sum.byStatus.map((x) => x.status).sort()).toEqual(["In progress", "Wacht op klant"]);
    expect(sum.text).toContain("Nog open");
    const meta = sprintsSvc.sprintsMetadata(ctx.admin, t.boards.sprints);
    expect(meta.activeSprintId).toBe(s.id);
    expect(meta.sprints[0]).toMatchObject({ taskCount: 2, totalPoints: 8 });
    expect(sprintsSvc.listSprintBoards(ctx.admin).map((b) => b.id)).toEqual([t.boards.sprints]);
  });
});

describe("git webhooks", () => {
  const setup = () => {
    const { mkTask, t } = devSetup(ctx);
    const id = mkTask("Login bouwen", 3, "Ready", { jira_key: "LMS-123" });
    const gh = devGit.createIntegration(ctx.admin, { provider: "github" });
    const call = (provider: "github" | "bitbucket", secret: string, event: string, payload: unknown, sig?: string) => {
      const rawBody = JSON.stringify(payload);
      const headers: Record<string, string> = { [provider === "github" ? "x-github-event" : "x-event-key"]: event, [provider === "github" ? "x-hub-signature-256" : "x-hub-signature"]: sig ?? devGit.signBody(secret, rawBody) };
      return devGit.handleWebhook({ provider, rawBody, header: (n) => headers[n.toLowerCase()] ?? null });
    };
    return { id, gh, call, t };
  };

  it("extracts Jira keys and item ids", () => {
    expect(devGit.extractKeys("fix LMS-123 and abc-9, see weekend-2000000417 or #2000000418")).toEqual({ jira: ["LMS-123", "ABC-9"], itemIds: ["2000000417", "2000000418"] });
  });

  it("links GitHub commits, branches and pull requests by Jira key and by item id; rejects bad signatures", () => {
    const { id, gh, call } = setup();
    const push = { ref: "refs/heads/feature/LMS-123-login", repository: { full_name: "example/lms", html_url: "https://github.com/example/lms" }, commits: [{ id: "abc1234def", message: "LMS-123 build login form\n\nmore", url: "https://github.com/example/lms/commit/abc1234def", author: { name: "Builder" } }, { id: "zzz", message: "unrelated" }] };
    expect(() => call("github", gh.secret, "push", push, "sha256=deadbeef")).toThrow(/signature/);
    expect(() => call("github", "other-secret", "push", push)).toThrow(/signature/);
    const r = call("github", gh.secret, "push", push);
    expect(r).toMatchObject({ ok: true, event: "push", linked: 3 }); // branch + both commits (the branch name carries the key)
    const pr = { action: "opened", pull_request: { number: 7, title: `Login (weekend-${id})`, body: "", state: "open", merged: false, html_url: "https://github.com/example/lms/pull/7", user: { login: "dev1" }, head: { ref: "dev1/login" } }, repository: { full_name: "example/lms" } };
    call("github", gh.secret, "pull_request", pr);
    call("github", gh.secret, "pull_request", { ...pr, action: "closed", pull_request: { ...pr.pull_request, state: "closed", merged: true } });
    const links = devGit.linksForItem(ctx.admin, id);
    expect(links.map((l) => l.kind).sort()).toEqual(["branch", "commit", "commit", "pull_request"]);
    expect(links.find((l) => l.kind === "commit" && l.externalId === "abc1234def")).toMatchObject({ title: "LMS-123 build login form", author: "Builder", externalId: "abc1234def" });
    expect(links.find((l) => l.kind === "pull_request")).toMatchObject({ state: "merged", externalId: "7" }); // updated, not duplicated
    // repeated delivery does not duplicate
    call("github", gh.secret, "push", push);
    expect(devGit.linksForItem(ctx.admin, id)).toHaveLength(4);
    expect(call("github", gh.secret, "ping", {})).toMatchObject({ event: "ping", linked: 0 });
  });

  it("links Bitbucket pushes and pull requests", () => {
    const { id, call } = setup();
    const bb = devGit.createIntegration(ctx.admin, { provider: "bitbucket" });
    const push = { repository: { full_name: "example/lms" }, push: { changes: [{ new: { type: "branch", name: "LMS-123-fix", links: { html: { href: "https://bitbucket.org/example/lms/branch/LMS-123-fix" } } }, commits: [{ hash: "9f8e7d6", message: "LMS-123 fix typo", links: { html: { href: "https://bitbucket.org/example/lms/commits/9f8e7d6" } }, author: { raw: "Reviewer <s@x.nl>" } }] }] } };
    expect(call("bitbucket", bb.secret, "repo:push", push).linked).toBe(2);
    call("bitbucket", bb.secret, "pullrequest:fulfilled", { repository: { full_name: "example/lms" }, pullrequest: { id: 3, title: "LMS-123 fix", description: "", state: "MERGED", links: { html: { href: "https://bitbucket.org/example/lms/pull-requests/3" } }, source: { branch: { name: "LMS-123-fix" } }, author: { display_name: "Reviewer" } } });
    const links = devGit.linksForItem(ctx.admin, id);
    expect(links.filter((l) => l.provider === "bitbucket")).toHaveLength(3);
    expect(links.find((l) => l.kind === "pull_request")?.state).toBe("merged");
  });

  it("only admins manage integrations and the secret is not listed", () => {
    const { gh } = setup();
    expect(() => devGit.createIntegration(ctx.member, { provider: "github" })).toThrow();
    expect(JSON.stringify(devGit.listIntegrations(ctx.admin))).not.toContain(gh.secret);
    const rotated = devGit.rotateSecret(ctx.admin, gh.id);
    expect(rotated.secret).not.toBe(gh.secret);
    devGit.removeIntegration(ctx.admin, gh.id);
    expect(devGit.listIntegrations(ctx.admin)).toHaveLength(0);
  });
});
