/**
 * Delivery workspace template: boards Klanten, Projecten & Fases,
 * Urenregistratie and the per-client onboarding checklist, fully wired:
 *   Klanten <-> Projecten & Fases (klant / projecten_fases), Klanten <-> Urenregistratie (klant / urenregels),
 *   Projecten & Fases <-> Urenregistratie (fase / urenregels).
 * Hours roll up automatically: mirror columns on Projecten & Fases sum Uren dev / Uren PM from Urenregistratie,
 * formulas give "uren besteed", "restant", "budget %" and the 80% warning.
 */
import type { Actor } from "../../../lib/actor";
import { systemActor } from "../../../lib/actor";
import { db } from "../../../db/client";
import { items } from "../../../db/schema/core";
import { and, asc, eq } from "drizzle-orm";
import { FASE_STATUS, GONOGO_STATUS, KLANTEN_STATUS, L, RISICO_STATUS } from "../../../db/seed-data";
import * as itemsSvc from "../items";
import * as groupsSvc from "../groups";
import { ensureBoard, ensureColumns, ensureFolder, ensureRelationPair, ensureWorkspace, dropdownLabels, setColumnSettings, type ColSpec } from "./template-kit";

export interface DeliveryResult {
  workspaceId: string;
  boards: { klanten: string; fases: string; uren: string; checklist: string };
  columns: { urenDevMirror: string; urenPmMirror: string };
}

export const CHECKLIST_STEPS = [
  { key: "stap_klant", title: "Klant in Klanten" }, { key: "stap_fase", title: "Fase in P&F" }, { key: "stap_workspace", title: "Klant-workspace" },
  { key: "stap_epics", title: "Epics gekoppeld" }, { key: "stap_proef", title: "Proefmigratie" }, { key: "stap_migratie", title: "Migratie gedaan" },
  { key: "stap_team", title: "Team op de hoogte" },
];
export const CHECKLIST_HELP = "Klant in Klanten (accountmanager, contractvorm), actieve fase met budget, klant-workspace uit sjabloon, epics gekoppeld aan fase, proefmigratie gecontroleerd, migratie op sprintgrens, team en PO weten dat de klant live staat.";

const FACTUUR_STATUS = [L(0, "Niet gefactureerd", "#c4c4c4"), L(1, "Deels gefactureerd", "#fdab3d"), L(2, "Gefactureerd", "#00c875", true)];
const hours = (key: string, title: string): ColSpec => ({ key, title, type: "numbers", settings: { unit: "u", unitPosition: "right", decimals: 2 } });

export function ensureDeliveryTemplate(accountId: string): DeliveryResult {
  const sys = systemActor(accountId, "system");
  const ws = ensureWorkspace(sys, "Delivery", { color: "#fdab3d", description: "Sturing: klanten, projecten en fases, urenregistratie" });
  ensureFolder(sys, ws.id, "Documenten");

  const klanten = ensureBoard(sys, ws.id, "Klanten", { description: "Alle klanten van Example: accountmanager, contractvorm en tarieven.", groups: [{ title: "Actieve klanten", color: "#00c875" }, { title: "Support SLA & strippenkaart", color: "#579bfc" }, { title: "Taken completed", color: "#a25ddc" }] });
  const fases = ensureBoard(sys, ws.id, "Projecten & Fases", { description: "Budget, go/no-go en factuurstatus per fase.", groups: [{ title: "Actief", color: "#0073ea" }, { title: "Gepland", color: "#fdab3d" }, { title: "Afgerond", color: "#00c875" }] });
  const uren = ensureBoard(sys, ws.id, "Urenregistratie", { description: "Eén plek voor alle uren. Facturatie gebeurt uitsluitend op basis van dit bord.", groups: [{ title: "Urenregels", color: "#579bfc" }] });

  ensureColumns(sys, klanten.id, [
    { key: "subitems", title: "Subitems", type: "subtasks" },
    { key: "accountmanager", title: "Accountmanager", type: "people" },
    { key: "po_pm", title: "PO / PM", type: "people" },
    { key: "uren_verantwoordelijke", title: "Uren-verantwoordelijke", type: "people" },
    { key: "contractvorm", title: "Contractvorm(en)", type: "dropdown", settings: dropdownLabels("Fixed price", "Time & materials", "Strippenkaart", "SLA") },
    { key: "uurtarief_dev", title: "Uurtarief dev", type: "numbers", settings: { unit: "€", unitPosition: "left", decimals: 2 } },
    { key: "uurtarief_pm", title: "Uurtarief PM", type: "numbers", settings: { unit: "€", unitPosition: "left", decimals: 2 } },
    { key: "jira_project", title: "Jira-project", type: "text" },
    { key: "klant_workspace", title: "Klant-workspace", type: "link" },
    { key: "files", title: "Files", type: "file" },
    { key: "status", title: "Status", type: "status", settings: { labels: KLANTEN_STATUS } },
  ]);
  ensureColumns(sys, fases.id, [
    { key: "subitems", title: "Subitems", type: "subtasks" },
    { key: "verantwoordelijke", title: "Verantwoordelijke", type: "people" },
    { key: "fasestatus", title: "Fasestatus", type: "status", settings: { labels: FASE_STATUS } },
    { key: "gonogo_datum", title: "Go/no-go datum", type: "date" },
    { key: "type", title: "Type", type: "dropdown", settings: dropdownLabels("Development", "AI", "Security audit", "Consultancy") },
    hours("uren_dev", "Uren begroot dev"), hours("uren_pm", "Uren begroot PM"),
    { key: "sprints", title: "Sprints", type: "text" }, { key: "huidige_sprint", title: "Huidige sprint", type: "text" },
    { key: "risico", title: "Risico", type: "status", settings: { labels: RISICO_STATUS } },
    { key: "looptijd", title: "Looptijd", type: "timeline" },
    { key: "onsite_dagen", title: "On-site dagen begroot", type: "numbers" },
    { key: "security_audit", title: "Security audit EUR", type: "numbers", settings: { unit: "€", unitPosition: "left", decimals: 2 } },
    { key: "bedrag", title: "Bedrag excl. btw", type: "numbers", settings: { unit: "€", unitPosition: "left", decimals: 2 } },
    { key: "gonogo", title: "Go/no-go", type: "status", settings: { labels: GONOGO_STATUS } },
    { key: "factuurstatus", title: "Factuurstatus", type: "status", settings: { labels: FACTUUR_STATUS } },
  ]);
  const urenCols = ensureColumns(sys, uren.id, [
    { key: "wie", title: "Wie", type: "people" }, { key: "datum", title: "Datum", type: "date" },
    hours("uren_dev", "Uren dev"), hours("uren_pm", "Uren PM"),
    { key: "onsite_dagen", title: "On-site dagen", type: "numbers" }, hours("meerwerk_uren", "Meerwerk uren"), hours("nonbillable_uren", "Non-billable uren"),
    { key: "billable", title: "Billable", type: "checkbox" }, { key: "factuurperiode", title: "Factuurperiode", type: "text" }, { key: "gefactureerd", title: "Gefactureerd", type: "checkbox" },
  ]);

  // two-way connections
  ensureRelationPair(sys, { boardId: fases.id, key: "klant", title: "Klant" }, { boardId: klanten.id, key: "projecten_fases", title: "Projecten & fases" }, { allowMultipleA: false });
  const [, klantRel] = ensureRelationPair(sys, { boardId: uren.id, key: "klant", title: "Klant" }, { boardId: klanten.id, key: "urenregels", title: "Urenregels" }, { allowMultipleA: false });
  const [, faseRel] = ensureRelationPair(sys, { boardId: uren.id, key: "fase", title: "Fase" }, { boardId: fases.id, key: "urenregels", title: "Urenregels" }, { allowMultipleA: false });

  // roll-up: hours per fase (and per klant) come from Urenregistratie through the connections
  const mirror = (boardId: string, key: string, title: string, rel: string, target: string) => {
    const col = ensureColumns(sys, boardId, [{ key, title, type: "mirror", settings: { relationColumnId: rel, targetColumnId: target, aggregate: "sum", decimals: 2, unit: "u" } }])[key];
    return setColumnSettings(col.id, { relationColumnId: rel, targetColumnId: target, aggregate: "sum" });
  };
  const devMirror = mirror(fases.id, "uren_dev_besteed", "Uren dev besteed", faseRel.id, urenCols.uren_dev.id);
  const pmMirror = mirror(fases.id, "uren_pm_besteed", "Uren PM besteed", faseRel.id, urenCols.uren_pm.id);
  mirror(klanten.id, "uren_dev_totaal", "Uren dev totaal", klantRel.id, urenCols.uren_dev.id);
  mirror(klanten.id, "uren_pm_totaal", "Uren PM totaal", klantRel.id, urenCols.uren_pm.id);

  const formula = (boardId: string, key: string, title: string, f: string, extra: Record<string, unknown> = {}) => {
    const [col] = Object.values(ensureColumns(sys, boardId, [{ key, title, type: "formula", settings: { formula: f, ...extra } }]));
    return setColumnSettings(col.id, { formula: f, ...extra });
  };
  formula(fases.id, "uren_besteed", "Uren besteed", "{Uren dev besteed}+{Uren PM besteed}", { decimals: 2, unit: "u" });
  formula(fases.id, "restant_dev", "Restant dev", "{Uren begroot dev}-{Uren dev besteed}", { decimals: 2, unit: "u" });
  formula(fases.id, "restant_pm", "Restant PM", "{Uren begroot PM}-{Uren PM besteed}", { decimals: 2, unit: "u" });
  formula(fases.id, "budget_pct", "Budget gebruikt", "IF({Uren begroot dev}+{Uren begroot PM}=0,0,ROUND(({Uren dev besteed}+{Uren PM besteed})/({Uren begroot dev}+{Uren begroot PM})*100,0))", { unit: "%" });
  formula(fases.id, "budget_waarschuwing", "Budgetwaarschuwing (80%)", 'IF({Budget gebruikt}>=100,"Over budget",IF({Budget gebruikt}>=80,"Waarschuwing: 80% van het budget bereikt","OK"))');
  formula(uren.id, "uren_totaal", "Uren totaal", "{Uren dev}+{Uren PM}+{Meerwerk uren}+{Non-billable uren}", { decimals: 2, unit: "u" });

  const checklist = ensureChecklistBoard(sys, ws.id, klanten.id);
  seedChecklistItems(sys, klanten.id, checklist);
  return { workspaceId: ws.id, boards: { klanten: klanten.id, fases: fases.id, uren: uren.id, checklist }, columns: { urenDevMirror: devMirror.id, urenPmMirror: pmMirror.id } };
}


/** Per-client onboarding checklist: one item per klant, one checkbox per step, progress %. */
export function ensureChecklistBoard(sys: Actor, workspaceId: string, klantenBoardId: string): string {
  const b = ensureBoard(sys, workspaceId, "Klant overstap checklist", { description: CHECKLIST_HELP, groups: [{ title: "Open", color: "#fdab3d" }, { title: "Live", color: "#00c875" }] });
  const cols = ensureColumns(sys, b.id, [
    { key: "klant", title: "Klant", type: "board_relation" },
    { key: "po_pm", title: "PO / PM", type: "people" },
    ...CHECKLIST_STEPS.map((c) => ({ key: c.key, title: c.title, type: "checkbox" })),
    { key: "opmerking", title: "Opmerking", type: "text" },
  ]);
  setColumnSettings(cols.klant.id, { boardIds: [klantenBoardId], allowMultiple: false });
  const sum = CHECKLIST_STEPS.map((c) => `IF({${c.title}},1,0)`).join("+");
  const [pct] = Object.values(ensureColumns(sys, b.id, [{ key: "voortgang", title: "Voortgang", type: "formula", settings: { formula: `ROUND((${sum})/${CHECKLIST_STEPS.length}*100,0)`, unit: "%" } }]));
  setColumnSettings(pct.id, { formula: `ROUND((${sum})/${CHECKLIST_STEPS.length}*100,0)`, unit: "%" });
  return b.id;
}

/** One checklist item per klant that does not have one yet (matched by name). */
export function seedChecklistItems(sys: Actor, klantenBoardId: string, checklistBoardId: string): number {
  const have = new Set(db.select().from(items).where(and(eq(items.boardId, checklistBoardId), eq(items.state, "active"))).all().map((i) => i.name.toLowerCase()));
  const open = groupsSvc.list(sys, checklistBoardId)[0];
  let n = 0;
  for (const k of db.select().from(items).where(and(eq(items.boardId, klantenBoardId), eq(items.state, "active"))).orderBy(asc(items.position)).all()) {
    if (k.parentItemId || have.has(k.name.toLowerCase())) continue;
    itemsSvc.create(sys, { boardId: checklistBoardId, groupId: open.id, name: k.name, values: { klant: [k.id] } });
    have.add(k.name.toLowerCase());
    n++;
  }
  return n;
}
