import type { APIRequestContext } from "@playwright/test";
import { expect } from "../fixtures";
import { startMockAnthropic, type MockAnthropic } from "./mock-anthropic";

/** Point the running app at a local mock provider (only possible when the server runs with E2E_RESET=1). Returns null when not allowed. */
export async function useMockProvider(request: APIRequestContext): Promise<MockAnthropic | null> {
  const mock = await startMockAnthropic();
  const r = await request.post("/api/test/ai", { data: { baseUrl: mock.url, apiKey: "mock-key" } });
  if (!r.ok()) { await mock.close(); return null; }
  return mock;
}
export const aiOff = (request: APIRequestContext) => request.post("/api/test/ai", { data: { disabled: true } });
export const aiReset = (request: APIRequestContext) => request.post("/api/test/ai", { data: { reset: true } });

export interface MadeBoard { id: string; itemIds: string[]; columns: Record<string, { id: string; settings: Record<string, unknown> }>; groupId: string }

/** A board with known items (default Owner/Status/Date columns). */
export async function makeBoard(request: APIRequestContext, workspaceId: string, name: string, itemNames: string[]): Promise<MadeBoard> {
  const b = await (await request.post("/api/v1/boards", { data: { workspaceId, name } })).json();
  const groups = (await (await request.get(`/api/v1/boards/${b.id}/groups`)).json()) as { id: string }[];
  const itemIds: string[] = [];
  for (const n of itemNames) itemIds.push((await (await request.post("/api/v1/items", { data: { boardId: b.id, groupId: groups[0].id, name: n } })).json()).id);
  const cols = (await (await request.get(`/api/v1/boards/${b.id}/columns`)).json()) as { id: string; key: string; settings: Record<string, unknown> }[];
  return { id: b.id, itemIds, groupId: groups[0].id, columns: Object.fromEntries(cols.map((c) => [c.key, { id: c.id, settings: c.settings }])) };
}

export async function addColumn(request: APIRequestContext, boardId: string, body: Record<string, unknown>): Promise<{ id: string; key: string; settings: Record<string, unknown> }> {
  const r = await request.post(`/api/v1/boards/${boardId}/columns`, { data: body });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
