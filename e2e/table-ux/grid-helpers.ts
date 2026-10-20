import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

export interface TestBoard { boardId: string; groups: { id: string; title: string }[]; items: Record<string, string>; columns: Record<string, string> }

async function json<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  expect(res.ok(), `${res.url()} -> ${res.status()}`).toBeTruthy();
  return (await res.json()) as T;
}

/**
 * Create an isolated board through the REST API: groups with items (default columns Owner/Status/Date plus
 * optional extra columns). Returns ids by name so tests never depend on seed data.
 */
export async function createBoard(request: APIRequestContext, o: { name?: string; groups: { title: string; items: string[] }[]; columns?: { title: string; type: string; key: string }[] }): Promise<TestBoard> {
  const ws = (await json<{ id: string; name: string }[]>(await request.get("/api/v1/workspaces"))).find((w) => w.name === "Delivery")!;
  const board = await json<{ id: string }>(await request.post("/api/v1/boards", { data: { workspaceId: ws.id, name: o.name ?? `Testboard ${Date.now()}` } }));
  const existing = await json<{ id: string; title: string }[]>(await request.get(`/api/v1/boards/${board.id}/groups`));
  const groups: { id: string; title: string }[] = [];
  for (let i = 0; i < o.groups.length; i++) {
    const g = o.groups[i];
    if (i === 0) {
      await json(await request.patch(`/api/v1/groups/${existing[0].id}`, { data: { title: g.title } }));
      groups.push({ id: existing[0].id, title: g.title });
    } else groups.push(await json<{ id: string; title: string }>(await request.post(`/api/v1/boards/${board.id}/groups`, { data: { title: g.title } })));
  }
  const columns: Record<string, string> = {};
  for (const c of o.columns ?? []) columns[c.key] = (await json<{ id: string }>(await request.post(`/api/v1/boards/${board.id}/columns`, { data: c }))).id;
  const items: Record<string, string> = {};
  for (let i = 0; i < o.groups.length; i++) {
    for (const name of o.groups[i].items) items[name] = (await json<{ id: string }>(await request.post("/api/v1/items", { data: { boardId: board.id, groupId: groups[i].id, name } }))).id;
  }
  return { boardId: board.id, groups, items, columns };
}

export const row = (page: Page, name: string): Locator => page.locator(`[data-testid="item-row"][data-item-name="${name}"]`);
export const subRow = (page: Page, name: string): Locator => page.locator(`[data-testid="subitem-row"][data-item-name="${name}"]`);
export const group = (page: Page, title: string): Locator => page.locator(`section[data-group-title="${title}"]`);

/** Item names per group in DOM order. */
export async function order(page: Page, groupTitle: string): Promise<string[]> {
  return group(page, groupTitle).locator('[data-testid="item-row"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.itemName ?? ""));
}

/** Drag with real mouse events in small steps (dnd-kit PointerSensor needs movement past the 6px threshold). */
export async function dragTo(page: Page, handle: Locator, target: Locator, where: "top" | "bottom" | "center" = "center"): Promise<void> {
  const h = await handle.boundingBox();
  const t = await target.boundingBox();
  if (!h || !t) throw new Error("drag: element not visible");
  const tx = t.x + Math.min(t.width / 2, 200);
  const ty = where === "top" ? t.y + 4 : where === "bottom" ? t.y + t.height - 4 : t.y + t.height / 2;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 12, h.y + h.height / 2 + 12, { steps: 4 });
  await page.mouse.move(tx, ty, { steps: 14 });
  await page.mouse.move(tx, ty + (where === "bottom" ? 1 : 0), { steps: 2 });
  await page.mouse.up();
}

export async function dragRow(page: Page, from: string, target: Locator, where: "top" | "bottom" | "center" = "center"): Promise<void> {
  const r = row(page, from);
  await r.hover();
  await dragTo(page, r.getByTestId("row-drag-handle"), target, where);
}

/** Wait for the board to be visible and settled. */
export async function openTestBoard(page: Page, boardId: string, path = ""): Promise<void> {
  await page.goto(`/boards/${boardId}${path}`);
  await expect(page.getByTestId("board-table")).toBeVisible();
}

/** Reads items (by group title) straight from the API: the persisted truth. */
export async function persistedOrder(request: APIRequestContext, boardId: string): Promise<Record<string, string[]>> {
  const full = await json<{ groups: { id: string; title: string; position: number }[]; items: { name: string; groupId: string; position: number; parentItemId: string | null }[] }>(await request.get(`/api/v1/boards/${boardId}/full`));
  const out: Record<string, string[]> = {};
  for (const g of [...full.groups].sort((a, b) => a.position - b.position)) out[g.title] = full.items.filter((i) => !i.parentItemId && i.groupId === g.id).sort((a, b) => a.position - b.position).map((i) => i.name);
  return out;
}
