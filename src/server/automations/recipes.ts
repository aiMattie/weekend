/**
 * Recipe templates ("sentence recipes") for the Automation Center. Pure data + build functions (no db,
 * no React): the UI renders `sentence` with a dropdown for every `[token]`, then calls
 * `buildRecipe(recipe, values)` through the API to get the definition to store.
 */
import type { FieldKind, Txt } from "./blocks/types";
import type { AutomationDefinition, BlockRef, Step } from "./model";

export type RecipeCategory = "notifications" | "status_change" | "recurring" | "due_dates" | "item_creation" | "dependencies" | "integrations" | "subitems" | "dev";
export const RECIPE_CATEGORIES: { id: RecipeCategory; label: Txt }[] = [
  { id: "notifications", label: { nl: "Notificaties", en: "Notifications" } },
  { id: "status_change", label: { nl: "Statuswijziging", en: "Status change" } },
  { id: "recurring", label: { nl: "Terugkerend", en: "Recurring" } },
  { id: "due_dates", label: { nl: "Deadlines", en: "Due dates" } },
  { id: "item_creation", label: { nl: "Items aanmaken", en: "Item creation" } },
  { id: "dependencies", label: { nl: "Afhankelijkheden", en: "Dependencies" } },
  { id: "integrations", label: { nl: "Integraties", en: "Integrations" } },
  { id: "subitems", label: { nl: "Subitems", en: "Subitems" } },
  { id: "dev", label: { nl: "Sprints", en: "Sprints" } },
];

export interface RecipeToken {
  key: string;
  kind: FieldKind;
  label: Txt;
  columnTypes?: string[];
  /** label/value tokens: key of the column token they depend on */
  of?: string;
  boardField?: string;
  options?: { value: string; label: Txt }[];
  /** "done" | "working" | "stuck" pick a status label by meaning; "@people" = first people column; else literal */
  default?: unknown;
}

export interface Recipe {
  id: string;
  category: RecipeCategory;
  /** English and Dutch sentence; `[token]` placeholders become dropdowns */
  sentence: Txt;
  tokens: RecipeToken[];
  build(v: Record<string, unknown>): AutomationDefinition;
}

type V = Record<string, unknown>;
const s = (x: unknown) => (x === undefined || x === null ? "" : String(x));
const act = (block: string, config: Record<string, unknown>): Step => ({ id: `s${Math.random().toString(36).slice(2, 8)}`, type: "action", block, config });
const def = (trigger: BlockRef, steps: Step[], conditions?: AutomationDefinition["conditions"]): AutomationDefinition => ({ trigger, steps, ...(conditions ? { conditions } : {}) });
const trig = (type: string, config: Record<string, unknown> = {}): BlockRef => ({ type, config });
const tok = (key: string, kind: FieldKind, nl: string, en: string, extra: Partial<RecipeToken> = {}): RecipeToken => ({ key, kind, label: { nl, en }, ...extra });

/* shared tokens */
const STATUS = tok("status", "column", "status", "status", { columnTypes: ["status"] });
const LABEL = tok("label", "label", "label", "label", { of: "status", default: "done" });
const STATUS2 = tok("status2", "column", "andere status", "other status", { columnTypes: ["status"] });
const LABEL2 = tok("label2", "label", "label", "label", { of: "status2", default: "working" });
const USERS = tok("users", "users", "personen", "people", { default: "@people" });
const GROUP = tok("group", "group", "groep", "group");
const BOARD = tok("board", "board", "board", "board");
const DATE = tok("date", "column", "datum", "date", { columnTypes: ["date"] });
const PEOPLE = tok("people", "column", "personen-kolom", "people column", { columnTypes: ["people"] });
const TIME = tok("time", "time", "tijdstip", "time", { default: "09:00" });
const DAYS = tok("days", "number", "aantal", "number", { default: 2 });
const NUMBER = tok("number", "column", "getalkolom", "number column", { columnTypes: ["numbers"] });
const TEXT = (key: string, nl: string, en: string, dflt?: string) => tok(key, "text", nl, en, { default: dflt });
const INTEG = tok("integration", "integration", "Slack/Teams-kanaal", "Slack/Teams channel");
const BUTTON = tok("button", "column", "knop", "button", { columnTypes: ["button"] });
const PERIOD = tok("every", "select", "periode", "period", { default: "week", options: [
  { value: "day", label: { nl: "dag", en: "day" } }, { value: "weekday", label: { nl: "werkdag", en: "weekday" } },
  { value: "week", label: { nl: "week", en: "week" } }, { value: "month", label: { nl: "maand", en: "month" } }] });

const notifyStep = (v: V, msg: string, email = false) => act("notify", { recipients: Array.isArray(v.users) ? v.users : [v.users].filter(Boolean), message: msg, email });
const statusTrig = (v: V) => trig("status_changes_to", { columnId: s(v.status), labelId: s(v.label) });
const recurTrig = (v: V) => trig("recurring", { every: s(v.every) || "week", weekday: 1, dayOfMonth: 1, time: s(v.time) || "09:00" });
const dateTrig = (v: V, dir: "before" | "after" | "at") => trig("date_arrives", { columnId: s(v.date), direction: dir, offsetValue: dir === "at" ? 0 : Number(v.days ?? 1), offsetUnit: "days", time: "09:00" });
const setStatus = (col: unknown, label: unknown, on?: string) => act("set_status", { columnId: s(col), labelId: s(label), ...(on ? { on } : {}) });

const R = (id: string, category: RecipeCategory, en: string, nl: string, tokens: RecipeToken[], build: Recipe["build"]): Recipe => ({ id, category, sentence: { en, nl }, tokens, build });

export const RECIPES: Recipe[] = [
  /* ---------------- notifications */
  R("notify-status", "notifications", "When [status] changes to [label], notify [users]", "Wanneer [status] verandert naar [label], stuur een melding aan [users]", [STATUS, LABEL, USERS],
    (v) => def(statusTrig(v), [notifyStep(v, "{item}: {column} is nu {to}")])),
  R("notify-status-email", "notifications", "When [status] changes to [label], notify [users] and send an email", "Wanneer [status] verandert naar [label], stuur [users] een melding en e-mail", [STATUS, LABEL, USERS],
    (v) => def(statusTrig(v), [notifyStep(v, "{item}: {column} is nu {to}", true)])),
  R("notify-stuck", "notifications", "When [status] changes to [label], notify [users]", "Wanneer [status] op [label] komt, waarschuw [users]", [STATUS, { ...LABEL, default: "stuck" }, USERS],
    (v) => def(statusTrig(v), [notifyStep(v, "{item} zit vast ({to})")])),
  R("notify-item-created", "notifications", "When an item is created, notify [users]", "Wanneer een item wordt aangemaakt, stuur een melding aan [users]", [USERS],
    (v) => def(trig("item_created"), [notifyStep(v, "Nieuw item: {item}")])),
  R("notify-column-changed", "notifications", "When [column] changes, notify [users]", "Wanneer [column] verandert, stuur een melding aan [users]", [tok("column", "column", "kolom", "column"), USERS],
    (v) => def(trig("column_changed", { columnId: s(v.column) }), [notifyStep(v, "{item}: {column} wijzigde van {from} naar {to}")])),
  R("notify-assigned", "notifications", "When someone is assigned in [people], notify them", "Wanneer iemand wordt toegewezen in [people], stuur diegene een melding", [PEOPLE],
    (v) => def(trig("person_assigned", { columnId: s(v.people) }), [act("notify", { recipients: [`@col:${s(v.people)}`], message: "Je bent toegewezen aan {item}", email: false })])),
  R("notify-update", "notifications", "When an update is posted, notify [users]", "Wanneer een update wordt geplaatst, stuur een melding aan [users]", [USERS],
    (v) => def(trig("update_created"), [notifyStep(v, "Nieuwe update op {item}: {update}")])),
  R("notify-button", "notifications", "When [button] is clicked, notify [users]", "Wanneer op [button] wordt geklikt, stuur een melding aan [users]", [BUTTON, USERS],
    (v) => def(trig("button_clicked", { columnId: s(v.button) }), [notifyStep(v, "{user} klikte op de knop bij {item}")])),
  R("notify-wait-customer", "notifications", "When [status] stays [label] for more than [days] days, notify [users]", "Wanneer [status] langer dan [days] dagen op [label] staat, stuur [users] een seintje", [STATUS, { ...LABEL, default: "Wacht op klant" }, { ...DAYS, default: 5 }, USERS],
    (v) => def(trig("status_duration", { columnId: s(v.status), labelId: s(v.label), days: Number(v.days ?? 5) }), [notifyStep(v, "{item} staat al {days} dagen op {item.status}", true)])),
  R("notify-subitem-done", "notifications", "When a subitem is completed, notify [users]", "Wanneer een subitem klaar is, stuur een melding aan [users]", [USERS],
    (v) => def(trig("subitem_completed"), [notifyStep(v, "Subitem klaar: {item} ({parent})")])),
  R("notify-moved", "notifications", "When an item is moved to [group], notify [users]", "Wanneer een item naar [group] wordt verplaatst, stuur [users] een melding", [GROUP, USERS],
    (v) => def(trig("item_moved_to_group", { groupId: s(v.group) }), [notifyStep(v, "{item} staat nu in {group}")])),
  R("email-status", "notifications", "When [status] changes to [label], email [users]", "Wanneer [status] verandert naar [label], e-mail [users]", [STATUS, LABEL, USERS],
    (v) => def(statusTrig(v), [act("send_email", { recipients: v.users ?? [], subject: "{item} is {to}", body: "{item}: {column} is gewijzigd van {from} naar {to}." })])),

  /* ---------------- status change */
  R("status-move-group", "status_change", "When [status] changes to [label], move item to [group]", "Wanneer [status] verandert naar [label], verplaats het item naar [group]", [STATUS, LABEL, GROUP],
    (v) => def(statusTrig(v), [act("move_item_to_group", { groupId: s(v.group) })])),
  R("status-archive", "status_change", "When [status] changes to [label], archive the item", "Wanneer [status] verandert naar [label], archiveer het item", [STATUS, LABEL],
    (v) => def(statusTrig(v), [act("archive_item", {})])),
  R("status-set-other", "status_change", "When [status] changes to [label], set [status2] to [label2]", "Wanneer [status] verandert naar [label], zet [status2] op [label2]", [STATUS, LABEL, STATUS2, LABEL2],
    (v) => def(statusTrig(v), [setStatus(v.status2, v.label2)])),
  R("status-update", "status_change", "When [status] changes to [label], post the update [text]", "Wanneer [status] verandert naar [label], plaats de update [text]", [STATUS, LABEL, TEXT("text", "tekst", "text", "Status gewijzigd naar {to}")],
    (v) => def(statusTrig(v), [act("create_update", { text: s(v.text) })])),
  R("status-assign", "status_change", "When [status] changes to [label], assign [users] to [people]", "Wanneer [status] verandert naar [label], wijs [users] toe in [people]", [STATUS, LABEL, USERS, PEOPLE],
    (v) => def(statusTrig(v), [act("assign_person", { columnId: s(v.people), userIds: v.users ?? [], mode: "add" })])),
  R("status-date-today", "status_change", "When [status] changes to [label], set [date] to today", "Wanneer [status] verandert naar [label], zet [date] op vandaag", [STATUS, LABEL, DATE],
    (v) => def(statusTrig(v), [act("set_date", { columnId: s(v.date), base: "now", offsetValue: 0, offsetUnit: "days" })])),
  R("status-duplicate", "status_change", "When [status] changes to [label], duplicate the item", "Wanneer [status] verandert naar [label], dupliceer het item", [STATUS, LABEL],
    (v) => def(statusTrig(v), [act("duplicate_item", {})])),
  R("status-move-board", "status_change", "When [status] changes to [label], move item to board [board]", "Wanneer [status] verandert naar [label], verplaats het item naar board [board]", [STATUS, LABEL, BOARD],
    (v) => def(statusTrig(v), [act("move_item_to_board", { boardId: s(v.board) })])),
  R("status-increment", "status_change", "When [status] changes to [label], add 1 to [number]", "Wanneer [status] verandert naar [label], tel 1 op bij [number]", [STATUS, LABEL, NUMBER],
    (v) => def(statusTrig(v), [act("increment_number", { columnId: s(v.number), by: 1 })])),
  R("status-timer-start", "status_change", "When [status] changes to [label], start the timer in [timer]", "Wanneer [status] verandert naar [label], start de timer in [timer]", [STATUS, { ...LABEL, default: "working" }, tok("timer", "column", "tijdregistratie", "time tracking", { columnTypes: ["time_tracking"] })],
    (v) => def(statusTrig(v), [act("start_timer", { columnId: s(v.timer) })])),
  R("status-timer-stop", "status_change", "When [status] changes to [label], stop the timer in [timer]", "Wanneer [status] verandert naar [label], stop de timer in [timer]", [STATUS, LABEL, tok("timer", "column", "tijdregistratie", "time tracking", { columnTypes: ["time_tracking"] })],
    (v) => def(statusTrig(v), [act("stop_timer", { columnId: s(v.timer) })])),
  R("status-cond-notify", "status_change", "When [status] changes to [label] and [column] is [value], notify [users]", "Wanneer [status] verandert naar [label] en [column] is [value], stuur [users] een melding", [STATUS, LABEL, tok("column", "column", "kolom", "column"), tok("value", "value", "waarde", "value", { of: "column" }), USERS],
    (v) => def(statusTrig(v), [notifyStep(v, "{item} is {to}")], { op: "and", conditions: [{ type: "column_equals", config: { columnId: s(v.column), value: s(v.value) } }] })),
  R("column-set-status", "status_change", "When [column] changes, set [status] to [label]", "Wanneer [column] verandert, zet [status] op [label]", [tok("column", "column", "kolom", "column"), STATUS, { ...LABEL, default: "working" }],
    (v) => def(trig("column_changed", { columnId: s(v.column) }), [setStatus(v.status, v.label)])),
  R("moved-set-status", "status_change", "When an item is moved to [group], set [status] to [label]", "Wanneer een item naar [group] wordt verplaatst, zet [status] op [label]", [GROUP, STATUS, LABEL],
    (v) => def(trig("item_moved_to_group", { groupId: s(v.group) }), [setStatus(v.status, v.label)])),
  R("moved-assign", "status_change", "When an item is moved to [group], assign [users] to [people]", "Wanneer een item naar [group] wordt verplaatst, wijs [users] toe in [people]", [GROUP, USERS, PEOPLE],
    (v) => def(trig("item_moved_to_group", { groupId: s(v.group) }), [act("assign_person", { columnId: s(v.people), userIds: v.users ?? [], mode: "add" })])),
  R("assigned-set-status", "status_change", "When someone is assigned in [people], set [status] to [label]", "Wanneer iemand wordt toegewezen in [people], zet [status] op [label]", [PEOPLE, STATUS, { ...LABEL, default: "working" }],
    (v) => def(trig("person_assigned", { columnId: s(v.people) }), [setStatus(v.status, v.label)])),

  /* ---------------- recurring */
  R("recur-create-item", "recurring", "Every [every] at [time], create an item named [name]", "Elke [every] om [time], maak een item [name] aan", [PERIOD, TIME, TEXT("name", "naam", "name", "Terugkerende taak {date}"), GROUP],
    (v) => def(recurTrig(v), [act("create_item", { groupId: s(v.group) || undefined, name: s(v.name) || "Terugkerende taak" })])),
  R("recur-notify", "recurring", "Every [every] at [time], notify [users]", "Elke [every] om [time], stuur een melding aan [users]", [PERIOD, TIME, USERS, TEXT("text", "bericht", "message", "Herinnering: bekijk het board {board}")],
    (v) => def(recurTrig(v), [notifyStep(v, s(v.text) || "Herinnering")])),
  R("recur-email", "recurring", "Every [every] at [time], email [users]", "Elke [every] om [time], e-mail [users]", [PERIOD, TIME, USERS, TEXT("text", "bericht", "message", "Weekoverzicht van {board}")],
    (v) => def(recurTrig(v), [act("send_email", { recipients: v.users ?? [], subject: s(v.text), body: s(v.text) })])),
  R("recur-chat", "recurring", "Every [every] at [time], post a message to [integration]", "Elke [every] om [time], plaats een bericht in [integration]", [PERIOD, TIME, INTEG, TEXT("text", "bericht", "message", "Stand-up tijd voor {board}")],
    (v) => def(recurTrig(v), [act("chat_message", { integrationId: s(v.integration), text: s(v.text) })])),
  R("recur-webhook", "recurring", "Every [every] at [time], send a webhook to [url]", "Elke [every] om [time], stuur een webhook naar [url]", [PERIOD, TIME, tok("url", "url", "URL", "URL")],
    (v) => def(recurTrig(v), [act("webhook_post", { url: s(v.url) })])),

  /* ---------------- due dates */
  R("due-set-status", "due_dates", "When [date] arrives, set [status] to [label]", "Wanneer [date] aanbreekt, zet [status] op [label]", [DATE, STATUS, { ...LABEL, default: "stuck" }],
    (v) => def(dateTrig(v, "at"), [setStatus(v.status, v.label)])),
  R("due-before-status", "due_dates", "[days] days before [date], set [status] to [label]", "[days] dagen voor [date], zet [status] op [label]", [DAYS, DATE, STATUS, { ...LABEL, default: "working" }],
    (v) => def(dateTrig(v, "before"), [setStatus(v.status, v.label)])),
  R("due-move", "due_dates", "When [date] arrives, move item to [group]", "Wanneer [date] aanbreekt, verplaats het item naar [group]", [DATE, GROUP],
    (v) => def(dateTrig(v, "at"), [act("move_item_to_group", { groupId: s(v.group) })])),
  R("due-notify", "due_dates", "When [date] arrives, notify [users]", "Wanneer [date] aanbreekt, stuur een melding aan [users]", [DATE, USERS],
    (v) => def(dateTrig(v, "at"), [notifyStep(v, "{item} heeft vandaag een deadline")])),
  R("due-before-notify", "due_dates", "[days] days before [date], notify [users]", "[days] dagen voor [date], stuur een melding aan [users]", [DAYS, DATE, USERS],
    (v) => def(dateTrig(v, "before"), [notifyStep(v, "{item} heeft binnenkort een deadline ({item.date})")])),
  R("due-after-notify-open", "due_dates", "[days] days after [date], if [status] is not [label], notify [users]", "[days] dagen na [date], als [status] niet [label] is, stuur [users] een melding", [DAYS, DATE, STATUS, LABEL, USERS],
    (v) => def(dateTrig(v, "after"), [notifyStep(v, "{item} is te laat")], { op: "and", conditions: [{ type: "column_not_equals", config: { columnId: s(v.status), value: s(v.label) } }] })),
  R("due-update", "due_dates", "When [date] arrives, post the update [text]", "Wanneer [date] aanbreekt, plaats de update [text]", [DATE, TEXT("text", "tekst", "text", "De deadline is bereikt.")],
    (v) => def(dateTrig(v, "at"), [act("create_update", { text: s(v.text) })])),
  R("due-email", "due_dates", "[days] days before [date], email [users]", "[days] dagen voor [date], e-mail [users]", [DAYS, DATE, USERS],
    (v) => def(dateTrig(v, "before"), [act("send_email", { recipients: v.users ?? [], subject: "Deadline: {item}", body: "{item} heeft een deadline op {item.date}." })])),

  /* ---------------- item creation */
  R("create-set-date", "item_creation", "When an item is created, set [date] to today", "Wanneer een item wordt aangemaakt, zet [date] op vandaag", [DATE],
    (v) => def(trig("item_created"), [act("set_date", { columnId: s(v.date), base: "now", offsetValue: 0, offsetUnit: "days" })])),
  R("create-assign", "item_creation", "When an item is created, assign [users] to [people]", "Wanneer een item wordt aangemaakt, wijs [users] toe in [people]", [{ ...USERS, default: "@creator" }, PEOPLE],
    (v) => def(trig("item_created"), [act("assign_person", { columnId: s(v.people), userIds: v.users ?? [], mode: "add" })])),
  R("create-set-status", "item_creation", "When an item is created, set [status] to [label]", "Wanneer een item wordt aangemaakt, zet [status] op [label]", [STATUS, { ...LABEL, default: "working" }],
    (v) => def(trig("item_created"), [setStatus(v.status, v.label)])),
  R("create-subitem", "item_creation", "When an item is created, create the subitem [name]", "Wanneer een item wordt aangemaakt, maak het subitem [name] aan", [TEXT("name", "naam", "name", "Eerste stap")],
    (v) => def(trig("item_created"), [act("create_subitem", { name: s(v.name) })])),
  R("create-update", "item_creation", "When an item is created, post the update [text]", "Wanneer een item wordt aangemaakt, plaats de update [text]", [TEXT("text", "tekst", "text", "Welkom! Vul de kolommen in.")],
    (v) => def(trig("item_created"), [act("create_update", { text: s(v.text) })])),
  R("status-create-other", "item_creation", "When [status] changes to [label], create an item in [board]", "Wanneer [status] verandert naar [label], maak een item aan in [board]", [STATUS, LABEL, BOARD],
    (v) => def(statusTrig(v), [act("create_item", { boardId: s(v.board), name: "{item}" })])),
  R("status-create-template", "item_creation", "When [status] changes to [label], create an item from template [template]", "Wanneer [status] verandert naar [label], maak een item aan vanuit sjabloon [template]", [STATUS, LABEL, tok("template", "item", "sjabloonitem", "template item")],
    (v) => def(statusTrig(v), [act("create_item_from_template", { templateItemId: s(v.template), name: "{item}" })])),
  R("button-create", "item_creation", "When [button] is clicked, create an item in [board]", "Wanneer op [button] wordt geklikt, maak een item aan in [board]", [BUTTON, BOARD],
    (v) => def(trig("button_clicked", { columnId: s(v.button) }), [act("create_item", { boardId: s(v.board), name: "{item}" })])),
  R("button-status", "item_creation", "When [button] is clicked, set [status] to [label]", "Wanneer op [button] wordt geklikt, zet [status] op [label]", [BUTTON, STATUS, LABEL],
    (v) => def(trig("button_clicked", { columnId: s(v.button) }), [setStatus(v.status, v.label)])),
  R("button-duplicate", "item_creation", "When [button] is clicked, duplicate the item", "Wanneer op [button] wordt geklikt, dupliceer het item", [BUTTON],
    (v) => def(trig("button_clicked", { columnId: s(v.button) }), [act("duplicate_item", {})])),
  R("button-move", "item_creation", "When [button] is clicked, move item to [group]", "Wanneer op [button] wordt geklikt, verplaats het item naar [group]", [BUTTON, GROUP],
    (v) => def(trig("button_clicked", { columnId: s(v.button) }), [act("move_item_to_group", { groupId: s(v.group) })])),
  R("phase-go-epic", "item_creation", "When [status] changes to [label], create an epic on [board] with the first tasks on [taskboard]", "Wanneer [status] verandert naar [label], maak een epic aan op [board] met de eerste taken op [taskboard]", [STATUS, { ...LABEL, default: "Go" }, BOARD, tok("taskboard", "board", "takenboard", "tasks board")],
    (v) => def(statusTrig(v), [act("create_epic_with_tasks", { epicBoardId: s(v.board), epicName: "{item}", taskBoardId: s(v.taskboard), tasks: ["Kickoff plannen", "Backlog opstellen", "Eerste sprint plannen"] })])),
  R("phase-done-invoice", "item_creation", "When [status] changes to [label], create an invoice task on [board] and notify [users]", "Wanneer [status] verandert naar [label], maak een factuurtaak aan op [board] en stuur [users] een melding", [STATUS, { ...LABEL, default: "Afgerond" }, BOARD, USERS],
    (v) => def(statusTrig(v), [act("create_item", { boardId: s(v.board), name: "Factureren: {item}" }), notifyStep(v, "Factuurtaak aangemaakt voor {item}")])),
  R("client-new-workspace", "item_creation", "When a new item is created, create a client workspace from the template", "Wanneer een nieuw item wordt aangemaakt, maak een klant-workspace aan vanuit het sjabloon", [],
    () => def(trig("item_created"), [act("create_client_workspace", { name: "{item}" })])),

  /* ---------------- dependencies */
  R("dep-date-notify", "dependencies", "When [date] changes, notify [users]", "Wanneer [date] verandert, stuur [users] een melding", [DATE, USERS],
    (v) => def(trig("column_changed", { columnId: s(v.date) }), [notifyStep(v, "De datum van {item} is gewijzigd van {from} naar {to}")])),
  R("dep-done-next", "dependencies", "When [status] changes to [label], set [status2] to [label2] and notify [users]", "Wanneer [status] verandert naar [label], zet [status2] op [label2] en meld [users]", [STATUS, LABEL, STATUS2, LABEL2, USERS],
    (v) => def(statusTrig(v), [setStatus(v.status2, v.label2), notifyStep(v, "{item} is klaar, de volgende stap kan starten")])),
  R("dep-stuck-notify", "dependencies", "When [status] changes to [label], notify [users] that dependent work is blocked", "Wanneer [status] verandert naar [label], meld [users] dat afhankelijk werk geblokkeerd is", [STATUS, { ...LABEL, default: "stuck" }, USERS],
    (v) => def(statusTrig(v), [notifyStep(v, "{item} is geblokkeerd, afhankelijk werk loopt vertraging op")])),

  /* ---------------- subitems */
  R("sub-all-done", "subitems", "When all subitems are done, set [status] to [label]", "Wanneer alle subitems klaar zijn, zet [status] op [label]", [STATUS, LABEL],
    (v) => def(trig("subitem_completed"), [setStatus(v.status, v.label, "parent")], { op: "and", conditions: [{ type: "all_subitems_done", config: {} }] })),
  R("sub-created-assign", "subitems", "When a subitem is created, notify [users]", "Wanneer een subitem wordt aangemaakt, stuur [users] een melding", [USERS],
    (v) => def(trig("subitem_created"), [notifyStep(v, "Nieuw subitem: {item} bij {parent}")])),
  R("sub-done-increment", "subitems", "When a subitem is completed, add 1 to [number]", "Wanneer een subitem klaar is, tel 1 op bij [number]", [NUMBER],
    (v) => def(trig("subitem_completed"), [act("increment_number", { columnId: s(v.number), by: 1, on: "parent" })])),

  /* ---------------- integrations */
  R("int-status-chat", "integrations", "When [status] changes to [label], post a message to [integration]", "Wanneer [status] verandert naar [label], plaats een bericht in [integration]", [STATUS, LABEL, INTEG],
    (v) => def(statusTrig(v), [act("chat_message", { integrationId: s(v.integration), text: "{item}: {column} is nu {to}" })])),
  R("int-create-chat", "integrations", "When an item is created, post a message to [integration]", "Wanneer een item wordt aangemaakt, plaats een bericht in [integration]", [INTEG],
    (v) => def(trig("item_created"), [act("chat_message", { integrationId: s(v.integration), text: "Nieuw item op {board}: {item}" })])),
  R("int-status-webhook", "integrations", "When [status] changes to [label], send a webhook to [url]", "Wanneer [status] verandert naar [label], stuur een webhook naar [url]", [STATUS, LABEL, tok("url", "url", "URL", "URL")],
    (v) => def(statusTrig(v), [act("webhook_post", { url: s(v.url) })])),
  R("int-create-webhook", "integrations", "When an item is created, send a webhook to [url]", "Wanneer een item wordt aangemaakt, stuur een webhook naar [url]", [tok("url", "url", "URL", "URL")],
    (v) => def(trig("item_created"), [act("webhook_post", { url: s(v.url) })])),
  R("int-button-webhook", "integrations", "When [button] is clicked, send a webhook to [url]", "Wanneer op [button] wordt geklikt, stuur een webhook naar [url]", [BUTTON, tok("url", "url", "URL", "URL")],
    (v) => def(trig("button_clicked", { columnId: s(v.button) }), [act("webhook_post", { url: s(v.url) })])),

  /* ---------------- sprints */
  R("dev-sprint-start", "dev", "When a sprint starts, notify [users]", "Wanneer een sprint start, stuur [users] een melding", [USERS],
    (v) => def(trig("sprint_started"), [notifyStep(v, "Een nieuwe sprint is gestart op {board}")])),
  R("dev-sprint-done-chat", "dev", "When a sprint is completed, post a message to [integration]", "Wanneer een sprint wordt afgesloten, plaats een bericht in [integration]", [INTEG],
    (v) => def(trig("sprint_completed"), [act("chat_message", { integrationId: s(v.integration), text: "Sprint afgesloten op {board}" })])),
  R("dev-sprint-done-notify", "dev", "When a sprint is completed, notify [users]", "Wanneer een sprint wordt afgesloten, stuur [users] een melding", [USERS],
    (v) => def(trig("sprint_completed"), [notifyStep(v, "Sprint afgesloten op {board}")])),
];

export const getRecipe = (id: string): Recipe | undefined => RECIPES.find((r) => r.id === id);

/** Build the stored definition from the values a user picked for the tokens. */
export function buildRecipe(recipe: Recipe, values: Record<string, unknown>): AutomationDefinition {
  return recipe.build(values);
}

/** Serializable recipe metadata for the UI (without the build function). */
export const recipeCatalog = () => RECIPES.map(({ id, category, sentence, tokens }) => ({ id, category, sentence, tokens }));
