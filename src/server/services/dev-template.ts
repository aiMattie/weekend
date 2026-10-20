/**
 * Development workspace template: boards Sprints, Taken (backlog), Epics, Bugs and
 * Retrospectives with their statuses and fields, plus the dev views
 * (planning, active sprint, dashboard, roadmap, bugs, retro). Idempotent: everything is looked up by name.
 */
import { and, eq } from "drizzle-orm";
import { systemActor, type Actor } from "../../lib/actor";
import { db } from "../../db/client";
import { boards, columns as columnsTable, workspaces, views as viewsTable } from "../../db/schema/core";
import * as boardsSvc from "./boards";
import * as columnsSvc from "./columns";
import * as groupsSvc from "./groups";
import * as viewsSvc from "./views";
import * as workspacesSvc from "./workspaces";
import { setDevSettings } from "./dev-config";
import { seedDevDemo } from "./dev-demo";

export interface DevTemplateResult {
  workspaceId: string;
  boards: { sprints: string; taken: string; epics: string; bugs: string; retrospectives: string };
}

const s = (id: number, text: string, color: string, isDone = false) => ({ id, text, color, index: id, isDone });
export const TASK_STATUSES = [
  s(0, "Backlog", "#c4c4c4"), s(1, "Ready", "#579bfc"), s(2, "In progress", "#fdab3d"), s(3, "Review", "#a25ddc"),
  s(4, "Wacht op klant", "#66ccff"), s(5, "Done", "#00c875", true), s(6, "Blocked", "#df2f4a"),
];
export const PRIORITIES = [s(0, "P1", "#df2f4a"), s(1, "P2", "#fdab3d"), s(2, "P3", "#579bfc"), s(3, "P4", "#c4c4c4")];
const SPRINT_STATUSES = [s(0, "Gepland", "#579bfc"), s(1, "Actief", "#fdab3d"), s(2, "Afgerond", "#00c875", true)];
const EPIC_STATUSES = [s(0, "Gepland", "#579bfc"), s(1, "Actief", "#fdab3d"), s(2, "Afgerond", "#00c875", true), s(3, "Geparkeerd", "#c4c4c4")];
const RETRO_KINDS = [s(0, "Keep", "#00c875"), s(1, "Improve", "#fdab3d"), s(2, "Discussion", "#579bfc")];
const dropdown = (...texts: string[]) => ({ labels: texts.map((text, i) => ({ id: i + 1, text })) });

interface ColDef { title: string; type: string; key: string; settings?: Record<string, unknown> }

function findBoard(workspaceId: string, name: string) {
  return db.select().from(boards).where(and(eq(boards.workspaceId, workspaceId), eq(boards.name, name), eq(boards.state, "active"))).get();
}

function ensureBoard(sys: Actor, workspaceId: string, name: string, description: string, kind: "board" | "dev_sprints", groupTitle: string, groupColor: string): string {
  const existing = findBoard(workspaceId, name);
  if (existing) return existing.id;
  const b = boardsSvc.create(sys, { workspaceId, name, description, kind, emptyColumns: true });
  const [g] = groupsSvc.list(sys, b.id);
  groupsSvc.update(sys, g.id, { title: groupTitle, color: groupColor });
  return b.id;
}

function ensureColumns(sys: Actor, boardId: string, defs: ColDef[]): void {
  for (const d of defs) {
    const cur = db.select().from(columnsTable).where(and(eq(columnsTable.boardId, boardId), eq(columnsTable.key, d.key))).get();
    if (!cur) columnsSvc.create(sys, boardId, d);
  }
}

function ensureView(sys: Actor, boardId: string, name: string, type: string): void {
  if (!db.select().from(viewsTable).where(and(eq(viewsTable.boardId, boardId), eq(viewsTable.type, type))).get()) viewsSvc.create(sys, boardId, { name, type });
}

/** Add a dropdown label (e.g. a new Klant) so items can use it. No-op when it exists. Returns the label id. */
export function ensureDropdownLabel(actor: Actor, boardId: string, columnKey: string, text: string): number {
  const col = db.select().from(columnsTable).where(and(eq(columnsTable.boardId, boardId), eq(columnsTable.key, columnKey))).get();
  if (!col) throw new Error(`Column ${columnKey} not found`);
  const labels = (col.settings.labels as { id: number; text: string }[] | undefined) ?? [];
  const hit = labels.find((l) => l.text.toLowerCase() === text.toLowerCase());
  if (hit) return hit.id;
  const id = labels.reduce((m, l) => Math.max(m, l.id), 0) + 1;
  columnsSvc.update(actor, col.id, { settings: { labels: [...labels, { id, text }] } });
  return id;
}

export const findPhasesBoard = (accountId: string): string | null => {
  const rows = db.select({ id: boards.id, name: boards.name }).from(boards).innerJoin(workspaces, eq(workspaces.id, boards.workspaceId))
    .where(and(eq(workspaces.accountId, accountId), eq(boards.state, "active"))).all();
  return rows.find((r) => r.name === "Projecten & Fases")?.id ?? null;
};

export function createDevWorkspaceTemplate(accountId: string, opts: { workspaceName?: string; demo?: boolean } = {}): DevTemplateResult {
  const sys = systemActor(accountId, "system");
  const wsName = opts.workspaceName ?? "Development";
  const ws = db.select().from(workspaces).where(and(eq(workspaces.accountId, accountId), eq(workspaces.name, wsName), eq(workspaces.state, "active"))).get()
    ?? workspacesSvc.create(sys, { name: wsName, color: "#a25ddc", kind: "open" });

  const sprintsId = ensureBoard(sys, ws.id, "Sprints", "Sprints van het hele team. Eén sprintbord voor alle klanten.", "dev_sprints", "Sprints", "#a25ddc");
  const takenId = ensureBoard(sys, ws.id, "Taken", "Backlog en taken van alle klanten. Elke taak heeft Klant, Epic en Sprint.", "board", "Taken", "#579bfc");
  const epicsId = ensureBoard(sys, ws.id, "Epics", "Epics gekoppeld aan de fase uit Projecten & Fases.", "board", "Epics", "#fdab3d");
  const bugsId = ensureBoard(sys, ws.id, "Bugs", "Bugs met tijd tot oplossing.", "board", "Bugs", "#df2f4a");
  const retroId = ensureBoard(sys, ws.id, "Retrospectives", "Keep, Improve en Discussion per sprint, met stemmen.", "board", "Retrospective", "#00c875");

  const taskCols = (epicSettings: Record<string, unknown>): ColDef[] => [
    { title: "Status", type: "status", key: "status", settings: { labels: TASK_STATUSES } },
    { title: "Type", type: "dropdown", key: "type", settings: { ...dropdown("Feature", "Bug", "Chore", "Onderzoek"), allowMultiple: false } },
    { title: "Prioriteit", type: "status", key: "prioriteit", settings: { labels: PRIORITIES } },
    { title: "Schatting", type: "numbers", key: "schatting", settings: { unit: "u", unitPosition: "right" } },
    { title: "Klant", type: "dropdown", key: "klant", settings: { labels: [], allowMultiple: false } },
    { title: "Epic", type: "board_relation", key: "epic", settings: epicSettings },
    { title: "Sprint", type: "sprint", key: "sprint" },
    { title: "Eigenaar", type: "people", key: "eigenaar" },
    { title: "Jira key", type: "text", key: "jira_key" },
    { title: "Herkomst", type: "dropdown", key: "herkomst", settings: { ...dropdown("Klantmeeting", "Testfase", "Meerwerk"), allowMultiple: false } },
  ];
  const epicRel = { boardIds: [epicsId], allowMultiple: false };

  ensureColumns(sys, sprintsId, [
    { title: "Status", type: "status", key: "status", settings: { labels: SPRINT_STATUSES } },
    { title: "Tijdlijn", type: "timeline", key: "tijdlijn" },
    { title: "Doel", type: "long_text", key: "doel" },
  ]);
  ensureColumns(sys, takenId, taskCols(epicRel));
  ensureColumns(sys, bugsId, [
    ...taskCols(epicRel),
    { title: "Opgelost op", type: "date", key: "opgelost_op" },
    { title: "Tijd tot oplossing (dagen)", type: "numbers", key: "oplostijd", settings: { unit: "d", decimals: 1 } },
  ]);
  const phasesId = findPhasesBoard(accountId);
  ensureColumns(sys, epicsId, [
    { title: "Status", type: "status", key: "status", settings: { labels: EPIC_STATUSES } },
    { title: "Fase", type: "board_relation", key: "fase", settings: { boardIds: phasesId ? [phasesId] : [], allowMultiple: false } },
    { title: "Klant", type: "dropdown", key: "klant", settings: { labels: [], allowMultiple: false } },
    { title: "Eigenaar", type: "people", key: "eigenaar" },
    { title: "Tijdlijn", type: "timeline", key: "tijdlijn" },
  ]);
  ensureColumns(sys, retroId, [
    { title: "Categorie", type: "status", key: "categorie", settings: { labels: RETRO_KINDS } },
    { title: "Stemmen", type: "numbers", key: "stemmen" },
  ]);
  // the Epics -> Fase link is created before Projecten & Fases may exist: repair it on a later run
  if (phasesId) {
    const fase = db.select().from(columnsTable).where(and(eq(columnsTable.boardId, epicsId), eq(columnsTable.key, "fase"))).get();
    if (fase && !((fase.settings.boardIds as string[] | undefined) ?? []).includes(phasesId)) columnsSvc.update(sys, fase.id, { settings: { boardIds: [phasesId] } });
  }

  setDevSettings(sprintsId, { role: "sprints", sourceBoardIds: [takenId, bugsId], tasksBoardId: takenId, bugsBoardId: bugsId, epicsBoardId: epicsId, retroBoardId: retroId, estimateUnit: "hours" });
  setDevSettings(takenId, { role: "tasks", sprintsBoardId: sprintsId, epicsBoardId: epicsId, estimateUnit: "hours" });
  setDevSettings(bugsId, { role: "bugs", sprintsBoardId: sprintsId, epicsBoardId: epicsId, estimateUnit: "hours" });
  setDevSettings(epicsId, { role: "epics", sprintsBoardId: sprintsId });
  setDevSettings(retroId, { role: "retros", sprintsBoardId: sprintsId });

  ensureView(sys, sprintsId, "Planning", "dev_planning");
  ensureView(sys, sprintsId, "Actieve sprint", "dev_sprint_board");
  ensureView(sys, sprintsId, "Dashboard", "dev_dashboard");
  ensureView(sys, takenId, "Backlog", "dev_planning");
  ensureView(sys, epicsId, "Roadmap", "dev_roadmap");
  ensureView(sys, bugsId, "Bug overzicht", "dev_bugs");
  ensureView(sys, retroId, "Retrospective", "dev_retro");

  const order = (boardId: string, types: string[]) => {
    const rows = db.select().from(viewsTable).where(eq(viewsTable.boardId, boardId)).all();
    const rank = (t: string) => { const i = types.indexOf(t); return i < 0 ? 999 : i; };
    rows.sort((a, b) => rank(a.type) - rank(b.type) || a.position - b.position).forEach((v, i) => db.update(viewsTable).set({ position: (i + 1) * 1000 }).where(eq(viewsTable.id, v.id)).run());
  };
  order(sprintsId, ["dev_planning", "dev_sprint_board", "dev_dashboard", "table"]);
  order(epicsId, ["dev_roadmap", "table"]);
  order(bugsId, ["dev_bugs", "table"]);
  order(retroId, ["dev_retro", "table"]);

  const result: DevTemplateResult = { workspaceId: ws.id, boards: { sprints: sprintsId, taken: takenId, epics: epicsId, bugs: bugsId, retrospectives: retroId } };
  if (opts.demo) seedDevDemo(sys, result);
  return result;
}
