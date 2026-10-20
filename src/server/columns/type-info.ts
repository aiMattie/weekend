/**
 * Human/AI readable description of every column type (value shape, example input, settings):
 * backs the MCP tool `get_column_type_info` and docs. Pure data, no db.
 */
import { getColumnLogic, listColumnLogic } from "./registry";

export interface ColumnTypeInfo {
  type: string;
  label: string;
  readOnly: boolean;
  /** how the value is stored / returned by the API (`value` JSON) */
  valueShape: string;
  /** a valid input for change_column_value */
  exampleValue: unknown;
  /** example `settings` when creating the column */
  settingsExample: Record<string, unknown>;
  notes?: string;
}

const T = (valueShape: string, exampleValue: unknown, settingsExample: Record<string, unknown> = {}, notes?: string) => ({ valueShape, exampleValue, settingsExample, notes });

const INFO: Record<string, ReturnType<typeof T>> = {
  text: T('"string"', "Hello"),
  long_text: T("{ text: string }", { text: "Long text" }),
  numbers: T("number", 12.5, { unit: "EUR", unitPosition: "left", decimals: 2, summary: "sum" }, "summary: sum|avg|min|max|median|count|none"),
  status: T("{ index: <label id> }", { label: "Done" }, { labels: [{ id: 0, text: "Working on it", color: "#fdab3d", index: 0 }, { id: 1, text: "Done", color: "#00c875", index: 1, isDone: true }] }, "Input also accepts { index } or the label text."),
  date: T("{ date: YYYY-MM-DD, time?: HH:mm:ss }", { date: "2026-10-06", time: "09:30:00" }),
  people: T("{ personsAndTeams: [{ id, kind: person|team }] }", { personsAndTeams: [{ id: "2000000001", kind: "person" }] }),
  checkbox: T("{ checked: true } (unchecked = empty)", { checked: "true" }),
  dropdown: T("{ ids: number[] }", { labels: ["Option A"] }, { labels: [{ id: 1, text: "Option A" }], allowMultiple: true }),
  link: T("{ url, text? }", { url: "https://example.com", text: "Example" }),
  timeline: T("{ from: YYYY-MM-DD, to: YYYY-MM-DD }", { from: "2026-10-05", to: "2026-10-09" }),
  week: T("{ week: { startDate, endDate } } (Monday-Sunday)", { week: { startDate: "2026-10-05", endDate: "2026-10-11" } }, {}, 'Input also accepts "2026-W41" or any date in the week.'),
  hour: T("{ hour: 0-23, minute: 0-59 }", { hour: 14, minute: 30 }, {}, 'Input also accepts "14:30".'),
  world_clock: T("{ timezone: IANA name }", { timezone: "Europe/Amsterdam" }),
  rating: T("{ rating: 1..max }", { rating: 4 }, { max: 5 }),
  vote: T("{ votersIds: string[] }", { votersIds: ["2000000001"] }),
  tags: T("{ tag_ids: string[] } (ids of account tags, create with create_or_get_tag)", { tag_ids: ["2000000100"] }),
  email: T("{ email, text }", { email: "info@example.com", text: "Info" }),
  phone: T("{ phone, countryShortName }", { phone: "+31 6 12345678", countryShortName: "NL" }),
  location: T("{ lat, lng, address }", { lat: 52.37, lng: 4.9, address: "Amsterdam" }),
  country: T("{ countryCode, countryName }", { countryCode: "NL", countryName: "Netherlands" }, {}, "Input also accepts a code or a name."),
  color_picker: T("{ color: { hex } }", { color: { hex: "#0073ea" } }),
  file: T("{ files: [{ assetId, name, isImage, fileType: ASSET|LINK }] }", { files: [{ assetId: "2000000200", name: "spec.pdf" }] }, {}, "Upload bytes first with POST /api/v1/assets (multipart, field file + itemId + columnId): that also attaches the file."),
  button: T("(no value)", null, { label: "Click me", color: "#0073ea" }, "Click with POST /api/v1/items/:id/values/:columnId/action { action: click }; emits button.clicked."),
  dependency: T("{ linkedPulseIds: [{ linkedPulseId }] }", { item_ids: ["2000000300"] }, { allowMultiple: true }, "Same board only; cycles are rejected."),
  time_tracking: T("{ running, startDate, duration, additional_value: [sessions] }", { command: "start" }, {}, 'Write commands: { command: "start"|"stop" }, { command: "add", seconds }, { command: "remove", id }, { command: "reset" }.'),
  board_relation: T("{ linkedPulseIds: [{ linkedPulseId }] }", { item_ids: ["2000000300"] }, { boardIds: ["2000000050"], allowMultiple: true }, "Two-way: creating the column with one boardId also creates the column on the other board (twoWay:false to skip, peerColumnId to pair with an existing column)."),
  doc: T("{ files: [{ objectId, fileType: DOC }] }", { files: [{ objectId: "2000000400" }] }),
  mirror: T("computed: { column, entries, aggregate, result }", null, { relationColumnId: "projecten", targetColumnId: "uren", aggregate: "sum" }, "Read-only."),
  formula: T("computed: { value, text, error? }", null, { formula: "{Uren} * {Tarief}", decimals: 2 }, "Read-only. See formula-lang.ts for functions."),
  progress: T("computed: { done, total, percent }", null, { source: "subitems" }, "Read-only."),
  auto_number: T("computed: number", null, { prefix: "T-", minDigits: 3, startAt: 1 }, "Read-only."),
  item_id: T("computed: string", null, {}, "Read-only."),
  creation_log: T("computed: { created_at, creator_id }", null, {}, "Read-only."),
  last_updated: T("computed: { updated_at, updater_id }", null, {}, "Read-only."),
  item_assignees: T("computed: { personsAndTeams }", null, {}, "Read-only."),
};

export function getColumnTypeInfo(type: string): ColumnTypeInfo {
  const logic = getColumnLogic(type);
  const i = INFO[type] ?? T("verbatim JSON", null);
  return { type, label: logic.label, readOnly: !!logic.readOnly, ...i };
}

export const listColumnTypeInfo = (): ColumnTypeInfo[] => listColumnLogic().map((l) => getColumnTypeInfo(l.type));
