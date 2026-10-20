/**
 * Ready-made agents (the "Agent directory"). `installTemplate` in services/agents.ts turns one of
 * these into a real agent with its triggers, skills and knowledge grants. "native" agents run their
 * own deterministic job (agent-native.ts) and only use the model to polish the text when AI is on.
 */
import type { AgentTriggerType } from "../../db/schema/ai";

export interface TemplateTrigger { type: AgentTriggerType; config?: Record<string, unknown> }
export interface AgentTemplate {
  key: string;
  name: string;
  description: { nl: string; en: string };
  avatar: string;
  instructions: string;
  /** deterministic handler in agent-native.ts */
  native?: "daily_briefer" | "sprint_reporter" | "hours_checker";
  /** needs a board (knowledge + trigger scope): name hint used to pick a default board */
  needsBoard?: { hint: string; kind?: "board" | "dev_sprints"; access: "read" | "write" };
  triggers: TemplateTrigger[];
  skills: { name: string; instruction: string; tools: string[] }[];
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    key: "lead_scorer", name: "Lead Scorer", avatar: "#00c875",
    description: { nl: "Beoordeelt elke nieuwe lead op een schaal van 0 tot 100 en zet een korte onderbouwing als update op het item.", en: "Scores every new lead from 0 to 100 and posts a short rationale as an update." },
    instructions: "Je bent de Lead Scorer. Voor elk nieuw item (een lead) lees je het item met get_item, geeft een score van 0 tot 100 (hoger = kansrijker; let op budget, urgentie, bedrijfsgrootte en passendheid) en plaatst met create_update een update in dit formaat: 'Score: <getal>/100' gevolgd door maximaal drie bullets met de reden. Heeft het board een numbers-kolom met 'score' in de titel, vul die dan met change_column_values. Verzin geen gegevens die niet in het item staan.",
    needsBoard: { hint: "lead", access: "write" },
    triggers: [{ type: "item_created" }, { type: "manual" }],
    skills: [{ name: "Leads scoren", instruction: "Gebruik de gegevens van het item; noem wat je mist.", tools: ["get_board", "get_item", "change_column_values", "create_update"] }],
  },
  {
    key: "ticket_assignment", name: "Ticket Assignment", avatar: "#579bfc",
    description: { nl: "Wijst nieuwe tickets toe aan de best passende collega op basis van onderwerp en huidige werkdruk.", en: "Assigns new tickets to the best fitting colleague based on topic and workload." },
    instructions: "Je bent Ticket Assignment. Voor elk nieuw ticket: lees het item (get_item), bekijk de verdeling op het board (get_board) en de collega's (list_users). Kies de persoon met passende rol (DEV voor technische tickets, Consultancy voor adviesvragen) en de laagste werkdruk (minste open items). Wijs toe met change_column_values op de people-kolom (array met het user-id) en plaats een update met je reden. Wijs nooit aan een AI-agent toe.",
    needsBoard: { hint: "ticket", access: "write" },
    triggers: [{ type: "item_created" }, { type: "manual" }],
    skills: [{ name: "Tickets toewijzen", instruction: "Houd rekening met werkdruk en rol.", tools: ["get_board", "get_item", "list_users", "change_column_values", "create_update"] }],
  },
  {
    key: "risk_analyzer", name: "Risk Analyzer", avatar: "#df2f4a",
    description: { nl: "Analyseert elke week een board op risico's (te laat, vast, geen eigenaar) en meldt dat aan jou.", en: "Analyses a board weekly for risks (overdue, stuck, no owner) and reports to you." },
    instructions: "Je bent de Risk Analyzer. Lees het board met get_board en zoek risico's: items te laat of met een deadline binnen 3 dagen, status 'Stuck' of vergelijkbaar, items zonder eigenaar, en grote hoeveelheden open werk bij één persoon. Geef een korte analyse met een risiconiveau (laag/midden/hoog) en de top 5 items met reden. Stuur het resultaat met notify_user naar de eigenaar van de agent (zijn user-id staat in de opdracht).",
    needsBoard: { hint: "project", access: "read" },
    triggers: [{ type: "schedule", config: { every: "week", weekday: 1, time: "08:00" } }, { type: "manual" }],
    skills: [{ name: "Risico's analyseren", instruction: "Wees concreet en kort.", tools: ["get_board", "get_item", "list_users", "notify_user"] }],
  },
  {
    key: "meeting_summarizer", name: "Meeting Summarizer", avatar: "#a25ddc",
    description: { nl: "Vat de notities van een meeting-item samen als je de agent @noemt, met besluiten en actiepunten.", en: "Summarises meeting notes on an item when you @mention the agent: decisions and action items." },
    instructions: "Je bent de Meeting Summarizer. Als je op een item wordt genoemd, lees het item met get_item (inclusief updates met de notities) en plaats met create_update een samenvatting met kopjes 'Samenvatting', 'Besluiten' en 'Actiepunten' (met wie en wanneer, als dat in de notities staat). Verzin niets.",
    needsBoard: { hint: "meeting", access: "write" },
    triggers: [{ type: "mention" }, { type: "manual" }],
    skills: [{ name: "Meeting samenvatten", instruction: "Alleen wat in de notities staat.", tools: ["get_item", "create_update"] }],
  },
  {
    key: "daily_briefer", name: "Daily Briefer", avatar: "#fdab3d", native: "daily_briefer",
    description: { nl: "Elke werkdag een ochtendoverzicht in je inbox: wat vandaag af moet en wat over tijd is.", en: "A morning overview in your inbox every weekday: what is due today and what is overdue." },
    instructions: "Maak voor elke collega een kort ochtendoverzicht: eerst wat te laat is, dan wat vandaag af moet. Maximaal 8 regels.",
    triggers: [{ type: "schedule", config: { every: "weekday", time: "07:30" } }, { type: "manual" }],
    skills: [],
  },
  {
    key: "sprint_reporter", name: "Sprint Reporter", avatar: "#037f4c", native: "sprint_reporter",
    description: { nl: "Stuurt elke vrijdag een samenvatting van de lopende sprint (voortgang, scope, wat nog open staat).", en: "Sends a summary of the running sprint every Friday (progress, scope, what is still open)." },
    instructions: "Rapporteer over de actieve sprint: voortgang, scope-wijzigingen en wat nog open staat.",
    needsBoard: { hint: "sprint", kind: "dev_sprints", access: "read" },
    triggers: [{ type: "schedule", config: { every: "week", weekday: 5, time: "16:00" } }, { type: "manual" }],
    skills: [],
  },
  {
    key: "hours_checker", name: "Hours Checker", avatar: "#ff158a", native: "hours_checker",
    description: { nl: "Controleert Urenregistratie op gaten (dagen zonder uren, regels zonder uren of klant) en waarschuwt de betrokkene.", en: "Checks the time registration board for gaps (days without hours, rows without hours or client) and warns the person." },
    instructions: "Controleer het bord Urenregistratie: per persoon de werkdagen zonder uren, regels zonder uren en regels zonder klant. Waarschuw de betrokkenen.",
    needsBoard: { hint: "uren", access: "read" },
    triggers: [{ type: "schedule", config: { every: "weekday", time: "09:00" } }, { type: "manual" }],
    skills: [],
  },
];

export const getTemplate = (key: string): AgentTemplate | undefined => AGENT_TEMPLATES.find((t) => t.key === key);
