import { collectConsoleErrors, login, resetDb } from "../fixtures";
import { cellOf, expect, gotoBoard, makeBoard, SLOW, test } from "./helpers";

test.describe.configure({ timeout: SLOW });
test.describe("column permissions", () => {
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("owners-only columns are read-only or hidden for members; the dialog saves the setting", async ({ page, browser, baseURL }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    const req = page.context().request;
    const { boardId, itemIds } = await makeBoard(req, "Permissies test");
    const mk = async (title: string, key: string) => (await (await req.post(`/api/v1/boards/${boardId}/columns`, { data: { title, type: "text", key } })).json() as { id: string }).id;
    const ro = await mk("Alleen lezen", "ro");
    const hidden = await mk("Verborgen", "geheim");
    await req.put(`/api/v1/items/${itemIds[0]}/values`, { data: { ro: "waarde A", geheim: "geheim B" } });
    await gotoBoard(page, boardId);

    // set the permissions through the column menu dialog (as the board owner / admin)
    const header = page.getByTestId("col-header-ro");
    await header.hover();
    await header.getByTestId("column-menu").click();
    await page.getByTestId("column-permissions-open").click();
    await expect(page.getByTestId("column-permissions")).toBeVisible();
    await page.getByTestId("perm-edit-mode").selectOption("owners");
    await page.getByRole("button", { name: "Opslaan" }).click();
    await expect(page.getByTestId("column-permissions")).toHaveCount(0);
    const hdr = await req.put(`/api/v1/columns/${hidden}/permissions`, { data: { view: { mode: "owners" } } });
    expect(hdr.ok()).toBeTruthy();
    const stored = await (await req.get(`/api/v1/columns/${ro}/permissions`)).json() as { edit: { mode: string } };
    expect(stored.edit.mode).toBe("owners");

    // a normal member: sees "ro" but cannot edit it, does not see "geheim" at all
    const member = await browser.newContext({ baseURL, locale: "nl-NL", viewport: { width: 1440, height: 900 } });
    await login(member, "dev1");
    const mp = await member.newPage();
    await gotoBoard(mp, boardId);
    await expect(cellOf(mp, "ro")).toContainText("waarde A");
    await expect(mp.getByTestId("col-header-geheim")).toHaveCount(0);
    await cellOf(mp, "ro").click();
    await expect(mp.getByTestId("cell-input")).toHaveCount(0);
    const denied = await member.request.put(`/api/v1/items/${itemIds[0]}/values`, { data: { ro: "gehackt" } });
    expect(denied.status()).toBe(403);
    const full = await (await member.request.get(`/api/v1/boards/${boardId}/full`)).json() as { items: { values: Record<string, unknown> }[]; columns: { key: string }[] };
    expect(full.columns.some((c) => c.key === "geheim")).toBe(false);
    expect(JSON.stringify(full.items)).not.toContain("geheim B");
    await member.close();
    expect(errors).toEqual([]);
  });
});
