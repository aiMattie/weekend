/**
 * Demo content for the Development workspace (flag `demo` of createDevWorkspaceTemplate): three sprints
 * (one completed with carry-over, one active, one planned), a backlog, epics, bugs and a retrospective.
 * Built through the real services; history timestamps are then spread over the sprint days so the
 * burndown and velocity charts show something meaningful.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { Actor } from "../../lib/actor";
import { db } from "../../db/client";
import { items, users } from "../../db/schema/core";
import { sprintItems, sprints } from "../../db/schema/sprints";
import { nowIso } from "../../lib/time";
import { ensureDropdownLabel, findPhasesBoard, type DevTemplateResult } from "./dev-template";
import * as itemsSvc from "./items";
import * as retros from "./retros";
import * as sprintsSvc from "./sprints";
import { addDays, dayOf, isWeekday } from "./sprint-metrics";
import * as timeEntries from "./time-entries";

interface T { name: string; klant: string; type: "Feature" | "Bug" | "Chore" | "Onderzoek"; prio: string; est: number; epic: number; owner: string; jira?: string }
const EPICS = ["Delta - Fase 1: MVP", "LMS - Doorontwikkeling", "Charlie - Portaal"];
const KLANT_OF_EPIC = ["Delta", "LMS", "Charlie"];

const S20: T[] = [
  { name: "Inlogscherm bouwen", klant: "Delta", type: "Feature", prio: "P1", est: 8, epic: 0, owner: "dev1", jira: "MIC-101" },
  { name: "Rollen en rechten model", klant: "Delta", type: "Feature", prio: "P2", est: 13, epic: 0, owner: "dev2", jira: "MIC-102" },
  { name: "Importjob voor leerlingen", klant: "LMS", type: "Chore", prio: "P2", est: 5, epic: 1, owner: "dev1", jira: "LMS-55" },
  { name: "Onderzoek SSO met Azure AD", klant: "Charlie", type: "Onderzoek", prio: "P3", est: 3, epic: 2, owner: "dev2", jira: "NSE-12" },
  { name: "Dashboard grafieken", klant: "LMS", type: "Feature", prio: "P2", est: 8, epic: 1, owner: "dev1", jira: "LMS-57" },
  { name: "Mailnotificaties", klant: "Delta", type: "Feature", prio: "P3", est: 5, epic: 0, owner: "dev2", jira: "MIC-110" },
];
const S21_NEW: T[] = [
  { name: "Rapportage export naar Excel", klant: "LMS", type: "Feature", prio: "P2", est: 5, epic: 1, owner: "dev1", jira: "LMS-60" },
  { name: "Koppeling betaalprovider", klant: "Delta", type: "Feature", prio: "P1", est: 13, epic: 0, owner: "dev2", jira: "MIC-120" },
  { name: "Portaal startpagina", klant: "Charlie", type: "Feature", prio: "P2", est: 8, epic: 2, owner: "develop", jira: "NSE-20" },
  { name: "Logging opschonen", klant: "LMS", type: "Chore", prio: "P4", est: 2, epic: 1, owner: "develop" },
  { name: "Wachtwoord reset flow", klant: "Delta", type: "Feature", prio: "P2", est: 3, epic: 0, owner: "dev1", jira: "MIC-125" },
  { name: "Testomgeving Charlie uitrollen", klant: "Charlie", type: "Chore", prio: "P3", est: 3, epic: 2, owner: "dev2" },
];
const S22: T[] = [
  { name: "Gebruikersbeheer scherm", klant: "Delta", type: "Feature", prio: "P2", est: 8, epic: 0, owner: "dev1" },
  { name: "Audit log", klant: "Charlie", type: "Feature", prio: "P3", est: 5, epic: 2, owner: "dev2" },
  { name: "Performance onderzoek zoeken", klant: "LMS", type: "Onderzoek", prio: "P3", est: 3, epic: 1, owner: "develop" },
];
const BACKLOG: T[] = [
  { name: "Meertalige interface", klant: "LMS", type: "Feature", prio: "P3", est: 13, epic: 1, owner: "dev1" },
  { name: "Dark mode", klant: "Delta", type: "Feature", prio: "P4", est: 5, epic: 0, owner: "dev2" },
  { name: "API rate limiting", klant: "Charlie", type: "Chore", prio: "P3", est: 3, epic: 2, owner: "develop" },
  { name: "Mobiele weergave controleren", klant: "Delta", type: "Onderzoek", prio: "P4", est: 2, epic: 0, owner: "dev1" },
  { name: "Back-up strategie", klant: "Charlie", type: "Chore", prio: "P2", est: 3, epic: 2, owner: "dev2" },
];

export function seedDevDemo(sys: Actor, ids: DevTemplateResult): void {
  const { sprints: sprintsId, taken, epics, bugs, retrospectives } = ids.boards;
  if (db.select().from(sprints).where(eq(sprints.boardId, sprintsId)).get()) return; // already has sprints: leave alone
  const uid = (k: string): string | undefined => db.select({ id: users.id }).from(users).where(eq(users.email, `${k}@example.com`)).get()?.id;
  for (const k of KLANT_OF_EPIC) { ensureDropdownLabel(sys, taken, "klant", k); ensureDropdownLabel(sys, bugs, "klant", k); ensureDropdownLabel(sys, epics, "klant", k); }

  const epicIds = EPICS.map((name, i) => itemsSvc.create(sys, { boardId: epics, name, values: { status: i === 2 ? "Gepland" : "Actief", klant: KLANT_OF_EPIC[i], eigenaar: [uid("pm2") ?? uid("admin")].filter(Boolean) } }).id);
  // link the epics to the matching phases of Projecten & Fases (when that board exists)
  const phases = findPhasesBoard(sys.accountId);
  if (phases) {
    const names = ["Delta - Fase 1: MVP", "LMS - Doorontwikkeling", "Charlie - Security audit"];
    names.forEach((n, i) => {
      const ph = db.select({ id: items.id }).from(items).where(and(eq(items.boardId, phases), eq(items.name, n))).get();
      if (ph) itemsSvc.changeColumnValue(sys, epicIds[i], "fase", { linkedPulseIds: [{ linkedPulseId: ph.id }] });
    });
  }
  const epicRel = (i: number) => ({ linkedPulseIds: [{ linkedPulseId: epicIds[i] }] });
  const mk = (board: string, t: T, status: string) => itemsSvc.create(sys, {
    boardId: board, name: t.name,
    values: { status, type: t.type, prioriteit: t.prio, schatting: t.est, klant: t.klant, epic: epicRel(t.epic), eigenaar: [uid(t.owner)].filter(Boolean), ...(t.jira ? { jira_key: t.jira } : {}) },
  }).id;

  const today = dayOf(nowIso());
  let monday = today;
  while (new Date(`${monday}T12:00:00Z`).getUTCDay() !== 1) monday = addDays(monday, -1);
  const s21Start = addDays(monday, -7);
  const s20Start = addDays(s21Start, -14);
  const mkSprint = (name: string, startsOn: string) => sprintsSvc.createSprint(sys, { boardId: sprintsId, name, startsOn, endsOn: addDays(startsOn, 11) });
  const sp20 = mkSprint("Sprint 20", s20Start);
  const sp21 = mkSprint("Sprint 21", s21Start);
  const sp22 = mkSprint("Sprint 22", addDays(s21Start, 14));

  // sprint 20: planned, started, worked, completed (unfinished work moves to sprint 21)
  const s20 = S20.map((t) => mk(taken, t, "Ready"));
  s20.forEach((id) => sprintsSvc.assignItem(sys, id, sp20.id));
  sprintsSvc.startSprint(sys, sp20.id);
  s20.forEach((id, i) => itemsSvc.changeColumnValue(sys, id, "status", i < 4 ? "Done" : i === 4 ? "In progress" : "Review"));
  sprintsSvc.completeSprint(sys, sp20.id, { carryOver: "next", nextSprintId: sp21.id });

  // sprint 21: carried work + new work, started last week
  const s21 = S21_NEW.map((t) => mk(taken, t, "Ready"));
  s21.forEach((id) => sprintsSvc.assignItem(sys, id, sp21.id));
  sprintsSvc.startSprint(sys, sp21.id);
  const st21 = ["Done", "In progress", "Done", "Review", "Wacht op klant", "Ready"];
  s21.forEach((id, i) => itemsSvc.changeColumnValue(sys, id, "status", st21[i]));
  itemsSvc.changeColumnValue(sys, s20[5], "status", "Done");
  const late = mk(taken, { name: "Hotfix certificaat verlopen", klant: "LMS", type: "Chore", prio: "P1", est: 2, epic: 1, owner: "dev1", jira: "LMS-61" }, "In progress");
  sprintsSvc.assignItem(sys, late, sp21.id);

  // sprint 22 (planned) and the backlog
  S22.forEach((t) => sprintsSvc.assignItem(sys, mk(taken, t, "Ready"), sp22.id));
  BACKLOG.forEach((t) => mk(taken, t, "Backlog"));

  // bugs
  const bug = (name: string, klant: string, prio: string, status: string, ownerKey: string) => itemsSvc.create(sys, { boardId: bugs, name, values: { status, type: "Bug", prioriteit: prio, klant, eigenaar: [uid(ownerKey)].filter(Boolean), schatting: 2 } }).id;
  const b1 = bug("Foutmelding bij uploaden PDF", "Delta", "P1", "In progress", "dev1");
  const b2 = bug("Datumfilter toont verkeerde maand", "LMS", "P2", "In progress", "dev2");
  bug("Logo verspringt op mobiel", "Charlie", "P4", "Backlog", "develop");
  sprintsSvc.assignItem(sys, b1, sp21.id);
  itemsSvc.changeColumnValue(sys, b1, "status", "Done");
  itemsSvc.changeColumnValue(sys, b2, "status", "Done");
  db.update(items).set({ createdAt: `${addDays(today, -6)}T09:00:00.000Z` }).where(eq(items.id, b1)).run();
  db.update(items).set({ createdAt: `${addDays(today, -3)}T09:00:00.000Z` }).where(eq(items.id, b2)).run();
  itemsSvc.changeMultipleColumnValues(sys, b1, { opgelost_op: { date: addDays(today, -1) }, oplostijd: 5.2 });
  itemsSvc.changeMultipleColumnValues(sys, b2, { opgelost_op: { date: today }, oplostijd: 3.1 });

  // retrospective of sprint 20
  const cards: [string, string, string][] = [
    ["Keep", "Dagelijkse standup blijft kort", "dev1"], ["Keep", "Pairen op lastige tickets", "dev2"],
    ["Improve", "Schattingen waren te optimistisch", "dev2"], ["Improve", "Reviews blijven te lang liggen", "dev1"],
    ["Discussion", "Hoe gaan we om met meerwerk tijdens de sprint?", "develop"],
  ];
  const voters = ["dev1", "dev2", "develop", "admin"].map(uid).filter((x): x is string => !!x);
  cards.forEach(([kind, text, k], i) => {
    const c = retros.addCard({ ...sys, id: uid(k) ?? sys.id, isSystem: true }, retrospectives, { kind, text, sprintId: sp20.id });
    for (let v = 0; v < (i % 3) + 1 && v < voters.length; v++) retros.vote({ id: voters[v], accountId: sys.accountId, role: "admin", source: "system" }, c.id);
  });

  // some worklog
  const w = uid("dev1");
  if (w) { timeEntries.create(sys, { itemId: s21[0], userId: w, date: addDays(today, -1), minutes: 180, description: "Export bouwen" }); timeEntries.create(sys, { itemId: s21[0], userId: w, date: today, minutes: 90, description: "Review verwerken" }); }

  backdate(sp20.id, sp21.id, s20Start, s21Start, today);
}

/** Spread the (all "now") history timestamps over the sprint days. */
function backdate(id20: string, id21: string, s20: string, s21: string, today: string): void {
  const workdays = (from: string, to: string) => { const out: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) if (isWeekday(d)) out.push(d); return out; };
  const at = (d: string, h: number) => `${d}T${String(h).padStart(2, "0")}:00:00.000Z`;
  const w20 = workdays(s20, addDays(s20, 11));
  const w21 = workdays(s21, today < addDays(s21, 11) ? today : addDays(s21, 11));
  const fix = (sprintId: string, days: string[], start: string, completedOn: string | null) => {
    const rows = db.select().from(sprintItems).where(eq(sprintItems.sprintId, sprintId)).all();
    rows.forEach((r, i) => {
      const patch: Partial<typeof sprintItems.$inferInsert> = { addedAt: at(start, 7) };
      if (r.startedAt) patch.startedAt = at(days[Math.min(days.length - 1, i % 3)], 9);
      if (r.doneAt) patch.doneAt = at(days[Math.min(days.length - 1, 1 + ((i * 2) % Math.max(1, days.length - 1)))], 14);
      if (r.outcome === "carried" && completedOn) patch.removedAt = at(completedOn, 16);
      db.update(sprintItems).set(patch).where(eq(sprintItems.id, r.id)).run();
    });
  };
  fix(id20, w20, s20, addDays(s20, 11));
  fix(id21, w21, s21, null);
  // one item added after the start of sprint 21 (scope creep)
  const extra = db.select().from(sprintItems).where(and(eq(sprintItems.sprintId, id21), isNull(sprintItems.removedAt))).all().pop();
  if (extra) db.update(sprintItems).set({ addedAfterStart: true, addedAt: at(w21[Math.min(2, w21.length - 1)], 11) }).where(eq(sprintItems.id, extra.id)).run();
  db.update(sprints).set({ startedAt: at(s20, 7), completedAt: at(addDays(s20, 11), 16) }).where(eq(sprints.id, id20)).run();
  db.update(sprints).set({ startedAt: at(s21, 7) }).where(eq(sprints.id, id21)).run();
}
