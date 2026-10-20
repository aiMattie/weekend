import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { boardIdByName } from "../fixtures";

export interface Col { id: string; key: string; scope?: string; type: string; title: string; settings: Record<string, unknown> }
export interface Itm { id: string; name: string; groupId: string | null; values: Record<string, unknown> }
export interface Full { board: { id: string }; columns: Col[]; items: Itm[]; groups: { id: string; title: string }[]; views: { id: string; name: string; type: string; settings: Record<string, unknown> }[]; users: { id: string; name: string }[] }

export const boardFull = async (request: APIRequestContext, boardId: string): Promise<Full> => (await request.get(`/api/v1/boards/${boardId}/full`)).json();
export const boardByName = async (request: APIRequestContext, name: string) => { const id = await boardIdByName(request, name); return { id, full: await boardFull(request, id) }; };
/** item-scope column by key (subitem columns reuse keys like "status") */
export const colByKey = (full: Full, key: string): Col => { const c = full.columns.find((x) => x.key === key && (x.scope ?? "item") === "item"); expect(c, `column ${key}`).toBeTruthy(); return c!; };
export const itemByName = (full: Full, name: string): Itm => { const i = full.items.find((x) => x.name.startsWith(name)); expect(i, `item ${name}`).toBeTruthy(); return i!; };

export async function createView(request: APIRequestContext, boardId: string, type: string, name = type, settings: Record<string, unknown> = {}) {
  const res = await request.post(`/api/v1/boards/${boardId}/views`, { data: { name, type, settings } });
  expect(res.ok(), `create ${type} view`).toBeTruthy();
  return (await res.json()) as { id: string; name: string; type: string };
}
export async function setValue(request: APIRequestContext, itemId: string, columnId: string, value: unknown) {
  const res = await request.put(`/api/v1/items/${itemId}/values`, { data: { [columnId]: value } });
  expect(res.ok(), `set value ${JSON.stringify(value)}`).toBeTruthy();
}
export async function getItem(request: APIRequestContext, boardId: string, itemId: string): Promise<Itm> {
  const full = await boardFull(request, boardId);
  return full.items.find((i) => i.id === itemId)!;
}
export async function openView(page: Page, boardId: string, viewId: string, testId: string) {
  await page.goto(`/boards/${boardId}?view=${viewId}`);
  await expect(page.getByTestId(testId)).toBeVisible();
}

/** Local date `YYYY-MM-DD`, `offset` days from today. */
export function isoDay(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Monday of this week + `offset` days. */
export function weekDay(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Real mouse drag from the center of `from` by (dx, dy) or onto the center of `to`. */
export async function drag(page: Page, from: Locator, to: Locator | { dx: number; dy?: number }, offset: { x?: number; y?: number } = {}) {
  await from.scrollIntoViewIfNeeded(); // boundingBox does not scroll; wide boards/timelines overflow the viewport
  if (!("dx" in to)) await to.scrollIntoViewIfNeeded();
  const a = (await from.boundingBox())!;
  const sx = a.x + (offset.x ?? a.width / 2);
  const sy = a.y + (offset.y ?? a.height / 2);
  let ex: number; let ey: number;
  if ("dx" in to) { ex = sx + to.dx; ey = sy + (to.dy ?? 0); } else { const b = (await to.boundingBox())!; ex = b.x + b.width / 2; ey = b.y + b.height / 2; }
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + Math.sign(ex - sx) * 8, sy + Math.sign(ey - sy) * 8, { steps: 3 });
  await page.mouse.move(ex, ey, { steps: 14 });
  await page.waitForTimeout(80);
  await page.mouse.up();
}

/** The Dutch sample data of "Projecten & Fases" with timeline dates around this week. */
export async function seedPlanning(request: APIRequestContext) {
  const { id, full } = await boardByName(request, "Projecten & Fases");
  const tl = colByKey(full, "looptijd");
  const dates: Record<string, [string, string]> = {
    "Delta - Fase 1": [weekDay(0), weekDay(3)],
    "LMS - Doorontwikkeling": [weekDay(4), weekDay(8)],
    "Charlie - Security audit": [weekDay(9), weekDay(11)],
    "Echo - Oplevering": [weekDay(-6), weekDay(-4)],
  };
  for (const [name, [from, to]] of Object.entries(dates)) await setValue(request, itemByName(full, name).id, tl.id, { from, to });
  return { boardId: id, full: await boardFull(request, id), tl };
}

/** The `request` fixture has its own cookie jar: log it in as well (the page is logged in by `login`). */
export async function loginApi(request: APIRequestContext, as = "admin") {
  const res = await request.post("/api/auth/login", { data: { email: `${as}@example.com`, password: process.env.SEED_PASSWORD ?? "Welkom123!" } });
  expect(res.ok(), "api login").toBeTruthy();
}
export const colByTitle = (full: Full, title: string): Col => { const c = full.columns.find((x) => x.title === title); expect(c, `column ${title}`).toBeTruthy(); return c!; };
