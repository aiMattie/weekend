import type { APIRequestContext, Page } from "@playwright/test";
import { expect as baseExpect, boardIdByName, test as baseTest } from "../fixtures";

/** The dev server of the shared host is slow under load: generous assertion timeout. */
export const expect = baseExpect.configure({ timeout: 40_000 });
export const test = baseTest;
export const SLOW = 300_000;

export interface TestBoard { boardId: string; groupId: string; itemIds: string[] }

/** A fresh board with only the name column, one group and the given items (through the REST API). */
export async function makeBoard(request: APIRequestContext, name: string, items: string[] = ["Eerste item"]): Promise<TestBoard> {
  const ws = await (await request.get("/api/v1/workspaces")).json() as { id: string; name: string }[];
  const delivery = ws.find((w) => w.name === "Delivery") ?? ws[0];
  const res = await request.post("/api/v1/boards", { data: { workspaceId: delivery.id, name, emptyColumns: true } });
  expect(res.ok(), `create board ${name}`).toBeTruthy();
  const board = await res.json() as { id: string };
  const groups = await (await request.get(`/api/v1/boards/${board.id}/groups`)).json() as { id: string }[];
  const itemIds: string[] = [];
  for (const n of items) {
    const r = await request.post("/api/v1/items", { data: { boardId: board.id, groupId: groups[0].id, name: n } });
    expect(r.ok(), `create item ${n}`).toBeTruthy();
    itemIds.push((await r.json() as { id: string }).id);
  }
  return { boardId: board.id, groupId: groups[0].id, itemIds };
}

export async function gotoBoard(page: Page, boardId: string): Promise<void> {
  await page.goto(`/boards/${boardId}`);
  await expect(page.getByTestId("board-page")).toBeVisible();
}

/** Add a column through the "+" button and the Column center. Returns the header locator. */
export async function addColumnViaCenter(page: Page, type: string, opts: { title?: string; setup?: (page: Page) => Promise<void> } = {}) {
  await page.getByTestId("add-column").click();
  await expect(page.getByTestId("column-center")).toBeVisible();
  await page.getByTestId(`add-column-${type}`).click();
  if (opts.setup) {
    await expect(page.getByTestId("column-center-setup")).toBeVisible();
    if (opts.title) await page.getByTestId("column-title-input").fill(opts.title);
    await opts.setup(page);
    await page.getByRole("button", { name: "Kolom maken" }).click();
  }
  const header = page.getByTestId(`col-header-${type}`).last();
  await expect(header).toBeVisible();
  return header;
}

/** The cell of the first item row for a column key. */
export const cellOf = (page: Page, key: string, itemName = "Eerste item") =>
  page.locator(`[data-testid="item-row"][data-item-name="${itemName}"]`).getByTestId(`cell-${key}`);

export { boardIdByName };
