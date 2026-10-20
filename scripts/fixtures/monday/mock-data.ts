/** Synthetic monday account (no real customer data) used by the importer tests and the e2e mock server. */
import type { MBoard, MColumn, MDoc, MFolder, MItem, MTeam, MUpdate, MUser, MWorkspace } from "../../../src/server/services/migration/monday-types";

const j = (o: unknown) => JSON.stringify(o);
const col = (id: string, title: string, type: string, settings: unknown = {}): MColumn => ({ id, title, type, settings_str: j(settings), archived: false, width: null, description: null });

export const MOCK_USERS: MUser[] = [
  { id: "9001", name: "Admin User", email: "admin@example.com", title: "Projectmanager", is_guest: false, is_admin: true, is_view_only: false, is_pending: false, enabled: true, teams: [{ id: "8001", name: "Projectmanagement" }] },
  { id: "9002", name: "Nieuwe Collega", email: "nieuw@example.test", title: "Developer", is_guest: false, is_admin: false, is_view_only: false, is_pending: false, enabled: true, teams: [{ id: "8002", name: "DEV" }] },
  { id: "9003", name: "Gast Gebruiker", email: "gast@example.test", title: null, is_guest: true, is_admin: false, is_view_only: false, is_pending: false, enabled: true, teams: [] },
];
export const MOCK_TEAMS: MTeam[] = [
  { id: "8001", name: "Projectmanagement", owners: [{ id: "9001" }], users: [{ id: "9001" }] },
  { id: "8002", name: "DEV", owners: [], users: [{ id: "9002" }] },
];
export const MOCK_WORKSPACES: MWorkspace[] = [
  { id: "100", name: "Delivery", kind: "open", state: "active", description: "Sturing" },
  { id: "101", name: "Mock Klant", kind: "closed", state: "active", description: null },
];
export const MOCK_FOLDERS: MFolder[] = [
  { id: "300", name: "Documenten", color: null, parent: null, workspace: { id: "100" } },
  { id: "301", name: "Sub", color: null, parent: { id: "300" }, workspace: { id: "100" } },
];

const statusSettings = { labels: { 0: "Working on it", 1: "Done", 2: "Stuck" }, labels_colors: { 0: { color: "#fdab3d" }, 1: { color: "#00c875" }, 2: { color: "#df2f4a" } }, labels_positions_v2: { 0: 0, 1: 1, 2: 2, 5: 3 }, done_colors: [1] };

export const KLANTEN_COLS: MColumn[] = [
  col("name", "Name", "name"),
  col("subitems", "Subitems", "subtasks", { boardIds: [5002], allowMultipleItems: true }),
  col("status", "Status", "status", statusSettings),
  col("people", "Accountmanager", "people"),
  col("date4", "Startdatum", "date"),
  col("numbers", "Uurtarief", "numbers", { unit: { symbol: "€", custom_unit: "", direction: "left" } }),
  col("dropdown", "Contractvorm", "dropdown", { labels: [{ id: 1, name: "Fixed price" }, { id: 2, name: "Strippenkaart" }], limit_select: false }),
  col("text", "Notitie", "text"),
  col("long_text", "Toelichting", "long_text"),
  col("checkbox", "Actief", "checkbox"),
  col("link", "Website", "link"),
  col("timeline", "Looptijd", "timeline"),
  col("files", "Files", "file"),
  col("board_relation_a", "Fases", "board_relation", { boardIds: [5003] }),
  col("weird", "Raar", "some_future_type"),
  col("mirror_a", "Budget uren", "mirror", { relation_column: { board_relation_a: true }, displayed_linked_columns: { "5003": ["numbers_b"] }, function: "sum" }),
  col("calc", "Dubbel", "formula", { formula: "{numbers}*2" }),
];
export const SUB_COLS: MColumn[] = [col("name", "Name", "name"), col("status", "Status", "status", statusSettings), col("people", "Owner", "person")];
export const FASES_COLS: MColumn[] = [
  col("name", "Name", "name"), col("status", "Fasestatus", "status", statusSettings),
  col("board_relation_b", "Klant", "board_relation", { boardIds: [5001] }), col("numbers_b", "Uren begroot", "numbers"),
];

const cv = (id: string, type: string, value: unknown, text = ""): MItem["column_values"][number] => ({ id, type, text, value: value === null ? null : j(value) });

export function mockBoards(): (MBoard & { items: MItem[]; updates: MUpdate[] })[] {
  const base = { state: "active", board_kind: "public", description: null, owners: [{ id: "9001" }], views: [{ id: "7001", name: "Table", type: "FeatureBoardView", settings_str: "{}" }, { id: "7002", name: "Kanban", type: "KanbanView", settings_str: "{}" }] };
  const klantItems: MItem[] = [1, 2, 3, 4, 5].map((n) => ({
    id: `600${n}`, name: `Klant ${n}`, state: "active", created_at: "2026-01-0" + n + "T10:00:00Z", updated_at: "2026-02-01T10:00:00Z", creator: { id: "9001" }, group: { id: n <= 3 ? "g1" : "g2" },
    column_values: [
      cv("status", "status", { index: n % 3, post_id: null, changed_at: "2026-01-01T00:00:00Z" }, "Done"),
      cv("people", "people", { personsAndTeams: [{ id: 9001, kind: "person" }, { id: 77777, kind: "person" }] }),
      cv("date4", "date", { date: `2026-03-0${n}`, changed_at: "x" }),
      cv("numbers", "numbers", String(90 + n)), cv("dropdown", "dropdown", { ids: [1] }), cv("text", "text", `notitie ${n}`),
      cv("long_text", "long_text", { text: `lange tekst ${n}`, changed_at: "x" }), cv("checkbox", "checkbox", { checked: "true" }),
      cv("link", "link", { url: "https://example.test", text: "site" }), cv("timeline", "timeline", { from: "2026-01-01", to: "2026-02-01" }),
      cv("files", "file", n === 1 ? { files: [{ assetId: 4001, name: "contract.pdf", isImage: "false", fileType: "ASSET" }] } : null),
      cv("board_relation_a", "board_relation", n <= 2 ? { linkedPulseIds: [{ linkedPulseId: 6101 }] } : null),
      cv("weird", "some_future_type", n === 1 ? { foo: "bar" } : null),
    ],
    subitems: n === 1 ? [{ id: "6501", name: "Sub 1", created_at: "2026-01-02T10:00:00Z", column_values: [cv("status", "status", { index: 1 }), cv("people", "person", { id: 9002 })] }, { id: "6502", name: "Sub 2", column_values: [cv("status", "status", { index: 0 })] }] : [],
    assets: n === 1 ? [{ id: "4001", name: "contract.pdf", url: null, public_url: "http://127.0.0.1:9/files/contract.pdf", file_extension: ".pdf", file_size: 1234, created_at: "2026-01-02T10:00:00Z", uploaded_by: { id: "9001" } }] : [],
  }));
  const fases: MItem[] = [{
    id: "6101", name: "Fase 1", state: "active", group: { id: "g3" }, creator: { id: "9001" },
    column_values: [cv("status", "status", { index: 0 }), cv("board_relation_b", "board_relation", { linkedPulseIds: [{ linkedPulseId: 6001 }] }), cv("numbers_b", "numbers", "120")],
  }];
  const updates: MUpdate[] = [
    { id: "7101", item_id: "6001", body: "<p>Eerste <strong>update</strong></p><script>alert(1)</script>", text_body: "Eerste update", created_at: "2026-02-01T09:00:00Z", creator: { id: "9001" }, replies: [{ id: "7102", body: "<p>Antwoord</p>", created_at: "2026-02-01T09:05:00Z", creator: { id: "9002" } }], assets: [] },
    { id: "7103", item_id: "999999", body: "<p>Wees</p>", creator: null, replies: [], assets: [] },
  ];
  return [
    { ...base, id: "5001", name: "Klanten", type: "board", board_folder_id: "301", workspace: { id: "100" }, groups: [{ id: "g1", title: "Actieve klanten", color: "#00c875", position: "1", archived: false }, { id: "g2", title: "Support", color: "#579bfc", position: "2", archived: false }], columns: KLANTEN_COLS, items: klantItems, updates, items_count: 5 },
    { ...base, id: "5002", name: "Subitems of Klanten", type: "sub_items_board", board_folder_id: null, workspace: { id: "100" }, groups: [{ id: "topics", title: "Subitems", color: "#579bfc", position: "1" }], columns: SUB_COLS, items: [], updates: [], items_count: 2 },
    { ...base, id: "5003", name: "Projecten & Fases", type: "board", board_folder_id: null, workspace: { id: "100" }, board_kind: "private", groups: [{ id: "g3", title: "Actief", color: "#0073ea", position: "1" }], columns: FASES_COLS, items: fases, updates: [], items_count: 1 },
    { ...base, id: "5004", name: "Gespreksverslag", type: "document", board_folder_id: null, workspace: { id: "101" }, groups: [], columns: [], items: [], updates: [], items_count: 0 },
    { ...base, id: "5005", name: "Custom thing", type: "custom_object", board_folder_id: null, workspace: { id: "101" }, groups: [], columns: [], items: [], updates: [], items_count: 0 },
    { ...base, id: "5006", name: "Los bord", type: "board", board_folder_id: null, workspace: null, groups: [{ id: "g9", title: "Group Title", color: "#579bfc", position: "1" }], columns: [col("name", "Name", "name"), col("status", "Status", "status", statusSettings)], items: [{ id: "6901", name: "Taak A", group: { id: "g9" }, column_values: [cv("status", "status", { index: 1 })] }], updates: [], items_count: 1 },
  ];
}

export const MOCK_DOCS: MDoc[] = [
  { id: "d1", object_id: "5004", name: "Verslag", doc_kind: "private", workspace_id: "101", created_by: { id: "9001" }, blocks: [{ id: "b1", type: "large_title", content: j({ deltaFormat: [{ insert: "Titel" }] }), position: 1, parent_block_id: null }, { id: "b2", type: "normal_text", content: j({ deltaFormat: [{ insert: "Tekst" }] }), position: 2, parent_block_id: null }] },
];
