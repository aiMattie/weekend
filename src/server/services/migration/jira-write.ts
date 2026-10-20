/**
 * Phase B of the Jira migration (synchronous, one transaction in apply mode): epics, tasks, subtasks,
 * descriptions + comments as updates, attachments (metadata), sprints. Mapping per plan section 7.
 */
import { and, eq } from "drizzle-orm";
import type { Actor } from "../../../lib/actor";
import { db } from "../../../db/client";
import { assets, items, updates } from "../../../db/schema/core";
import { sprints as sprintsTable, type SprintState } from "../../../db/schema/sprints";
import { htmlToText, sanitizeHtml } from "../../../lib/sanitize";
import * as sprintsSvc from "../sprints";
import { recordPastSprints } from "../sprint-sync";
import { adfToHtml } from "./adf";
import { createItemRow, patchItemRow } from "./item-writer";
import { currentSprint, epicKeyOf, estimateOf, isEpic, isSubtask, mapPriority, mapStatus, mapType, periodOfSprint, periodState, sprintPeriod, sprintsOf, type FieldIds, type SprintCadence, type SprintPeriod } from "./jira-map";
import { ensureKlantItem, fasesOfKlant, pickFase, type JiraTargets, type UserMapper } from "./jira-targets";
import type { ProjectData } from "./jira-snapshot";
import type { JAttachment, JIssue, JSprint } from "./jira-types";
import { hashOf, type Tracker } from "./refs";
import { addDropdownLabel, keyOf } from "./template-kit";

export interface JiraEnv {
  actor: Actor; tracker: Tracker; targets: JiraTargets; users: UserMapper; fields: FieldIds;
  dist: { status: Record<string, number>; type: Record<string, number>; priority: Record<string, number> };
  /** epic key -> fase it belongs to (for hours) */
  epicFase: Map<string, { id: string; name: string }>;
  klantItem: Map<string, string>;
  sprintsSeen: Map<number, JSprint>;
  pendingFiles: { assetId: string; attachment: JAttachment }[];
  /** task key -> sprint it should be in */
  taskSprint: Map<string, number>;
  /** every Jira sprint a task has been in (its sprint history) */
  taskSprints: Map<string, number[]>;
  /** team sprint rhythm (monday dev); null = one sprint per Jira sprint */
  cadence: SprintCadence | null;
  /** YYYY-MM-DD, decides which team sprint is active */
  today: string;
}

const bump = (o: Record<string, number>, k: string) => { o[k] = (o[k] ?? 0) + 1; };
const EPIC_STATUS = (name: string, cat?: string) => (cat === "done" ? "Afgerond" : /progress|actief|active/i.test(name) || cat === "indeterminate" ? "Actief" : "Gepland");
const SUB_STATUS: Record<string, string | null> = { Done: "Done", Blocked: "Stuck", "In progress": "Working on it", Review: "Working on it" };

function klantFor(env: JiraEnv, pd: ProjectData): string | null {
  const kb = env.targets.delivery?.boards.klanten;
  const key = pd.project.key;
  const known = env.klantItem.get(key);
  if (known) return known;
  const id = env.tracker.upsert("klant", key, hashOf([key, pd.project.name]), `klant "${pd.project.name}" (project ${key})`, {
    adopt: () => (kb ? findKlant(kb, pd.project) : undefined),
    exists: (x) => !!db.select().from(items).where(eq(items.id, x)).get(),
    create: () => createKlant(env, kb!, pd),
    update: () => {},
  });
  env.klantItem.set(key, id);
  return id;
}

function findKlant(kb: string, project: { key: string; name: string }): string | undefined {
  // read-only lookup: ensureKlantItem would create, so mirror its matching rules
  const jiraCol = keyOf(kb, "jira_project");
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const rows = db.select().from(items).where(and(eq(items.boardId, kb), eq(items.state, "active"))).all().filter((i) => !i.parentItemId);
  return (jiraCol ? rows.find((i) => String(i.values[jiraCol.id] ?? "").toUpperCase() === project.key.toUpperCase()) : undefined)?.id
    ?? rows.find((i) => norm(i.name) === norm(project.name))?.id ?? rows.find((i) => norm(i.name) === norm(project.key))?.id;
}
function createKlant(env: JiraEnv, kb: string, pd: ProjectData): string {
  return ensureKlantItem(env.actor, kb, pd.project).id;
}

function userRaw(env: JiraEnv, u: JIssue["fields"]["assignee"]): string[] | null {
  const id = env.users.map(u);
  return id ? [id] : null;
}

export function migrateProject(env: JiraEnv, pd: ProjectData): void {
  const { tracker, targets } = env;
  const dev = targets.dev?.boards;
  const klantId = klantFor(env, pd);
  const klantName = pd.project.name;
  if (dev && tracker.apply) { addDropdownLabel(keyOf(dev.taken, "klant")!.id, klantName); addDropdownLabel(keyOf(dev.epics, "klant")!.id, klantName); }
  const fases = klantId && !tracker.isPlaceholder(klantId) && targets.delivery ? fasesOfKlant(targets.delivery.boards.fases, klantId) : [];
  if (!fases.length && pd.issues.some(isEpic)) tracker.note(`klant without fase in Projecten & Fases: epics are not linked to a fase and their hours get no fase`);

  const epicItem = new Map<string, string>();
  for (const e of pd.issues.filter(isEpic)) {
    const fase = pickFase(fases, e.fields.summary);
    if (fase) env.epicFase.set(e.key, fase);
    const cat = e.fields.status.statusCategory?.key;
    const raw = { status: EPIC_STATUS(e.fields.status.name, cat), klant: klantName, jira_key: e.key, eigenaar: userRaw(env, e.fields.assignee), fase: fase ? [fase.id] : null };
    const id = tracker.upsert("issue", e.key, hashOf([raw, e.fields.summary, e.fields.updated]), `epic ${e.key} ${e.fields.summary}`, {
      exists: (x) => !!db.select().from(items).where(eq(items.id, x)).get(),
      create: () => createItemRow(env.actor, { boardId: dev!.epics, name: e.fields.summary, raw, createdAt: e.fields.created, updatedAt: e.fields.updated, creatorId: env.users.map(e.fields.reporter) }).id,
      update: (x) => patchItemRow(x, { name: e.fields.summary, raw, updatedAt: e.fields.updated }),
    });
    epicItem.set(e.key, id);
    writeText(env, e, id, dev?.epics ?? "", pd);
  }

  const tasks = pd.issues.filter((i) => !isEpic(i) && !isSubtask(i));
  for (const t of tasks) {
    const status = mapStatus(t.fields.status.name, t.fields.status.statusCategory?.key);
    const type = mapType(t.fields.issuetype.name);
    const priority = mapPriority(t.fields.priority?.name);
    bump(env.dist.status, status); bump(env.dist.type, type); bump(env.dist.priority, priority);
    const ek = epicKeyOf(t, env.fields);
    const epicId = ek ? epicItem.get(ek) ?? tracker.lookup("issue", ek) : undefined;
    if (ek && !epicId) tracker.note("task whose epic is outside the migrated scope: not linked to an epic");
    const sp = sprintsOf(t, env.fields);
    for (const s of sp) env.sprintsSeen.set(s.id, s);
    const current = currentSprint(sp);
    if (current) env.taskSprint.set(t.key, current.id);
    if (sp.length) env.taskSprints.set(t.key, sp.map((s) => s.id));
    const raw = { status, type, prioriteit: priority, schatting: estimateOf(t, env.fields), klant: klantName, epic: epicId ? [epicId] : null, eigenaar: userRaw(env, t.fields.assignee), jira_key: t.key };
    const id = tracker.upsert("issue", t.key, hashOf([raw, t.fields.summary, t.fields.updated, current?.id]), `task ${t.key} ${t.fields.summary}`, {
      exists: (x) => !!db.select().from(items).where(eq(items.id, x)).get(),
      create: () => createItemRow(env.actor, { boardId: dev!.taken, name: t.fields.summary, raw, createdAt: t.fields.created, updatedAt: t.fields.updated, creatorId: env.users.map(t.fields.reporter) }).id,
      update: (x) => patchItemRow(x, { name: t.fields.summary, raw, updatedAt: t.fields.updated }),
    });
    writeText(env, t, id, dev?.taken ?? "", pd);
  }

  for (const s of pd.issues.filter(isSubtask)) {
    const parentKey = s.fields.parent?.key;
    const parentId = parentKey ? tracker.lookup("issue", parentKey) : undefined;
    if (!parentId) { tracker.note("subtask whose parent is outside the migrated scope: skipped"); continue; }
    const status = mapStatus(s.fields.status.name, s.fields.status.statusCategory?.key);
    const raw = { status: SUB_STATUS[status] ?? null, people: userRaw(env, s.fields.assignee), jira_key: s.key };
    tracker.upsert("issue", s.key, hashOf([raw, s.fields.summary, s.fields.updated]), `subtask ${s.key} ${s.fields.summary}`, {
      exists: (x) => !!db.select().from(items).where(eq(items.id, x)).get(),
      create: () => createItemRow(env.actor, { boardId: dev!.taken, parentItemId: parentId, name: s.fields.summary, raw, createdAt: s.fields.created, updatedAt: s.fields.updated, creatorId: env.users.map(s.fields.reporter) }).id,
      update: (x) => patchItemRow(x, { name: s.fields.summary, raw, updatedAt: s.fields.updated }),
    });
  }
}

/** Description + comments become updates (oldest first), attachments become asset rows (bytes follow in phase C). */
function writeText(env: JiraEnv, issue: JIssue, itemId: string, boardId: string, pd: ProjectData): void {
  const { tracker } = env;
  const put = (ext: string, html: string, authorId: string | null, authorName: string | undefined, created: string) => {
    const body = sanitizeHtml(authorId || !authorName ? html : `<p><em>Jira, ${authorName.replace(/[<>&]/g, "")}:</em></p>${html}`);
    const text = htmlToText(body);
    if (!text) return;
    // the author is part of the hash: once a Jira user gets an account, the update moves from "Jira, <name>:" to that user
    tracker.upsert("update", ext, hashOf([body, authorId]), `update ${ext}`, {
      exists: (x) => !!db.select().from(updates).where(eq(updates.id, x)).get(),
      create: () => db.insert(updates).values({ itemId, boardId, userId: authorId, body, bodyText: text, createdAt: created }).returning().get().id,
      update: (x) => { db.update(updates).set({ userId: authorId, body, bodyText: text }).where(eq(updates.id, x)).run(); },
    });
  };
  const desc = adfToHtml(issue.fields.description);
  if (desc) put(`${issue.key}:description`, `<p><strong>Beschrijving uit Jira</strong></p>${desc}`, env.users.map(issue.fields.reporter), issue.fields.reporter?.displayName, issue.fields.created);
  for (const c of pd.comments.get(issue.key) ?? []) put(`${issue.key}:c${c.id}`, adfToHtml(c.body), env.users.map(c.author), c.author?.displayName, c.created);
  for (const a of issue.fields.attachment ?? []) {
    const real = (id: string | null) => (id && !tracker.isPlaceholder(id) ? id : null);
    const aid = tracker.upsert("asset", a.id, hashOf([a.filename, a.size]), `attachment ${a.filename}`, {
      exists: (x) => !!db.select().from(assets).where(eq(assets.id, x)).get(),
      create: () => db.insert(assets).values({ boardId, itemId: real(itemId), name: a.filename, mimeType: a.mimeType ?? null, size: a.size ?? 0, path: "", uploadedBy: env.users.map(a.author) }).returning().get().id,
      update: () => {},
    });
    const row = tracker.isPlaceholder(aid) ? null : db.select().from(assets).where(eq(assets.id, aid)).get();
    if (!row || !row.path) env.pendingFiles.push({ assetId: aid, attachment: a });
    if (!tracker.isPlaceholder(aid) && !tracker.isPlaceholder(itemId)) attachToFileColumn(boardId, itemId, aid, a);
  }
}

function attachToFileColumn(boardId: string, itemId: string, assetId: string, a: JAttachment): void {
  const col = keyOf(boardId, "files");
  const row = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!col || !row) return;
  const cur = ((row.values[col.id] as { files?: { assetId?: string }[] } | undefined)?.files ?? []);
  if (cur.some((f) => f.assetId === assetId)) return;
  const files = [...cur, { assetId, name: a.filename, size: a.size ?? 0, ...(a.mimeType ? { mimeType: a.mimeType } : {}), isImage: /^image\//.test(a.mimeType ?? ""), fileType: "ASSET" }];
  db.update(items).set({ values: { ...row.values, [col.id]: { files } } }).where(eq(items.id, itemId)).run();
}

/* ------------------------------------------------------------------ sprints */

interface SprintPlan { type: string; ext: string; name: string; goal: string | null; startsOn?: string; endsOn?: string; want: SprintState; startedAt?: string; completedAt?: string }

/**
 * What the sprints board should hold. Without a cadence: one sprint per Jira sprint (state from Jira). With a
 * cadence (the monday dev way): one team sprint per period, every Jira sprint folded into the period of its start
 * date, state from the calendar; the current period always exists so there is exactly one active sprint.
 */
function planSprints(env: JiraEnv): { plans: SprintPlan[]; jiraToExt: Map<number, string> } {
  const jiraToExt = new Map<number, string>();
  const day = (d?: string) => (d ? d.slice(0, 10) : undefined);
  const seen = [...env.sprintsSeen.values()].sort((a, b) => (a.startDate ?? "9").localeCompare(b.startDate ?? "9") || a.id - b.id);
  const c = env.cadence;
  if (!c) {
    const want: Record<JSprint["state"], SprintState> = { closed: "completed", active: "active", future: "planned" };
    const plans = seen.map((s) => {
      jiraToExt.set(s.id, String(s.id));
      return { type: "sprint", ext: String(s.id), name: s.name, goal: s.goal ?? null, startsOn: day(s.startDate), endsOn: day(s.endDate), want: want[s.state], startedAt: s.startDate, completedAt: s.completeDate ?? s.endDate };
    });
    return { plans, jiraToExt };
  }
  const periods = new Map<string, SprintPeriod & { jira: string[] }>();
  const add = (p: SprintPeriod) => periods.get(p.from) ?? periods.set(p.from, { ...p, jira: [] }).get(p.from)!;
  add(sprintPeriod(env.today, c));
  for (const s of seen) {
    const p = add(periodOfSprint(s, c, env.today));
    p.jira.push(s.name);
    jiraToExt.set(s.id, p.from);
  }
  const plans = [...periods.values()].sort((a, b) => a.from.localeCompare(b.from)).map((p) => ({
    type: "sprint-period", ext: p.from, name: p.name, goal: p.jira.length ? `Jira: ${p.jira.join(", ")}` : null, startsOn: p.from, endsOn: p.to,
    want: periodState(p, env.today), startedAt: `${p.from}T00:00:00.000Z`, completedAt: `${p.to}T23:59:59.000Z`,
  }));
  return { plans, jiraToExt };
}

/** Create/update the sprints, put every task in its sprint, then move sprint states (complete before start). */
export function migrateSprints(env: JiraEnv): { total: number; assigned: number } {
  const { tracker, targets, actor } = env;
  const board = targets.dev?.boards.sprints;
  const { plans, jiraToExt } = planSprints(env);
  const row = (id: string) => db.select().from(sprintsTable).where(eq(sprintsTable.id, id)).get();
  const sprintId = new Map<string, string>();
  for (const p of plans) {
    const id = tracker.upsert(p.type, p.ext, hashOf([p.name, p.goal, p.want, p.startsOn, p.endsOn]), `sprint ${p.name} (${p.want})`, {
      exists: (x) => !!row(x),
      create: () => sprintsSvc.createSprint(actor, { boardId: board, name: p.name, goal: p.goal, startsOn: p.startsOn, endsOn: p.endsOn }).id,
      update: (x) => { if (row(x)?.state !== "completed") sprintsSvc.updateSprint(actor, x, { name: p.name, goal: p.goal, startsOn: p.startsOn, endsOn: p.endsOn }); },
    });
    sprintId.set(p.ext, id);
  }
  let assigned = 0;
  if (!tracker.apply || !board) return { total: plans.length, assigned };

  const taskCol = keyOf(targets.dev!.boards.taken, "sprint");
  for (const [key, jiraSprint] of env.taskSprint) {
    const itemId = tracker.lookup("issue", key);
    const ext = jiraToExt.get(jiraSprint);
    const sid = ext ? sprintId.get(ext) : undefined;
    if (!itemId || !sid || !taskCol) continue;
    const cur = db.select().from(items).where(eq(items.id, itemId)).get();
    if ((cur?.values[taskCol.id] as { sprintId?: string } | undefined)?.sprintId === sid) continue;
    if (row(sid)?.state === "completed") { tracker.note("task whose sprint is already completed here: left where it is"); continue; }
    sprintsSvc.assignItem(actor, itemId, sid);
    assigned++;
  }

  // completions first (one active sprint per board), then starts. Work Jira left open goes back to the backlog:
  // tasks Jira carried over already sit in their next sprint after the assignment pass above.
  for (const p of plans.filter((x) => x.want === "completed")) {
    const sid = sprintId.get(p.ext)!;
    const cur = row(sid);
    if (cur?.state === "planned") {
      db.update(sprintsTable).set({ state: "completed", startedAt: p.startedAt ?? cur.startedAt, completedAt: p.completedAt ?? new Date().toISOString() }).where(eq(sprintsTable.id, sid)).run();
      setSprintItemStatus(actor, cur.itemId, "Afgerond");
    } else if (cur?.state === "active") {
      sprintsSvc.completeSprint(actor, sid, { carryOver: "backlog" });
    }
  }
  // a period whose Jira sprints all moved on is no longer planned, but its team sprint still has to close
  if (env.cadence) {
    for (const cur of db.select().from(sprintsTable).where(and(eq(sprintsTable.boardId, board), eq(sprintsTable.state, "active"))).all()) {
      if (cur.endsOn && cur.endsOn < env.today) sprintsSvc.completeSprint(actor, cur.id, { carryOver: "backlog" });
    }
  }
  for (const p of plans.filter((x) => x.want === "active")) {
    const sid = sprintId.get(p.ext)!;
    if (row(sid)?.state !== "planned") continue;
    try { sprintsSvc.startSprint(actor, sid); } catch (e) { tracker.warn(`sprint ${p.name}: could not start (${(e as Error).message}); left planned`); }
  }
  // sprint history: the earlier (completed) sprints of every task, so carried-over work shows where it has been
  for (const [key, jiraSprints] of env.taskSprints) {
    const itemId = tracker.lookup("issue", key);
    if (!itemId || tracker.isPlaceholder(itemId)) continue;
    const ids = jiraSprints.map((j) => jiraToExt.get(j)).map((ext) => (ext ? sprintId.get(ext) : undefined)).filter((x): x is string => !!x);
    recordPastSprints(itemId, ids);
  }
  return { total: plans.length, assigned };
}

function setSprintItemStatus(actor: Actor, itemId: string | null, label: string): void {
  if (!itemId) return;
  const row = db.select().from(items).where(eq(items.id, itemId)).get();
  const col = row ? keyOf(row.boardId, "status") : undefined;
  const labels = (col?.settings.labels as { id: number; text: string }[] | undefined) ?? [];
  const hit = labels.find((l) => l.text === label);
  if (row && col && hit) db.update(items).set({ values: { ...row.values, [col.id]: { index: hit.id } } }).where(eq(items.id, row.id)).run();
  void actor;
}

