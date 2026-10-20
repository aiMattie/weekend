import { collectConsoleErrors, expect, login, newUserPage, resetDb, test } from "../fixtures";

test.describe("boards-extra: Whiteboard", () => {
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("add a sticky note and a shape, connect them, reload and everything is still there", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    await page.goto("/whiteboards");
    await page.getByTestId("new-whiteboard").click();
    await expect(page).toHaveURL(/\/whiteboards\/\d+$/);
    const canvas = page.getByTestId("wb-canvas");
    await expect(page.getByTestId("whiteboard-page")).toHaveAttribute("data-hydrated", "true");

    await page.getByTestId("wb-tool-note").click();
    await canvas.click({ position: { x: 400, y: 250 } });
    await page.getByTestId("wb-text-editor").fill("Idee A");
    await canvas.click({ position: { x: 900, y: 600 } }); // blur: commit the text

    await page.getByTestId("wb-tool-rect").click();
    await canvas.click({ position: { x: 800, y: 250 } });
    await page.getByTestId("wb-text-editor").fill("Besluit");
    await canvas.click({ position: { x: 900, y: 600 } });

    await expect(page.locator('[data-testid="wb-element"][data-type="note"]')).toHaveAttribute("data-text", "Idee A");
    await expect(page.locator('[data-testid="wb-element"][data-type="rect"]')).toHaveAttribute("data-text", "Besluit");

    // connector: drag from the note to the rectangle
    await page.getByTestId("wb-tool-connector").click();
    const note = page.locator('[data-testid="wb-element"][data-type="note"]');
    const rect = page.locator('[data-testid="wb-element"][data-type="rect"]');
    const nb = (await note.boundingBox())!;
    const rb = (await rect.boundingBox())!;
    await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
    await page.mouse.down();
    await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('[data-testid="wb-element"][data-type="connector"]')).toHaveCount(1);

    // zoom
    await page.getByTestId("wb-zoom-in").click();
    await expect(canvas).toHaveAttribute("data-zoom", "1.25");

    await expect(page.getByTestId("wb-save-state")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
    await page.reload();
    await expect(page.getByTestId("whiteboard-page")).toHaveAttribute("data-hydrated", "true");
    await expect(page.locator('[data-testid="wb-element"][data-type="note"]')).toHaveAttribute("data-text", "Idee A");
    await expect(page.locator('[data-testid="wb-element"][data-type="rect"]')).toHaveAttribute("data-text", "Besluit");
    await expect(page.locator('[data-testid="wb-element"][data-type="connector"]')).toHaveCount(1);

    // delete the note: the connector goes with it
    await page.getByTestId("wb-tool-select").click();
    await page.locator('[data-testid="wb-element"][data-type="note"]').click();
    await page.getByTestId("wb-delete").click();
    await expect(page.locator('[data-testid="wb-element"][data-type="note"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="wb-element"][data-type="connector"]')).toHaveCount(0);
    await expect(page.getByTestId("wb-save-state")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
    expect(errors).toEqual([]);
  });

  test("a second user sees new notes without a reload (polling) and edits do not clobber each other", async ({ page, browser, baseURL }) => {
    await login(page, "admin");
    const req = page.context().request;
    const wsList = (await (await req.get("/api/v1/workspaces")).json()) as { id: string; name: string }[];
    const wb = await (await req.post("/api/v1/whiteboards", { data: { workspaceId: wsList.find((w) => w.name === "Delivery")!.id, name: "Samen" } })).json();
    await page.goto(`/whiteboards/${wb.id}`);
    await expect(page.getByTestId("whiteboard-page")).toHaveAttribute("data-hydrated", "true");
    const other = await newUserPage(browser, baseURL, "pm1");
    await other.page.goto(`/whiteboards/${wb.id}`);
    await expect(other.page.getByTestId("whiteboard-page")).toHaveAttribute("data-hydrated", "true");

    await page.getByTestId("wb-tool-note").click();
    await page.getByTestId("wb-canvas").click({ position: { x: 300, y: 200 } });
    await page.getByTestId("wb-text-editor").fill("van Admin");
    await page.getByTestId("wb-canvas").click({ position: { x: 900, y: 600 } });

    await other.page.getByTestId("wb-tool-note").click();
    await other.page.getByTestId("wb-canvas").click({ position: { x: 600, y: 400 } });
    await other.page.getByTestId("wb-text-editor").fill("van Planner");
    await other.page.getByTestId("wb-canvas").click({ position: { x: 900, y: 600 } });

    for (const p of [page, other.page]) {
      await expect(p.locator('[data-testid="wb-element"][data-type="note"]')).toHaveCount(2, { timeout: 20_000 });
      await expect(p.locator('[data-testid="wb-element"][data-text="van Admin"]')).toHaveCount(1);
      await expect(p.locator('[data-testid="wb-element"][data-text="van Planner"]')).toHaveCount(1);
    }
    await other.context.close();
  });
});
