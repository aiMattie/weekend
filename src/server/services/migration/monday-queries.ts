/** Read-only GraphQL documents + cursor/page pagination for the monday importer. */
import type { MondayClient } from "./monday-client";
import type { MBoard, MDoc, MFolder, MItem, MondaySnapshot, MTeam, MUpdate, MUser, MWorkspace } from "./monday-types";

const ASSET = "id name url public_url file_extension file_size created_at uploaded_by { id }";
const ITEM_FIELDS = `id name state created_at updated_at creator { id } group { id } column_values { id type text value }`;
const ITEMS_FIRST = `query($id: [ID!], $limit: Int) { boards(ids: $id) { items_page(limit: $limit) { cursor items { ${ITEM_FIELDS} subitems { ${ITEM_FIELDS} } assets { ${ASSET} } } } } }`;
const ITEMS_NEXT = `query($cursor: String!, $limit: Int) { next_items_page(cursor: $cursor, limit: $limit) { cursor items { ${ITEM_FIELDS} subitems { ${ITEM_FIELDS} } assets { ${ASSET} } } } }`;
const UPDATES = `query($id: [ID!], $page: Int, $limit: Int) { boards(ids: $id) { updates(page: $page, limit: $limit) { id item_id body text_body created_at creator { id } replies { id body created_at creator { id } } assets { ${ASSET} } } } }`;
const BOARDS = `query($page: Int, $limit: Int) { boards(page: $page, limit: $limit, state: active, order_by: created_at) { id name type board_kind state description board_folder_id workspace { id } owners { id } groups { id title color position archived } columns { id title type settings_str archived width description } views { id name type settings_str } items_count } }`;

export interface FetchOptions {
  /** only boards of these monday workspace ids ("main" = the main workspace) */
  workspaces?: string[];
  onProgress?: (msg: string) => void;
  includeUpdates?: boolean;
  /** max items per board (for quick dry-runs) */
  maxItemsPerBoard?: number;
}

async function paged<T>(fetchPage: (page: number) => Promise<T[]>, size: number): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const rows = await fetchPage(page);
    out.push(...rows);
    if (rows.length < size) return out;
    if (page > 500) throw new Error("monday pagination did not terminate");
  }
}

export async function fetchBoardItems(c: MondayClient, boardId: string, max = Infinity): Promise<MItem[]> {
  const first = await c.query<{ boards: { items_page: { cursor: string | null; items: MItem[] } }[] }>(ITEMS_FIRST, { id: [boardId], limit: 100 });
  const page = first.boards?.[0]?.items_page;
  const items = [...(page?.items ?? [])];
  let cursor = page?.cursor ?? null;
  while (cursor && items.length < max) {
    const next = await c.query<{ next_items_page: { cursor: string | null; items: MItem[] } }>(ITEMS_NEXT, { cursor, limit: 100 });
    items.push(...next.next_items_page.items);
    cursor = next.next_items_page.cursor;
  }
  return items.slice(0, max === Infinity ? undefined : max);
}

export async function fetchBoardUpdates(c: MondayClient, boardId: string): Promise<MUpdate[]> {
  return paged(async (page) => (await c.query<{ boards: { updates: MUpdate[] }[] }>(UPDATES, { id: [boardId], page, limit: 100 })).boards?.[0]?.updates ?? [], 100);
}

/** Read the whole (filtered) account into memory. Pure queries, nothing is written anywhere. */
export async function fetchSnapshot(c: MondayClient, opts: FetchOptions = {}): Promise<MondaySnapshot> {
  const say = opts.onProgress ?? (() => {});
  const head = await c.query<{ me: { account: { id: string; name: string } }; users: MUser[]; teams: MTeam[]; workspaces: MWorkspace[] }>(
    `query { me { account { id name } } users(limit: 500) { id name email title phone is_guest is_admin is_view_only is_pending enabled time_zone_identifier teams { id name } } teams { id name owners { id } users { id } } workspaces(limit: 100, state: active) { id name kind state description } }`,
  );
  say(`users ${head.users.length}, teams ${head.teams.length}, workspaces ${head.workspaces.length}`);
  const folders = await paged((page) => c.query<{ folders: MFolder[] }>(`query($page: Int) { folders(limit: 100, page: $page) { id name color parent { id } workspace { id } } }`, { page }).then((r) => r.folders), 100);
  const allBoards = await paged((page) => c.query<{ boards: MBoard[] }>(BOARDS, { page, limit: 25 }).then((r) => r.boards), 25);
  const wsFilter = opts.workspaces?.length ? new Set(opts.workspaces.map(String)) : null;
  const inScope = (b: MBoard) => !wsFilter || wsFilter.has(b.workspace?.id ?? "main");
  const boards: MondaySnapshot["boards"] = [];
  const skippedBoards: MondaySnapshot["skippedBoards"] = [];
  for (const b of allBoards.filter(inScope)) {
    if (b.type === "custom_object") { skippedBoards.push({ id: b.id, name: b.name, type: b.type }); continue; }
    if (b.type === "document") { boards.push({ ...b, items: [], updates: [] }); continue; }
    // subitem boards are read through their parent's subitems field
    if (b.type === "sub_items_board") { boards.push({ ...b, items: [], updates: [] }); continue; }
    say(`board "${b.name}" (${b.items_count ?? "?"} items)`);
    const items = b.items_count === 0 ? [] : await fetchBoardItems(c, b.id, opts.maxItemsPerBoard);
    const updates = opts.includeUpdates === false || !items.length ? [] : await fetchBoardUpdates(c, b.id);
    boards.push({ ...b, items, updates });
  }
  const docs = await fetchDocs(c, wsFilter, say);
  return { account: head.me?.account ?? null, users: head.users, teams: head.teams, workspaces: head.workspaces, folders, boards, docs, skippedBoards };
}

async function fetchDocs(c: MondayClient, wsFilter: Set<string> | null, say: (m: string) => void): Promise<MDoc[]> {
  const all = await paged(
    (page) => c.query<{ docs: MDoc[] }>(`query($page: Int) { docs(limit: 25, page: $page) { id object_id name doc_kind workspace_id created_by { id } } }`, { page }).then((r) => r.docs ?? []),
    25,
  );
  const docs = all.filter((d) => !wsFilter || wsFilter.has(d.workspace_id ?? "main"));
  say(`docs ${docs.length}`);
  for (const d of docs) {
    d.blocks = await paged(
      (page) => c.query<{ docs: { blocks: MDoc["blocks"] }[] }>(`query($id: [ID!], $page: Int) { docs(ids: $id) { blocks(limit: 100, page: $page) { id type content position parent_block_id } } }`, { id: [d.id], page }).then((r) => r.docs?.[0]?.blocks ?? []),
      100,
    );
  }
  return docs;
}
