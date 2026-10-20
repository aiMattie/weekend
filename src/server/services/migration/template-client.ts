/**
 * Klant-workspace template ("TEMPLATE - Klant Workspace"): Kickoff & Roadmap, Builds & Taken, AI Maturity Tracker,
 * Customer Files, Contacten, plus Gespreksverslagen (reports live in the client workspace).
 */
import { and, eq } from "drizzle-orm";
import type { Actor } from "../../../lib/actor";
import { db } from "../../../db/client";
import { items } from "../../../db/schema/core";
import * as groupsSvc from "../groups";
import * as itemsSvc from "../items";
import { ensureBoard, ensureColumns, ensureFolder, label, dropdownLabels, type ColSpec, type GroupSpec } from "./template-kit";

const GREY = "#c4c4c4";
const status = (labels: [string, string, boolean?][]): Record<string, unknown> => ({ labels: labels.map(([t, c, d], i) => label(i, t, c, !!d)) });

export const CLIENT_BOARD_NAMES = {
  kickoff: "Kickoff & Roadmap", builds: "Builds & Taken", maturity: "AI Maturity Tracker",
  files: "🗂️ Customer Files", contacts: "🤖 Contacten", verslagen: "Gespreksverslagen",
} as const;
export type ClientBoards = Record<keyof typeof CLIENT_BOARD_NAMES, string>;

interface BoardDef { name: string; folder: string; description: string; groups: GroupSpec[]; columns: ColSpec[]; starters?: Record<string, string[]> }

const DEFS: Record<keyof typeof CLIENT_BOARD_NAMES, BoardDef> = {
  kickoff: {
    name: CLIENT_BOARD_NAMES.kickoff, folder: "Planning & To do's", description: "Kick-off en roadmap met de klant: van pre-kickoff tot build.",
    groups: [{ title: "Pre-Kickoff", color: "#a25ddc" }, { title: "Kickoff", color: "#0073ea" }, { title: "Maand 2 - Quick wins", color: "#fdab3d" }, { title: "Maand 3+ - Build", color: "#00c875" }],
    columns: [
      { key: "subitems", title: "Subitems", type: "subtasks" },
      { key: "status", title: "Status", type: "status", settings: status([["Working on it", "#fdab3d"], ["Done", "#00c875", true], ["Stuck", "#df2f4a"], ["Niet gestart", GREY], ["Geblokkeerd", "#bb3354"], ["Afgerond", "#037f4c", true], ["In uitvoering", "#579bfc"]]) },
      { key: "verantwoordelijke", title: "Verantwoordelijke", type: "people" },
      { key: "type", title: "Type", type: "dropdown", settings: dropdownLabels("Meeting", "Oplevering", "Training", "Quick win") },
      { key: "deadline", title: "Deadline", type: "date" }, { key: "notities", title: "Notities", type: "long_text" },
      { key: "week", title: "Week", type: "week" }, { key: "credits", title: "Credits", type: "numbers" },
    ],
    starters: {
      "Pre-Kickoff": ["Intake gesprek plannen", "Contract en NDA tekenen", "Toegang tot systemen regelen"],
      Kickoff: ["Kick-off meeting", "Roadmap vaststellen"], "Maand 2 - Quick wins": ["Eerste quick win opleveren"], "Maand 3+ - Build": ["Build-fase starten"],
    },
  },
  builds: {
    name: CLIENT_BOARD_NAMES.builds, folder: "Planning & To do's", description: "Wat we voor de klant bouwen. Sprintwerk zelf staat in Development.",
    groups: [{ title: "Backlog", color: GREY }, { title: "Actieve Sprint", color: "#0073ea" }, { title: "Afgerond", color: "#00c875" }],
    columns: [
      { key: "verantwoordelijke", title: "Verantwoordelijke", type: "people" },
      { key: "prioriteit", title: "Prioriteit", type: "status", settings: status([["Laag", "#579bfc"], ["Middel", "#fdab3d"], ["Hoog", "#df2f4a"]]) },
      { key: "status", title: "Status", type: "status", settings: status([["Backlog", GREY], ["In uitvoering", "#fdab3d"], ["Review", "#a25ddc"], ["Afgerond", "#00c875", true]]) },
      { key: "deadline", title: "Deadline", type: "date" }, { key: "uren_geschat", title: "Uren Geschat", type: "numbers", settings: { unit: "u", unitPosition: "right" } },
      { key: "categorie", title: "Categorie", type: "dropdown", settings: dropdownLabels("Development", "AI", "Data", "Security", "Consultancy") },
    ],
  },
  maturity: {
    name: CLIENT_BOARD_NAMES.maturity, folder: "AI Maturity Tracker", description: "Nulmeting, huidige score en doel per onderdeel van de AI-volwassenheid.",
    groups: [{ title: "Data & Infrastructuur", color: "#0073ea" }, { title: "Processen & Adoptie", color: "#a25ddc" }, { title: "Strategie & Visie", color: "#00c875" }],
    columns: [
      { key: "status", title: "Status", type: "status", settings: status([["Niet gestart", GREY], ["In ontwikkeling", "#fdab3d"], ["Op doel", "#579bfc"], ["Behaald", "#00c875", true]]) },
      { key: "nulmeting", title: "Nulmeting Score", type: "numbers" }, { key: "huidig", title: "Huidige Score", type: "numbers" }, { key: "doel", title: "Doelscore", type: "numbers" },
      { key: "review", title: "Laatste Review", type: "date" }, { key: "actiepunten", title: "Actiepunten", type: "long_text" },
    ],
    starters: { "Data & Infrastructuur": ["Datakwaliteit", "Integraties"], "Processen & Adoptie": ["Procesdocumentatie", "Gebruik van AI-tools"], "Strategie & Visie": ["AI-strategie", "Governance"] },
  },
  files: {
    name: CLIENT_BOARD_NAMES.files, folder: "Klant informatie", description: "Bestanden die we van de klant nodig hebben of hebben ontvangen.",
    groups: [{ title: "Bestanden", color: "#579bfc" }],
    columns: [
      { key: "status", title: "Status", type: "status", settings: status([["Working on it", "#fdab3d"], ["Available", "#00c875", true], ["Not Available", "#df2f4a"]]) },
      { key: "file_attachments", title: "File Attachments", type: "file" }, { key: "file_description", title: "File Description", type: "text" }, { key: "upload_date", title: "Upload Date", type: "date" },
    ],
  },
  contacts: {
    name: CLIENT_BOARD_NAMES.contacts, folder: "Klant informatie", description: "Contactpersonen bij de klant.",
    groups: [{ title: "Contacten", color: "#a25ddc" }],
    columns: [
      { key: "employee", title: "Employee", type: "people" },
      { key: "status", title: "Status", type: "status", settings: status([["Active", "#00c875", true], ["Past", GREY], ["Maternity/paternity leave", "#fdab3d"]]) },
      { key: "phone", title: "Phone", type: "phone" }, { key: "email", title: "Email", type: "email" },
      { key: "department", title: "Department", type: "status", settings: status([["Management", "#579bfc"], ["IT", "#0073ea"], ["Operations", "#fdab3d"], ["Overig", GREY]]) },
      { key: "manager", title: "Manager", type: "people" }, { key: "birthday", title: "Birthday", type: "date" }, { key: "location", title: "Location", type: "text" },
      { key: "linkedin", title: "LinkedIn", type: "link" }, { key: "contract", title: "Contract", type: "file" },
    ],
  },
  verslagen: {
    name: CLIENT_BOARD_NAMES.verslagen, folder: "Klant informatie", description: "Gespreksverslagen staan altijd hier. Maak actiepunten direct als subitem of taak aan. In Delivery staat alleen een link.",
    groups: [{ title: "Gespreksverslagen", color: "#00c875" }],
    columns: [
      { key: "subitems", title: "Actiepunten", type: "subtasks" }, { key: "datum", title: "Datum", type: "date" }, { key: "deelnemers", title: "Deelnemers", type: "people" },
      { key: "soort", title: "Soort", type: "dropdown", settings: dropdownLabels("Kick-off", "Voortgang", "Review", "Overig") },
      { key: "samenvatting", title: "Samenvatting", type: "long_text" }, { key: "verslag", title: "Verslag", type: "file" },
    ],
  },
};

/** Create the six client boards (and their folders) inside `workspaceId`. Idempotent. */
export function buildClientBoards(sys: Actor, workspaceId: string): ClientBoards {
  const out = {} as ClientBoards;
  for (const k of Object.keys(DEFS) as (keyof typeof DEFS)[]) {
    const d = DEFS[k];
    const folderId = ensureFolder(sys, workspaceId, d.folder);
    const b = ensureBoard(sys, workspaceId, d.name, { description: d.description, folderId, groups: d.groups });
    ensureColumns(sys, b.id, d.columns);
    out[k] = b.id;
    if (b.created && d.starters) {
      for (const g of groupsSvc.list(sys, b.id)) for (const name of d.starters[g.title] ?? []) itemsSvc.create(sys, { boardId: b.id, groupId: g.id, name });
    }
  }
  return out;
}

/** Items already on a board by name (case-insensitive), used by callers that want to avoid duplicates. */
export const hasItemNamed = (boardId: string, name: string): boolean =>
  !!db.select().from(items).where(and(eq(items.boardId, boardId), eq(items.state, "active"))).all().find((i) => i.name.toLowerCase() === name.toLowerCase() && !i.parentItemId);
