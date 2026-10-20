/**
 * Fake monday GraphQL API over synthetic data. `mockHandler` answers the importer's read-only
 * documents; `startMockMonday()` serves it over http (used by the Playwright spec with
 * MONDAY_API_URL / the apiUrl override). It refuses any document containing `mutation`.
 */
import { createServer, type Server } from "node:http";
import { MOCK_DOCS, MOCK_FOLDERS, MOCK_TEAMS, MOCK_USERS, MOCK_WORKSPACES, mockBoards } from "./mock-data";

export const MOCK_PAGE = 2; // small cursor pages to exercise pagination

export interface MockLog { queries: string[] }

export function mockHandler(query: string, vars: Record<string, unknown>, log?: MockLog): unknown {
  log?.queries.push(query);
  if (/\bmutation\b/i.test(query)) throw new Error("mock monday: mutation refused");
  const boards = mockBoards();
  const page = Number(vars.page ?? 1);
  const slice = <T>(a: T[], size: number) => a.slice((page - 1) * size, page * size);
  if (/me \{ account/.test(query)) return { me: { account: { id: "1", name: "Mock Account" } }, users: MOCK_USERS, teams: MOCK_TEAMS, workspaces: MOCK_WORKSPACES };
  if (/folders\(/.test(query)) return { folders: slice(MOCK_FOLDERS, 100) };
  if (/boards\(page/.test(query)) return { boards: slice(boards, 25).map((b) => ({ ...b, items: undefined, updates: undefined })) };
  if (/items_page\(limit/.test(query) && /boards\(ids/.test(query)) {
    const b = boards.find((x) => x.id === String((vars.id as string[])[0]))!;
    const next = b.items.length > MOCK_PAGE ? "cur:" + b.id + ":" + MOCK_PAGE : null;
    return { boards: [{ items_page: { cursor: next, items: b.items.slice(0, MOCK_PAGE) } }] };
  }
  if (/next_items_page/.test(query)) {
    const [, id, from] = String(vars.cursor).split(":");
    const b = boards.find((x) => x.id === id)!;
    const start = Number(from);
    const end = start + MOCK_PAGE;
    return { next_items_page: { cursor: end < b.items.length ? `cur:${id}:${end}` : null, items: b.items.slice(start, end) } };
  }
  if (/updates\(page/.test(query)) {
    const b = boards.find((x) => x.id === String((vars.id as string[])[0]))!;
    return { boards: [{ updates: slice(b.updates, 100) }] };
  }
  if (/docs\(limit: 25/.test(query)) return { docs: slice(MOCK_DOCS.map((d) => ({ ...d, blocks: undefined })), 25) };
  if (/docs\(ids/.test(query)) {
    const d = MOCK_DOCS.find((x) => x.id === String((vars.id as string[])[0]));
    return { docs: [{ blocks: slice(d?.blocks ?? [], 100) }] };
  }
  throw new Error("mock monday: unhandled query " + query.slice(0, 80));
}

export async function startMockMonday(port = 0): Promise<{ server: Server; url: string; log: MockLog; close: () => Promise<void> }> {
  const log: MockLog = { queries: [] };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { query, variables } = JSON.parse(body || "{}") as { query: string; variables?: Record<string, unknown> };
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ data: mockHandler(query, variables ?? {}, log) }));
      } catch (e) {
        res.statusCode = 200;
        res.end(JSON.stringify({ errors: [{ message: (e as Error).message }] }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  return { server, url: `http://127.0.0.1:${addr.port}/v2`, log, close: () => new Promise((r) => server.close(() => r())) };
}
