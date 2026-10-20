import {collectConsoleErrors, login, resetDb } from "../fixtures";
import { addColumnViaCenter, cellOf, gotoBoard, makeBoard, expect, SLOW, test } from "./helpers";

// 1x1 transparent PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test.describe.configure({ timeout: SLOW });
test.describe("file column", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetDb(request);
    await login(page, "admin");
  });

  test("upload, preview, download, remove and persistence", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const { boardId } = await makeBoard(page.context().request, "Bestanden test");
    await gotoBoard(page, boardId);
    await addColumnViaCenter(page, "file");
    await cellOf(page, "file").click();
    await expect(page.getByTestId("file-editor")).toBeVisible();
    await page.getByTestId("file-input").setInputFiles([
      { name: "notities.txt", mimeType: "text/plain", buffer: Buffer.from("hallo wereld") },
      { name: "logo.png", mimeType: "image/png", buffer: PNG },
    ]);
    await expect(page.getByTestId("file-row")).toHaveCount(2);
    await expect(page.getByTestId("file-row").filter({ hasText: "logo.png" }).locator("img")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(cellOf(page, "file").getByTestId("file-chips")).toContainText("notities.txt");
    await expect(cellOf(page, "file").getByTestId("file-chips")).toContainText("logo.png");

    // the bytes are served back (inline for text) and the download variant is an attachment
    await page.reload();
    await expect(page.getByTestId("board-page")).toBeVisible();
    await cellOf(page, "file").click();
    const href = await page.getByTestId("file-row").filter({ hasText: "notities.txt" }).getByTestId("file-link").getAttribute("href");
    const res = await page.context().request.get(href!);
    expect(res.ok()).toBeTruthy();
    expect(await res.text()).toBe("hallo wereld");
    const dl = await page.context().request.get(`${href}?download=1`);
    expect(dl.headers()["content-disposition"]).toContain("attachment");
    const list = await (await page.context().request.get(`/api/v1/assets?boardId=${boardId}`)).json() as { name: string; size: number }[];
    expect(list.map((a) => a.name).sort()).toEqual(["logo.png", "notities.txt"]);

    // remove one
    await page.getByTestId("file-row").filter({ hasText: "notities.txt" }).getByTestId("file-remove").click();
    await expect(page.getByTestId("file-row")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(cellOf(page, "file").getByTestId("file-chips")).not.toContainText("notities.txt");
    await expect(cellOf(page, "file").getByTestId("file-chips")).toContainText("logo.png");

    // a user without access gets a 403/404, an anonymous request a 401
    const anon = await page.context().browser()!.newContext({ baseURL: page.url().split("/boards")[0] });
    const denied = await anon.request.get(href!);
    expect(denied.status()).toBe(401);
    await anon.close();
    expect(errors).toEqual([]);
  });
});
