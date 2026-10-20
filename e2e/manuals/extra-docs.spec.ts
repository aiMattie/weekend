/** Screenshots for docs/handleiding/07-forms-en-docs.md (Docs + Whiteboards). Run: npm run manuals */
import path from "node:path";
import { boardIdByName, expect, login, resetDb, test } from "../fixtures";

const IMG = path.join(process.cwd(), "docs/handleiding/img");
const shot = (name: string) => path.join(IMG, `extra-docs-${name}.png`);

test.describe("manual: docs + whiteboard", () => {
  test.skip(!process.env.RUN_MANUALS, "manual screenshots only run with RUN_MANUALS=1");
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("docs", async ({ page }) => {
    await login(page, "admin");
    const req = page.context().request;
    const wsList = (await (await req.get("/api/v1/workspaces")).json()) as { id: string; name: string }[];
    const workspaceId = wsList.find((w) => w.name === "Delivery")!.id;
    await req.post("/api/v1/docs", { data: { workspaceId, title: "Kickoff Delta", markdown: "# Kickoff\n\nDoelen van de eerste maand.\n\n- [x] Toegang regelen\n- [ ] Eerste workshop plannen" } });
    await req.post("/api/v1/docs", { data: { workspaceId, title: "Werkafspraken", markdown: "We werken in sprints van twee weken." } });
    await page.goto("/docs");
    await expect(page.getByTestId("doc-card").first()).toBeVisible();
    await page.screenshot({ path: shot("overzicht") });

    await page.getByTestId("new-doc").click();
    await expect(page).toHaveURL(/\/docs\/\d+$/);
    await expect(page.getByTestId("doc-page")).toHaveAttribute("data-hydrated", "true");
    await page.getByTestId("doc-add-cover").click();
    await page.getByTestId("cover-color").first().click();
    await page.getByTestId("doc-title").fill("Projectplan Klanten");
    const editor = page.getByTestId("doc-editor");
    await editor.click();
    await page.keyboard.type("/kop 1");
    await page.getByTestId("slash-option").first().click();
    await page.keyboard.type("Aanpak");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Overleg met @Plan");
    await page.getByTestId("mention-option").first().click();
    await page.keyboard.type(" over de planning.");
    await page.keyboard.press("Enter");
    await page.getByTestId("doc-tb-tasks").click();
    await page.keyboard.type("Planning bevestigen");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Offerte versturen");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.getByTestId("doc-tb-table").click();
    await expect(page.getByTestId("doc-save-state")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
    await page.screenshot({ path: shot("editor") });

    await page.keyboard.press("Control+End");
    await page.getByTestId("doc-tb-embed-item").click();
    await page.getByTestId("embed-option").filter({ hasText: "Klanten" }).first().click();
    await page.getByTestId("embed-option").first().click();
    await editor.locator("p").first().hover();
    await page.getByTestId("block-comment-btn").click();
    await page.getByTestId("comment-input").fill("Is dit nog actueel? @Planner");
    await page.getByTestId("comment-submit").click();
    await expect(page.getByTestId("doc-comment")).toBeVisible();
    await expect(page.getByTestId("doc-save-state")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
    await page.screenshot({ path: shot("mention-embed") });
  });

  test("whiteboard", async ({ page }) => {
    await login(page, "admin");
    await boardIdByName(page.context().request, "Klanten");
    await page.goto("/whiteboards");
    await page.getByTestId("new-whiteboard").click();
    await expect(page).toHaveURL(/\/whiteboards\/\d+$/);
    await expect(page.getByTestId("whiteboard-page")).toHaveAttribute("data-hydrated", "true");
    await page.getByTestId("wb-name").fill("Sprint brainstorm");
    await page.getByTestId("wb-name").press("Enter");
    const canvas = page.getByTestId("wb-canvas");
    const place = async (tool: string, x: number, y: number, text: string, colorIdx = 0) => {
      await page.getByTestId(`wb-tool-${tool}`).click();
      await page.getByTestId("wb-color").nth(colorIdx).click();
      await page.getByTestId(`wb-tool-${tool}`).click();
      await canvas.click({ position: { x, y } });
      await page.getByTestId("wb-text-editor").fill(text);
      await canvas.click({ position: { x: 1000, y: 700 } });
    };
    await place("note", 380, 260, "Klantportaal bouwen", 0);
    await place("note", 380, 480, "Uren koppelen aan facturatie", 1);
    await place("rect", 820, 260, "Go/no-go op vrijdag", 2);
    await place("ellipse", 820, 480, "Demo bij klant", 3);
    await page.getByTestId("wb-tool-connector").click();
    const els = page.getByTestId("wb-element");
    const drag = async (a: number, b: number) => {
      const ba = (await els.nth(a).boundingBox())!;
      const bb = (await els.nth(b).boundingBox())!;
      await page.mouse.move(ba.x + ba.width / 2, ba.y + ba.height / 2);
      await page.mouse.down();
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 6 });
      await page.mouse.up();
    };
    await drag(0, 2);
    await page.getByTestId("wb-tool-connector").click();
    await drag(2, 4); // connectors render first, so element indices shift by one
    await page.getByTestId("wb-tool-select").click();
    await expect(page.getByTestId("wb-save-state")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
    await page.screenshot({ path: shot("whiteboard") });
  });
});
