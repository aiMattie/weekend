import { createHmac } from "node:crypto";
import { expect as baseExpect, type APIRequestContext, type Page } from "@playwright/test";

/** `next dev` compiles routes on first use (slow on a busy machine): give UI assertions more room than the default 10s. */
export const expect = baseExpect.configure({ timeout: process.env.DEV_E2E_EXPECT_TIMEOUT ? Number(process.env.DEV_E2E_EXPECT_TIMEOUT) : 30_000 });

export interface DevIds { workspaceId: string; boards: { sprints: string; taken: string; epics: string; bugs: string; retrospectives: string } }

/** Build the Development workspace through the API (admin session required). */
export async function createDev(request: APIRequestContext, demo = false): Promise<DevIds> {
  const res = await request.post("/api/v1/dev/template", { data: { demo } });
  expect(res.ok(), "create dev template").toBeTruthy();
  return res.json();
}

export async function createTask(request: APIRequestContext, ids: DevIds, name: string, values: Record<string, unknown> = {}): Promise<string> {
  const board = await (await request.get(`/api/v1/boards/${ids.boards.taken}/full`)).json();
  const res = await request.post("/api/v1/items", { data: { boardId: ids.boards.taken, groupId: board.groups[0].id, name, values: { status: "Ready", ...values } } });
  expect(res.ok(), `create task ${name}`).toBeTruthy();
  return (await res.json()).id;
}

export async function setValues(request: APIRequestContext, itemId: string, values: Record<string, unknown>): Promise<void> {
  const res = await request.put(`/api/v1/items/${itemId}/values`, { data: values });
  expect(res.ok(), `set values ${JSON.stringify(values)}`).toBeTruthy();
}

/** Drag with real pointer events (dnd-kit's PointerSensor needs movement). */
export async function drag(page: Page, from: ReturnType<Page["locator"]>, to: ReturnType<Page["locator"]>): Promise<void> {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
  await page.mouse.move(b.x + Math.min(b.width / 2, 200), b.y + Math.min(b.height / 2, 30), { steps: 12 });
  await page.mouse.up();
}

export const sign = (secret: string, body: string): string => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

/** Hit every dev endpoint once so Next dev compiles them before the UI needs them (keeps UI assertions fast). */
export async function warm(request: APIRequestContext, ids: DevIds): Promise<void> {
  const b = ids.boards;
  for (const path of [
    `/api/v1/dev/overview`, `/api/v1/dev/boards/${b.sprints}/planning`, `/api/v1/dev/boards/${b.sprints}/dashboard`, `/api/v1/dev/boards/${b.sprints}/sprint-options`,
    `/api/v1/dev/boards/${b.epics}/roadmap`, `/api/v1/dev/boards/${b.bugs}/bugs`, `/api/v1/dev/boards/${b.retrospectives}/retro`, `/api/v1/dev/git/integrations`,
  ]) await request.get(path);
}

/** Add Klant labels (dropdown) to the task board so tasks can be tagged. */
export async function addKlanten(request: APIRequestContext, ids: DevIds, names: string[]): Promise<void> {
  const full = await (await request.get(`/api/v1/boards/${ids.boards.taken}/full`)).json();
  const col = full.columns.find((c: { key: string }) => c.key === "klant");
  const res = await request.patch(`/api/v1/columns/${col.id}`, { data: { settings: { labels: names.map((text, i) => ({ id: i + 1, text })), allowMultiple: false } } });
  expect(res.ok(), "add klant labels").toBeTruthy();
}

/** View tab by view type (dev_planning, dev_sprint_board, dev_dashboard, ...). */
export const viewTab = (page: Page, type: string) => page.locator(`[data-testid=view-tab][data-view-type=${type}]`);

/** The whole planning section (header + tasks) of a sprint, found by its name. */
export const sprintSection = (page: Page, name: string) => page.locator("[data-testid^='drop-sprint']").filter({ has: page.locator(`[data-sprint-name='${name}']`) });
