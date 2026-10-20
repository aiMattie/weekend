/**
 * Single-board versions of the dev (Taken/Sprints/Epics/Bugs/Retrospectives) and Delivery
 * (Klanten, Projecten & Fases, Urenregistratie) workspace boards, so they can be picked in the
 * "Add board" dialog. The full, wired-together workspaces come from services/templates.ts; these
 * are the standalone building blocks (connections between boards are added from the column menu).
 */
import { FASE_STATUS, GONOGO_STATUS, KLANTEN_STATUS, RISICO_STATUS } from "../../db/seed-data";
import { setDevSettings } from "../services/dev-config";
import { dropdownLabelsOf, registerBoardTemplate, statusLabelsOf } from "./registry";

const s = (id: number, text: string, color: string, isDone = false) => ({ id, text, color, index: id, isDone });
const TASK_STATUS = [s(0, "Backlog", "#c4c4c4"), s(1, "Ready", "#579bfc"), s(2, "In progress", "#fdab3d"), s(3, "Review", "#a25ddc"), s(4, "Wacht op klant", "#66ccff"), s(5, "Done", "#00c875", true), s(6, "Blocked", "#df2f4a")];
const PRIORITY = [s(0, "P1", "#df2f4a"), s(1, "P2", "#fdab3d"), s(2, "P3", "#579bfc"), s(3, "P4", "#c4c4c4")];
const hours = (key: string, title: string) => ({ title, type: "numbers", key, settings: { unit: "u", unitPosition: "right", decimals: 2 } });
const euro = (key: string, title: string) => ({ title, type: "numbers", key, settings: { unit: "€", unitPosition: "left", decimals: 2 } });

const taskColumns = () => [
  { title: "Status", type: "status", key: "status", settings: { labels: TASK_STATUS } },
  { title: "Type", type: "dropdown", key: "type", settings: { labels: dropdownLabelsOf(["Feature", "Bug", "Chore", "Onderzoek"]), allowMultiple: false } },
  { title: "Prioriteit", type: "status", key: "prioriteit", settings: { labels: PRIORITY } },
  { title: "Schatting", type: "numbers", key: "schatting", settings: { unit: "u", unitPosition: "right" } },
  { title: "Klant", type: "dropdown", key: "klant", settings: { labels: [], allowMultiple: false } },
  { title: "Sprint", type: "sprint", key: "sprint" },
  { title: "Eigenaar", type: "people", key: "eigenaar" },
];

registerBoardTemplate({
  id: "dev-tasks", name: "Taken (backlog)", category: "it", icon: "Bug",
  description: "Weekend dev: backlog en taken met status, type, prioriteit, schatting, klant en sprint.",
  groups: [{ title: "Taken", color: "#579bfc" }],
  columns: taskColumns(),
  items: [{ name: "Voorbeeldtaak", group: 0, values: { status: "Backlog", prioriteit: "P2" } }],
  views: [{ name: "Backlog", type: "dev_planning" }],
  afterCreate: (_a, boardId) => setDevSettings(boardId, { role: "tasks", estimateUnit: "hours" }),
});

registerBoardTemplate({
  id: "dev-sprints", name: "Sprints", category: "it", icon: "Timeline", kind: "dev_sprints",
  description: "Weekend dev: sprintbord met planning, actieve sprint, dashboard en Complete sprint.",
  groups: [{ title: "Sprints", color: "#a25ddc" }],
  columns: [
    { title: "Status", type: "status", key: "status", settings: { labels: [s(0, "Gepland", "#579bfc"), s(1, "Actief", "#fdab3d"), s(2, "Afgerond", "#00c875", true)] } },
    { title: "Tijdlijn", type: "timeline", key: "tijdlijn" },
    { title: "Doel", type: "long_text", key: "doel" },
  ],
  views: [{ name: "Planning", type: "dev_planning" }, { name: "Actieve sprint", type: "dev_sprint_board" }, { name: "Dashboard", type: "dev_dashboard" }],
  afterCreate: (_a, boardId) => setDevSettings(boardId, { role: "sprints", estimateUnit: "hours" }),
});

registerBoardTemplate({
  id: "dev-epics", name: "Epics", category: "it", icon: "Roadmap",
  description: "Weekend dev: epics met status, eigenaar, tijdlijn en roadmap.",
  groups: [{ title: "Epics", color: "#fdab3d" }],
  columns: [
    { title: "Status", type: "status", key: "status", settings: { labels: [s(0, "Gepland", "#579bfc"), s(1, "Actief", "#fdab3d"), s(2, "Afgerond", "#00c875", true), s(3, "Geparkeerd", "#c4c4c4")] } },
    { title: "Klant", type: "dropdown", key: "klant", settings: { labels: [], allowMultiple: false } },
    { title: "Eigenaar", type: "people", key: "eigenaar" },
    { title: "Tijdlijn", type: "timeline", key: "tijdlijn" },
  ],
  views: [{ name: "Roadmap", type: "dev_roadmap" }],
  afterCreate: (_a, boardId) => setDevSettings(boardId, { role: "epics" }),
});

registerBoardTemplate({
  id: "dev-bugs", name: "Bugs", category: "it", icon: "Bug",
  description: "Weekend dev: bugs met prioriteit, oplosdatum en tijd tot oplossing.",
  groups: [{ title: "Bugs", color: "#df2f4a" }],
  columns: [...taskColumns(), { title: "Opgelost op", type: "date", key: "opgelost_op" }, { title: "Tijd tot oplossing (dagen)", type: "numbers", key: "oplostijd", settings: { unit: "d", decimals: 1 } }],
  views: [{ name: "Bug overzicht", type: "dev_bugs" }],
  afterCreate: (_a, boardId) => setDevSettings(boardId, { role: "bugs", estimateUnit: "hours" }),
});

registerBoardTemplate({
  id: "dev-retro", name: "Retrospective", category: "it", icon: "Feedback",
  description: "Weekend dev: Keep, Improve en Discussion per sprint, met stemmen.",
  groups: [{ title: "Retrospective", color: "#00c875" }],
  columns: [
    { title: "Categorie", type: "status", key: "categorie", settings: { labels: [s(0, "Keep", "#00c875"), s(1, "Improve", "#fdab3d"), s(2, "Discussion", "#579bfc")] } },
    { title: "Stemmen", type: "numbers", key: "stemmen" },
  ],
  views: [{ name: "Retrospective", type: "dev_retro" }],
  afterCreate: (_a, boardId) => setDevSettings(boardId, { role: "retros" }),
});

registerBoardTemplate({
  id: "delivery-klanten", name: "Klanten", category: "delivery", icon: "Person",
  description: "Delivery: klanten met accountmanager, contractvorm, tarieven en status.",
  groups: [{ title: "Actieve klanten", color: "#00c875" }, { title: "Support SLA & strippenkaart", color: "#579bfc" }, { title: "Taken completed", color: "#a25ddc" }],
  columns: [
    { title: "Subitems", type: "subtasks", key: "subitems" },
    { title: "Accountmanager", type: "people", key: "accountmanager" },
    { title: "PO / PM", type: "people", key: "po_pm" },
    { title: "Contractvorm(en)", type: "dropdown", key: "contractvorm", settings: { labels: dropdownLabelsOf(["Fixed price", "Time & materials", "Strippenkaart", "SLA"]) } },
    euro("uurtarief_dev", "Uurtarief dev"), euro("uurtarief_pm", "Uurtarief PM"),
    { title: "Jira-project", type: "text", key: "jira_project" },
    { title: "Files", type: "file", key: "files" },
    { title: "Status", type: "status", key: "status", settings: { labels: KLANTEN_STATUS } },
  ],
  items: [{ name: "Voorbeeldklant", group: 0, values: { contractvorm: ["Time & materials"] } }],
});

registerBoardTemplate({
  id: "delivery-fases", name: "Projecten & Fases", category: "delivery", icon: "Timeline",
  description: "Delivery: budget, go/no-go en factuurstatus per fase.",
  groups: [{ title: "Actief", color: "#0073ea" }, { title: "Gepland", color: "#fdab3d" }, { title: "Afgerond", color: "#00c875" }],
  columns: [
    { title: "Subitems", type: "subtasks", key: "subitems" },
    { title: "Verantwoordelijke", type: "people", key: "verantwoordelijke" },
    { title: "Fasestatus", type: "status", key: "fasestatus", settings: { labels: FASE_STATUS } },
    { title: "Go/no-go datum", type: "date", key: "gonogo_datum" },
    { title: "Type", type: "dropdown", key: "type", settings: { labels: dropdownLabelsOf(["Development", "AI", "Security audit", "Consultancy"]) } },
    hours("uren_dev", "Uren begroot dev"), hours("uren_pm", "Uren begroot PM"),
    { title: "Risico", type: "status", key: "risico", settings: { labels: RISICO_STATUS } },
    { title: "Looptijd", type: "timeline", key: "looptijd" },
    euro("bedrag", "Bedrag excl. btw"),
    { title: "Go/no-go", type: "status", key: "gonogo", settings: { labels: GONOGO_STATUS } },
    { title: "Factuurstatus", type: "status", key: "factuurstatus", settings: { labels: statusLabelsOf([["Niet gefactureerd", "#c4c4c4"], ["Deels gefactureerd", "#fdab3d"], ["Gefactureerd", "#00c875"]], 2) } },
  ],
  items: [{ name: "Voorbeeldfase", group: 0, subitems: [{ name: "Eerste stap" }] }],
});

registerBoardTemplate({
  id: "delivery-uren", name: "Urenregistratie", category: "delivery", icon: "Time",
  description: "Delivery: een plek voor alle uren (dev, PM, meerwerk, billable) als basis voor facturatie.",
  groups: [{ title: "Urenregels", color: "#579bfc" }],
  columns: [
    { title: "Wie", type: "people", key: "wie" }, { title: "Datum", type: "date", key: "datum" },
    hours("uren_dev", "Uren dev"), hours("uren_pm", "Uren PM"), hours("meerwerk_uren", "Meerwerk uren"), hours("nonbillable_uren", "Non-billable uren"),
    { title: "Billable", type: "checkbox", key: "billable" }, { title: "Factuurperiode", type: "text", key: "factuurperiode" }, { title: "Gefactureerd", type: "checkbox", key: "gefactureerd" },
    { title: "Uren totaal", type: "formula", key: "uren_totaal", settings: { formula: "{Uren dev}+{Uren PM}+{Meerwerk uren}+{Non-billable uren}", decimals: 2, unit: "u" } },
  ],
  items: [{ name: "Voorbeeldregel", group: 0, values: { uren_dev: 2 } }],
});
