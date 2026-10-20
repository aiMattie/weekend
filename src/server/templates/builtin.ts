/** Built-in board templates. Imported for its side effect by services/board-templates.ts. */
import { dropdownLabelsOf, registerBoardTemplate, statusLabelsOf } from "./registry";

const STATUS = statusLabelsOf([["Working on it", "#fdab3d"], ["Done", "#00c875"], ["Stuck", "#df2f4a"], ["", "#c4c4c4"]], 1);
const TASK_STATUS = statusLabelsOf([["Te doen", "#c4c4c4"], ["Bezig", "#fdab3d"], ["Review", "#579bfc"], ["Klaar", "#00c875"], ["Geblokkeerd", "#df2f4a"]], 3);
const PRIORITY = statusLabelsOf([["Hoog", "#df2f4a"], ["Middel", "#fdab3d"], ["Laag", "#579bfc"], ["", "#c4c4c4"]]);

registerBoardTemplate({
  id: "blank",
  name: "Leeg board",
  description: "Een lege tabel met Owner, Status en Date.",
  category: "general",
  icon: "Board",
  groups: [{ title: "Group Title" }],
  columns: [{ title: "Owner", type: "people", key: "people" }, { title: "Status", type: "status", key: "status" }, { title: "Date", type: "date", key: "date" }],
  items: [{ name: "Item 1", group: 0 }, { name: "Item 2", group: 0 }, { name: "Item 3", group: 0 }],
});

registerBoardTemplate({
  id: "project-management",
  name: "Projectmanagement",
  description: "Plan een project met fases, verantwoordelijken, deadlines en voortgang.",
  category: "projects",
  icon: "Timeline",
  groups: [{ title: "Gepland", color: "#579bfc" }, { title: "Actief", color: "#fdab3d" }, { title: "Afgerond", color: "#00c875" }],
  columns: [
    { title: "Verantwoordelijke", type: "people", key: "people" },
    { title: "Status", type: "status", key: "status", settings: { labels: STATUS } },
    { title: "Prioriteit", type: "status", key: "priority", settings: { labels: PRIORITY } },
    { title: "Looptijd", type: "timeline", key: "timeline" },
    { title: "Deadline", type: "date", key: "date" },
    { title: "Notities", type: "long_text", key: "notes" },
    { title: "Subitem", type: "name", scope: "subitem" },
  ],
  items: [
    { name: "Kick-off", group: 0, values: { status: "Working on it", priority: "Hoog" }, subitems: [{ name: "Agenda opstellen" }, { name: "Uitnodigingen versturen" }] },
    { name: "Ontwerp", group: 0, values: { priority: "Middel" } },
    { name: "Bouw", group: 1, values: { status: "Working on it", priority: "Hoog" } },
    { name: "Oplevering", group: 2, values: { status: "Done" } },
  ],
});

registerBoardTemplate({
  id: "task-tracker",
  name: "Taken",
  description: "Een eenvoudige takenlijst met status, prioriteit, deadline en uren.",
  category: "tasks",
  icon: "Check",
  groups: [{ title: "Backlog", color: "#c4c4c4" }, { title: "Deze week", color: "#579bfc" }, { title: "Klaar", color: "#00c875" }],
  columns: [
    { title: "Eigenaar", type: "people", key: "people" },
    { title: "Status", type: "status", key: "status", settings: { labels: TASK_STATUS } },
    { title: "Prioriteit", type: "status", key: "priority", settings: { labels: PRIORITY } },
    { title: "Deadline", type: "date", key: "date" },
    { title: "Geschatte uren", type: "numbers", key: "hours" },
  ],
  items: [
    { name: "Eerste taak", group: 1, values: { status: "Bezig", priority: "Middel", hours: 4 } },
    { name: "Tweede taak", group: 1, values: { status: "Te doen", priority: "Hoog", hours: 2 } },
    { name: "Idee voor later", group: 0 },
  ],
});

registerBoardTemplate({
  id: "crm-leads",
  name: "Leads en CRM",
  description: "Volg leads van eerste contact tot deal, met contactgegevens en waarde.",
  category: "sales",
  icon: "Contacts",
  groups: [{ title: "Nieuw", color: "#579bfc" }, { title: "In gesprek", color: "#fdab3d" }, { title: "Gewonnen", color: "#00c875" }, { title: "Verloren", color: "#df2f4a" }],
  columns: [
    { title: "Accountmanager", type: "people", key: "people" },
    { title: "Fase", type: "status", key: "status", settings: { labels: statusLabelsOf([["Nieuw", "#579bfc"], ["Gekwalificeerd", "#fdab3d"], ["Offerte", "#a25ddc"], ["Gewonnen", "#00c875"], ["Verloren", "#df2f4a"]], 3) } },
    { title: "E-mail", type: "email", key: "email" },
    { title: "Telefoon", type: "phone", key: "phone" },
    { title: "Waarde", type: "numbers", key: "value", settings: { unit: { symbol: "€", direction: "left" } } },
    { title: "Volgende stap", type: "date", key: "date" },
  ],
  items: [{ name: "Voorbeeldbedrijf BV", group: 0, values: { status: "Nieuw", value: 12500 } }, { name: "Test Klant", group: 1, values: { status: "Gekwalificeerd", value: 4800 } }],
});

registerBoardTemplate({
  id: "bug-tracker",
  name: "Bugs",
  description: "Meld en volg bugs met ernst, status en eigenaar.",
  category: "it",
  icon: "Bug",
  groups: [{ title: "Nieuw", color: "#df2f4a" }, { title: "In behandeling", color: "#fdab3d" }, { title: "Opgelost", color: "#00c875" }],
  columns: [
    { title: "Eigenaar", type: "people", key: "people" },
    { title: "Status", type: "status", key: "status", settings: { labels: statusLabelsOf([["Nieuw", "#c4c4c4"], ["In behandeling", "#fdab3d"], ["Te testen", "#579bfc"], ["Opgelost", "#00c875"], ["Wontfix", "#757575"]], 3) } },
    { title: "Ernst", type: "status", key: "severity", settings: { labels: statusLabelsOf([["Kritiek", "#df2f4a"], ["Hoog", "#ff642e"], ["Normaal", "#fdab3d"], ["Laag", "#579bfc"]]) } },
    { title: "Component", type: "dropdown", key: "component", settings: { labels: dropdownLabelsOf(["Frontend", "Backend", "Database", "Overig"]), allowMultiple: false } },
    { title: "Gemeld op", type: "date", key: "date" },
  ],
  items: [{ name: "Voorbeeldbug", group: 0, values: { severity: "Normaal" } }],
});

registerBoardTemplate({
  id: "content-calendar",
  name: "Contentkalender",
  description: "Plan content per kanaal en publicatiedatum.",
  category: "marketing",
  icon: "Calendar",
  groups: [{ title: "Ideeen", color: "#a25ddc" }, { title: "In productie", color: "#fdab3d" }, { title: "Gepubliceerd", color: "#00c875" }],
  columns: [
    { title: "Auteur", type: "people", key: "people" },
    { title: "Status", type: "status", key: "status", settings: { labels: statusLabelsOf([["Idee", "#a25ddc"], ["Schrijven", "#fdab3d"], ["Review", "#579bfc"], ["Gepubliceerd", "#00c875"]], 3) } },
    { title: "Kanaal", type: "dropdown", key: "channel", settings: { labels: dropdownLabelsOf(["Website", "LinkedIn", "Nieuwsbrief", "Social"]) } },
    { title: "Publicatiedatum", type: "date", key: "date" },
    { title: "Link", type: "link", key: "link" },
  ],
  items: [{ name: "Blog: lancering", group: 0, values: { status: "Idee" } }],
});

registerBoardTemplate({
  id: "employees",
  name: "Medewerkers",
  description: "Overzicht van medewerkers met functie, afdeling en contactgegevens.",
  category: "hr",
  icon: "Person",
  groups: [{ title: "Actief", color: "#00c875" }, { title: "Oud-medewerkers", color: "#c4c4c4" }],
  columns: [
    { title: "Functie", type: "text", key: "text" },
    { title: "Afdeling", type: "dropdown", key: "department", settings: { labels: dropdownLabelsOf(["DEV", "Consultancy", "Projectmanagement"]), allowMultiple: false } },
    { title: "E-mail", type: "email", key: "email" },
    { title: "Telefoon", type: "phone", key: "phone" },
    { title: "Startdatum", type: "date", key: "date" },
  ],
  items: [{ name: "Voorbeeld Medewerker", group: 0 }],
});

import "./standalone"; // dev + delivery single-board templates
